/**
 * Vanilla-TS wrapper around CodeMirror 6 — no React imports here. The React
 * side mounts this once via a ref and talks to it through this small API
 * (see docs/STACK.md, "React, used thin").
 */
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  indentOnInput,
  bracketMatching,
} from "@codemirror/language";
import { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags } from "@lezer/highlight";

/** Editor chrome, tuned to the app's zinc palette. */
const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "transparent",
      color: "#e4e4e7",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
      lineHeight: "1.7",
    },
    ".cm-content": { padding: "16px", caretColor: "#ffffff" },
    ".cm-cursor": { borderLeftColor: "#ffffff" },
    "&.cm-focused": { outline: "none" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#3f3f46",
    },
    ".cm-activeLine": { backgroundColor: "rgba(39, 39, 42, 0.5)" },
  },
  { dark: true },
);

/** Markdown-first highlighting; fenced code falls back to standard tags. */
const highlight = HighlightStyle.define([
  { tag: tags.heading1, color: "#93c5fd", fontWeight: "bold", fontSize: "1.3em" },
  { tag: tags.heading2, color: "#93c5fd", fontWeight: "bold", fontSize: "1.15em" },
  { tag: tags.heading3, color: "#93c5fd", fontWeight: "bold" },
  { tag: tags.heading4, color: "#93c5fd", fontWeight: "bold" },
  { tag: tags.strong, color: "#fafafa", fontWeight: "bold" },
  { tag: tags.emphasis, color: "#fafafa", fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, color: "#86efac" },
  { tag: tags.link, color: "#7dd3fc" },
  { tag: tags.url, color: "#0284c7" },
  { tag: tags.quote, color: "#a1a1aa", fontStyle: "italic" },
  { tag: tags.contentSeparator, color: "#f59e0b" },
  { tag: tags.processingInstruction, color: "#71717a" },
  { tag: tags.meta, color: "#71717a" },
  // inside fenced code blocks
  { tag: tags.keyword, color: "#c4b5fd" },
  { tag: tags.string, color: "#86efac" },
  { tag: tags.comment, color: "#71717a", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#93c5fd" },
  { tag: [tags.number, tags.bool], color: "#fda4af" },
  { tag: tags.className, color: "#fcd34d" },
]);

export interface MarkdownEditorOptions {
  doc: string;
  onChange: (doc: string) => void;
  onBlur: () => void;
  /**
   * Called when the clipboard being pasted holds an image (a screenshot,
   * an image copied from a browser). Returning true consumes the paste —
   * the image bytes go through the figure-import flow instead of CodeMirror.
   */
  onPasteImage?: (image: File) => boolean;
}

export class MarkdownEditor {
  private view: EditorView;
  /**
   * Per-section editor states, so undo history survives switching sections
   * and coming back. Keyed by the caller's section key; a state is only
   * restored when its text still matches what the store hands over —
   * undoing into stale text (the file changed on disk meanwhile) would
   * resurrect overwritten content.
   */
  private readonly states = new Map<string, EditorState>();
  private currentKey: string | null = null;
  /**
   * Native (OS/WebView) spell check, switched to the report's language so a
   * Danish report is checked against the Danish dictionary. Lives in a
   * compartment so the language can be reconfigured without rebuilding state.
   */
  private readonly spellCheck = new Compartment();
  private lang = "en";
  /**
   * The user has actually put the cursor somewhere in this document — a
   * click, arrow key, typing, or a programmatic jump. Until then the
   * selection is just CodeMirror's default offset 0, and a toolbar insert
   * would land above the section's `# Title` heading.
   */
  private cursorPlaced = false;

  constructor(
    parent: HTMLElement,
    private readonly options: MarkdownEditorOptions,
  ) {
    this.view = new EditorView({ parent, state: this.createState(options.doc) });
  }

  /** `spellcheck`/`lang` attributes on the editable content — the WebView's
   *  native spell checker reads these to pick the dictionary. */
  private spellCheckAttrs() {
    return EditorView.contentAttributes.of({ spellcheck: "true", lang: this.lang });
  }

  /**
   * Point spell check at the report's language (BCP-47, e.g. "en"/"da"). The
   * live state reconfigures in place; freshly created states already pick up
   * the new value through `createState`.
   */
  setLanguage(lang: string): void {
    if (lang === this.lang) return;
    this.lang = lang;
    this.view.dispatch({ effects: this.spellCheck.reconfigure(this.spellCheckAttrs()) });
  }

  private createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(highlight, { fallback: true }),
        this.spellCheck.of(this.spellCheckAttrs()),
        keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.options.onChange(update.state.doc.toString());
          // Only user-driven events count — the auto-focus on section switch
          // and programmatic setState must not make offset 0 look chosen.
          if (
            update.transactions.some(
              (tr) =>
                tr.isUserEvent("select") || tr.isUserEvent("input") || tr.isUserEvent("delete"),
            )
          ) {
            this.cursorPlaced = true;
          }
        }),
        EditorView.domEventHandlers({
          blur: () => this.options.onBlur(),
          paste: (event) => {
            const handler = this.options.onPasteImage;
            if (!handler) return false;
            for (const item of event.clipboardData?.items ?? []) {
              if (!item.type.startsWith("image/")) continue;
              const image = item.getAsFile();
              // An image wins over any accompanying text/html rendition
              // (copying an image from a browser carries both).
              if (image && handler(image)) {
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
        }),
      ],
    });
  }

  /** Replace the document in place (external change to the same section) — fresh undo history. */
  setDoc(doc: string): void {
    this.view.setState(this.createState(doc));
    if (this.currentKey !== null) this.states.delete(this.currentKey);
    this.cursorPlaced = false;
  }

  /**
   * Switch to a different section: parks the current section's editor state
   * (undo history, cursor, scroll anchor) under its key and restores the new
   * section's parked state when its text is still current. Undo history
   * never crosses section files — a missing or stale park starts fresh.
   */
  switchTo(key: string | null, doc: string): void {
    if (this.currentKey !== null) this.states.set(this.currentKey, this.view.state);
    if (this.states.size > 64) this.states.clear(); // bound long-session growth
    const parked = key === null ? undefined : this.states.get(key);
    const restored = parked !== undefined && parked.doc.toString() === doc;
    this.view.setState(restored ? parked : this.createState(doc));
    // A parked state carries the language it had when parked — reapply the
    // current one in case the report's language changed meanwhile.
    if (restored) {
      this.view.dispatch({ effects: this.spellCheck.reconfigure(this.spellCheckAttrs()) });
    }
    // A restored park carries the cursor the user left there; a fresh state
    // sits at CodeMirror's default offset 0, which nobody chose.
    this.cursorPlaced = restored;
    this.currentKey = key;
  }

  getDoc(): string {
    return this.view.state.doc.toString();
  }

  /** Current cursor position (selection head) as a character offset. */
  cursorOffset(): number {
    return this.view.state.selection.main.head;
  }

  /**
   * Insert block-level Markdown at the cursor as its own paragraph: a blank
   * line on each side, however the cursor sits in existing text. (Pandoc only
   * turns an image into a captioned figure when it is alone in a paragraph.)
   * `cursorAt` places the cursor that many characters into the inserted
   * text — e.g. just after a code fence so the language can be typed.
   */
  insertBlock(text: string, cursorAt?: number): void {
    const state = this.view.state;
    const { from, to } = this.insertRange();
    const doc = state.doc;
    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);
    const before = startLine.text.slice(0, from - startLine.from);
    const after = endLine.text.slice(to - endLine.from);
    const prevLineBlank =
      startLine.number === 1 || doc.line(startLine.number - 1).text.trim() === "";
    const prefix =
      before.trim() !== "" ? "\n\n" : before !== "" || !prevLineBlank ? "\n" : "";
    const suffix = after.trim() !== "" ? "\n\n" : "\n";
    this.view.dispatch({
      changes: { from, to, insert: `${prefix}${text}${suffix}` },
      selection: { anchor: from + prefix.length + (cursorAt ?? text.length) },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    this.cursorPlaced = true; // the cursor now sits meaningfully after the insert
    this.view.focus();
  }

  /**
   * Where a toolbar insert goes: the selection once the user has placed a
   * cursor, the end of the document before that (never above the heading).
   */
  private insertRange(): { from: number; to: number } {
    const { selection, doc } = this.view.state;
    const { from, to } = selection.main;
    if (!this.cursorPlaced && from === 0 && to === 0) {
      return { from: doc.length, to: doc.length };
    }
    return { from, to };
  }

  /** Replace a document range (e.g. a re-formatted table) and focus. */
  applyEdit(from: number, to: number, text: string): void {
    this.view.dispatch({ changes: { from, to, insert: text } });
    this.view.focus();
  }

  /** Insert inline text at the cursor (replacing any selection) and focus. */
  insertInline(text: string): void {
    const { from, to } = this.insertRange();
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    this.cursorPlaced = true;
    this.view.focus();
  }

  /** Select a range, scroll it into view, and focus the editor. */
  select(from: number, to: number): void {
    const length = this.view.state.doc.length;
    const anchor = Math.min(from, length);
    const head = Math.min(to, length);
    this.view.dispatch({
      selection: { anchor, head },
      effects: EditorView.scrollIntoView(anchor, { y: "center" }),
    });
    this.cursorPlaced = true; // a TODO/search jump is a deliberate position
    this.view.focus();
  }

  focus(): void {
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
