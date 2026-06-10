/**
 * Vanilla-TS wrapper around CodeMirror 6 — no React imports here. The React
 * side mounts this once via a ref and talks to it through this small API
 * (see docs/STACK.md, "React, used thin").
 */
import { EditorState } from "@codemirror/state";
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
}

export class MarkdownEditor {
  private view: EditorView;

  constructor(
    parent: HTMLElement,
    private readonly options: MarkdownEditorOptions,
  ) {
    this.view = new EditorView({ parent, state: this.createState(options.doc) });
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
        keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.options.onChange(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          blur: () => this.options.onBlur(),
        }),
      ],
    });
  }

  /** Replace the document (e.g. switching sections) — fresh undo history. */
  setDoc(doc: string): void {
    this.view.setState(this.createState(doc));
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
    const { from, to } = state.selection.main;
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
    this.view.focus();
  }

  focus(): void {
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
