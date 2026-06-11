/**
 * Markdown → Typst emitter built on remark (unified/mdast) — Paperstack's own
 * converter, replacing the Pandoc sidecar (docs/DEVELOPMENT.md, Milestone 5).
 *
 * The output deliberately mirrors pandoc 3.6.3's typst writer with the flags
 * the builder uses (`-f gfm+implicit_figures+attributes -t typst --wrap=none`)
 * so parity is measurable against the committed golden files in
 * fixtures/golden-typst/. Known, deliberate divergences are documented in
 * ./remark-typst-parity.md.
 *
 * markdownToTypst is a pure function: markdown in, Typst out. Relative image
 * paths are resolved to root-absolute project paths against sectionDir, the
 * same way PandocConverter's rewriteImagePaths post-pass does.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type {
  Code,
  Definition,
  FootnoteDefinition,
  Heading,
  Image,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from "mdast";
import { PaperstackError } from "../errors.ts";
import { resolveProjectPath } from "../project/paths.ts";
import { escapeTypstString } from "./assembler.ts";
import type { Converter } from "./converter.ts";
import { latexToTypstMath } from "./typst-math.ts";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

export interface RemarkConverterOptions {
  /**
   * Keys of the project's references.bib. When set, `[@key]` spans become
   * Typst #cite calls (validated against these keys); when absent, they
   * stay prose — citations only activate for projects with a bibliography.
   */
  citationKeys?: ReadonlySet<string>;
}

export class RemarkConverter implements Converter {
  constructor(private readonly options: RemarkConverterOptions = {}) {}

  async toTypst(markdown: string, sectionDir: string): Promise<string> {
    try {
      return markdownToTypst(markdown, sectionDir, this.options);
    } catch (error) {
      if (error instanceof PaperstackError) throw error;
      throw new PaperstackError(
        "convert-failed",
        "A section could not be prepared for the report. Check it for unusual Markdown and try again.",
        String(error),
      );
    }
  }
}

export function markdownToTypst(
  markdown: string,
  sectionDir: string,
  options: RemarkConverterOptions = {},
): string {
  const root = parser.parse(markdown);
  const ctx: Ctx = {
    sectionDir,
    source: markdown,
    citationKeys: options.citationKeys ?? null,
    usedSlugs: new Set(),
    footnotes: new Map(),
    definitions: new Map(),
  };
  collectDefinitions(root, ctx);
  return `${renderBlocks(root.children, ctx)}\n`;
}

interface Ctx {
  readonly sectionDir: string;
  /** The Markdown being converted — for re-reading raw spans (image alt). */
  readonly source: string;
  /** references.bib keys, or null when the project has no bibliography. */
  readonly citationKeys: ReadonlySet<string> | null;
  /** Heading label slugs already taken (GitHub-style dedup with -1, -2, …). */
  readonly usedSlugs: Set<string>;
  readonly footnotes: Map<string, FootnoteDefinition>;
  readonly definitions: Map<string, Definition>;
}

function collectDefinitions(node: unknown, ctx: Ctx): void {
  if (node === null || typeof node !== "object") return;
  const n = node as { type?: string; children?: unknown[] };
  if (n.type === "footnoteDefinition") {
    const def = node as FootnoteDefinition;
    ctx.footnotes.set(def.identifier, def);
  } else if (n.type === "definition") {
    const def = node as Definition;
    ctx.definitions.set(def.identifier, def);
  }
  if (Array.isArray(n.children)) {
    for (const child of n.children) collectDefinitions(child, ctx);
  }
}

// ---------------------------------------------------------------------------
// Text escaping
// ---------------------------------------------------------------------------

/** Characters pandoc's typst writer always backslash-escapes in plain text. */
const ESCAPED = new Set([..."\\#$*@<>[]_`\"'~"]);

/**
 * Escapes plain text for Typst markup, matching pandoc's typst writer:
 * whitespace runs collapse to a single space (--wrap=none), Typst-special
 * characters are backslash-escaped, `//` would start a Typst comment so both
 * slashes are escaped, and a few typographic characters are rewritten to the
 * Typst markup that re-renders them (en/em dash, curly apostrophe, nbsp).
 */
export function escapeTypstText(value: string): string {
  const s = value.replace(/[ \t\r\n]+/g, " ");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (ESCAPED.has(c)) out += `\\${c}`;
    else if (c === "/") out += s[i + 1] === "/" || s[i - 1] === "/" ? "\\/" : "/";
    else if (c === " ") out += "~"; // no-break space
    else if (c === "’") out += "'";
    else if (c === "–") out += "--";
    else if (c === "—") out += "---";
    else out += c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

/**
 * A rendered inline node. `hashCall` marks output that ends in a Typst code
 * call (`#emph[…]`, `#link(…)`, `#raw(…)`, …): pandoc terminates those with
 * `;` whenever the next character is not whitespace, because e.g. a following
 * `.` would otherwise be parsed as a field access on the call's result.
 */
interface InlinePart {
  text: string;
  hashCall: boolean;
}

/** An inline node plus any `{width=… height=… #id}` attributes parsed for it. */
interface Prepared {
  node: PhrasingContent;
  attrs?: ImageAttrs;
}

interface ImageAttrs {
  id?: string;
  width?: string;
  height?: string;
}

/**
 * Pairs each image with a trailing `{…}` attribute block, if present.
 * remark has no "attributes" extension, so `![alt](x.png){width=62%}` parses
 * as an image followed by literal text — this re-implements pandoc's
 * `attributes` extension for the image case Paperstack documents.
 */
function prepareInlines(children: readonly PhrasingContent[]): Prepared[] {
  const out: Prepared[] = [];
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    if (node.type === "image" || node.type === "imageReference") {
      const next = children[i + 1];
      if (next?.type === "text") {
        const m = /^\{([^{}]*)\}/.exec(next.value);
        if (m) {
          out.push({ node, attrs: parseImageAttrs(m[1]!) });
          const rest = next.value.slice(m[0].length);
          if (rest !== "") out.push({ node: { type: "text", value: rest } });
          i++;
          continue;
        }
      }
    }
    out.push({ node });
  }
  return out;
}

function parseImageAttrs(source: string): ImageAttrs {
  const attrs: ImageAttrs = {};
  for (const token of source.trim().split(/\s+/)) {
    if (token === "") continue;
    if (token.startsWith("#")) {
      attrs.id = token.slice(1);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq === -1) continue; // bare keys and .classes carry no meaning here
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1).replace(/^"(.*)"$/, "$1");
    if (key === "width") attrs.width = value;
    else if (key === "height") attrs.height = value;
  }
  return attrs;
}

/** `62%` → `62.0%`, `120px` → `1.25in` (96 px/in), `3cm` → `3cm` (as pandoc). */
function typstDimension(value: string): string | null {
  const m = /^([0-9]+(?:\.[0-9]+)?)\s*(%|px|cm|mm|in|pt|em)?$/.exec(value.trim());
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  const unit = m[2] ?? "px";
  if (unit === "%") return `${showDouble(n)}%`;
  if (unit === "px") return `${showDouble(n / 96)}in`;
  return `${m[1]}${unit}`;
}

/** Haskell `show`-style doubles, as pandoc prints them: 50 → "50.0". */
function showDouble(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

function renderInlines(children: readonly PhrasingContent[], ctx: Ctx): InlinePart {
  return joinParts(prepareInlines(children).map((p) => renderInline(p, ctx)));
}

function joinParts(parts: readonly (InlinePart | null)[]): InlinePart {
  let text = "";
  let trailingHashCall = false;
  for (const part of parts) {
    if (part === null || part.text === "") continue;
    if (trailingHashCall && !/^\s/.test(part.text)) text += ";";
    let t = part.text;
    // Dropped nodes (HTML comments) can leave a space on both neighbours —
    // pandoc's Space tokens never double up, so collapse the boundary.
    if (text.endsWith(" ")) t = t.replace(/^ +/, "");
    text += t;
    trailingHashCall = part.hashCall;
  }
  return { text, hashCall: trailingHashCall };
}

function renderInline(prepared: Prepared, ctx: Ctx): InlinePart | null {
  const node = prepared.node;
  switch (node.type) {
    case "text":
      return withLine(node, () => renderText(node.value, ctx));
    case "emphasis":
      return wrapInline("#emph", node.children, ctx);
    case "strong":
      return wrapInline("#strong", node.children, ctx);
    case "delete":
      return wrapInline("#strike", node.children, ctx);
    case "inlineCode":
      // Backticks inside the span cannot be expressed in `…` raw markup —
      // pandoc falls back to the #raw function with a string literal.
      if (node.value.includes("`")) {
        return { text: `#raw("${escapeTypstString(node.value)}")`, hashCall: true };
      }
      return { text: `\`${node.value}\``, hashCall: false };
    case "break":
      return { text: " \\\n", hashCall: false };
    // Images are hashCall: false — pandoc never `;`-terminates #box(image(…)),
    // not even mid-sentence before punctuation (probed; we mirror it exactly).
    case "image":
      return { text: `#box(${imageCall(node.url, prepared.attrs, ctx)})`, hashCall: false };
    case "imageReference": {
      const def = ctx.definitions.get(node.identifier);
      if (!def) return { text: escapeTypstText(node.alt ?? ""), hashCall: false };
      return { text: `#box(${imageCall(def.url, prepared.attrs, ctx)})`, hashCall: false };
    }
    case "link":
      return renderLink(node.url, node.children, ctx);
    case "linkReference": {
      const def = ctx.definitions.get(node.identifier);
      if (!def) return { text: renderInlines(node.children, ctx).text, hashCall: false };
      return renderLink(def.url, node.children, ctx);
    }
    case "footnoteReference": {
      const def = ctx.footnotes.get(node.identifier);
      const content = def
        ? renderBlocksFlagged(def.children, ctx)
        : { text: "", trailingHashCall: false };
      const body = content.trailingHashCall ? `${content.text};` : content.text;
      return { text: `#footnote[${body}]`, hashCall: true };
    }
    case "inlineMath":
      // `$x^2$` — LaTeX math (what KaTeX previews) translated to Typst math.
      // Stays inline even when written `$$…$$` on one line: remark-math
      // parses display math only from `$$` fences on their own lines, and
      // the preview must always show what the PDF will do.
      return withLine(node, () => ({
        text: `$${latexToTypstMath(node.value)}$`,
        hashCall: false,
      }));
    case "html":
      return null; // raw HTML (incl. comments) is dropped, like pandoc
    default:
      return { text: "", hashCall: false };
  }
}

/**
 * Runs a render step and stamps the node's source line onto any
 * PaperstackError it throws — "line 12: …" beats "somewhere in this
 * section" when the section is forty normalsider long. The builder
 * prepends the section file name.
 */
function withLine<T>(node: { position?: { start: { line: number } } }, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const line = node.position?.start.line;
    if (e instanceof PaperstackError && line !== undefined && !/^line \d+: /.test(e.userMessage)) {
      throw new PaperstackError(e.code, `line ${line}: ${e.userMessage}`, e.details);
    }
    throw e;
  }
}

/** A citation key as pandoc and Typst labels both accept it. */
const CITE_ITEM = /^@([A-Za-z0-9_][A-Za-z0-9_.:-]*)(?:\s*,\s*(.+))?$/;

/**
 * Plain text, with `[@key]` / `[@a; @b]` / `[@key, p. 12]` citation spans
 * turned into Typst #cite calls when the project has a references.bib.
 * Adjacent calls collapse into one bracket group ("[1, 2]") in the PDF.
 */
function renderText(value: string, ctx: Ctx): InlinePart {
  const keys = ctx.citationKeys;
  if (keys === null) return { text: escapeTypstText(value), hashCall: false };
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of value.matchAll(/\[@[^\]]*\]/g)) {
    const cite = renderCitationSpan(m[0], keys);
    if (cite === null) continue; // not citation syntax — stays prose
    if (m.index > last) {
      parts.push({ text: escapeTypstText(value.slice(last, m.index)), hashCall: false });
    }
    parts.push({ text: cite, hashCall: true });
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return { text: escapeTypstText(value), hashCall: false };
  if (last < value.length) {
    parts.push({ text: escapeTypstText(value.slice(last)), hashCall: false });
  }
  return joinParts(parts);
}

/** `[@a; @b, p. 12]` → cite calls, or null when it isn't citation syntax. */
function renderCitationSpan(span: string, keys: ReadonlySet<string>): string | null {
  const items = span.slice(1, -1).split(";").map((item) => CITE_ITEM.exec(item.trim()));
  if (items.some((m) => m === null)) return null;
  return items
    .map((m) => {
      const key = m![1]!;
      if (!keys.has(key)) {
        throw new PaperstackError(
          "citation-unknown",
          `The citation "@${key}" has no matching entry in references.bib. Check the key against the file.`,
          span,
        );
      }
      const locator = m![2];
      return locator === undefined
        ? `#cite(<${key}>)`
        : `#cite(<${key}>, supplement: [${escapeTypstText(locator)}])`;
    })
    .join("");
}

function wrapInline(fn: string, children: readonly PhrasingContent[], ctx: Ctx): InlinePart {
  return { text: `${fn}[${renderBracketBody(children, ctx)}]`, hashCall: true };
}

/** Content for a `[...]` body: a trailing hash call needs its `;` before `]`. */
function renderBracketBody(children: readonly PhrasingContent[], ctx: Ctx): string {
  const inner = renderInlines(children, ctx);
  return inner.hashCall ? `${inner.text};` : inner.text;
}

function renderLink(
  url: string,
  children: readonly PhrasingContent[],
  ctx: Ctx,
): InlinePart {
  if (url.startsWith("#")) {
    // Internal cross-reference: link to the Typst label, like pandoc.
    return {
      text: `#link(<${url.slice(1)}>)[${renderBracketBody(children, ctx)}]`,
      hashCall: true,
    };
  }
  const target = `"${escapeTypstString(url)}"`;
  const only = children.length === 1 ? children[0] : undefined;
  if (only?.type === "text" && only.value === url) {
    return { text: `#link(${target})`, hashCall: true }; // autolink: no body
  }
  return { text: `#link(${target})[${renderBracketBody(children, ctx)}]`, hashCall: true };
}

/**
 * The inline content of an image's description, with its markup intact.
 * mdast flattens the description to plain text (`alt` — backticks, emphasis
 * gone), but pandoc renders the full markup in figure captions, and code
 * spans in captions are everyday CS-report writing. The raw description is
 * still in the source — slice it back out via the node's position and
 * re-parse it as inlines. Returns null when the span cannot be recovered
 * (no position, unbalanced label, or it parses as anything but one
 * paragraph); callers fall back to the plain alt text.
 */
function altInlines(node: Image, ctx: Ctx): readonly PhrasingContent[] | null {
  const start = node.position?.start.offset;
  if (start === undefined || ctx.source.slice(start, start + 2) !== "![") return null;
  let depth = 0;
  for (let i = start + 2; i < ctx.source.length; i++) {
    const c = ctx.source[i];
    if (c === "\\") {
      i++; // an escaped character can never open or close the label
    } else if (c === "[") {
      depth++;
    } else if (c === "]") {
      if (depth > 0) {
        depth--;
        continue;
      }
      const root = parser.parse(ctx.source.slice(start + 2, i));
      const only = root.children.length === 1 ? root.children[0] : undefined;
      return only?.type === "paragraph" ? only.children : null;
    }
  }
  return null;
}

function imageCall(url: string, attrs: ImageAttrs | undefined, ctx: Ctx): string {
  let path = url;
  try {
    path = decodeURIComponent(url); // pandoc decodes %20 etc. in image paths
  } catch {
    // not percent-encoded — keep as written
  }
  if (!path.startsWith("/")) {
    path = resolveProjectPath(ctx.sectionDir, path, "image path");
  }
  const args = [`"${escapeTypstString(path)}"`];
  const height = attrs?.height === undefined ? null : typstDimension(attrs.height);
  const width = attrs?.width === undefined ? null : typstDimension(attrs.width);
  if (height !== null) args.push(`height: ${height}`);
  if (width !== null) args.push(`width: ${width}`);
  return `image(${args.join(", ")})`;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

interface BlockPart {
  text: string;
  /** Pandoc separates blocks with a blank line — except after a heading. */
  heading?: boolean;
  /** Whether the block's text ends in a hash call (see InlinePart.hashCall). */
  trailingHashCall?: boolean;
}

function renderBlocks(nodes: readonly RootContent[], ctx: Ctx): string {
  return renderBlocksFlagged(nodes, ctx).text;
}

function renderBlocksFlagged(
  nodes: readonly RootContent[],
  ctx: Ctx,
): { text: string; trailingHashCall: boolean } {
  let out = "";
  let afterHeading = false;
  let trailingHashCall = false;
  let first = true;
  for (const node of nodes) {
    const rendered = renderBlock(node, ctx);
    if (rendered === null) continue;
    if (!first) out += afterHeading ? "\n" : "\n\n";
    out += rendered.text;
    afterHeading = rendered.heading === true;
    trailingHashCall = rendered.trailingHashCall === true;
    first = false;
  }
  return { text: out, trailingHashCall };
}

function renderBlock(node: RootContent, ctx: Ctx): BlockPart | null {
  switch (node.type) {
    case "paragraph":
      return renderParagraph(node, ctx);
    case "heading":
      return { text: renderHeading(node, ctx), heading: true };
    case "code":
      return { text: renderCode(node) };
    case "list":
      return { text: renderList(node, ctx) };
    case "blockquote":
      return { text: `#quote(block: true)[\n${renderBlocks(node.children, ctx)}\n]` };
    case "table":
      return { text: renderTable(node, ctx) };
    case "thematicBreak":
      // Pandoc emits #horizontalrule, which only exists in its standalone
      // template — undefined in Paperstack's include-based builds. Emit the
      // same rule pandoc's template defines, inline (documented divergence).
      return { text: "#line(start: (25%, 0%), end: (75%, 0%))" };
    case "math":
      // `$$…$$` — display math: spaces inside the dollars make it a block.
      return withLine(node, () => ({ text: `$ ${latexToTypstMath(node.value)} $` }));
    case "html":
    case "definition":
    case "footnoteDefinition":
      return null;
    default:
      return null;
  }
}

function renderParagraph(node: Paragraph, ctx: Ctx): BlockPart | null {
  const prepared = prepareInlines(node.children);
  const visible = prepared.filter((p) => p.node.type !== "html");

  // implicit_figures: an image alone in a paragraph becomes a figure with the
  // alt text as caption (the Paperstack figure convention); an alt-less image
  // stays a plain #box image.
  if (visible.length === 1 && visible[0]!.node.type === "image") {
    const image = visible[0]!.node as Image;
    const attrs = visible[0]!.attrs;
    const call = imageCall(image.url, attrs, ctx);
    if (image.alt !== null && image.alt !== undefined && image.alt !== "") {
      const inlines = altInlines(image, ctx);
      // No `;` after a trailing hash call: the caption's `]` sits on its own
      // line, and pandoc only terminates calls before non-whitespace.
      const caption =
        inlines === null ? escapeTypstText(image.alt) : renderInlines(inlines, ctx).text;
      const label = attrs?.id === undefined ? "" : `\n<${attrs.id}>`;
      return {
        text: `#figure(${call},\n  caption: [\n    ${caption}\n  ]\n)${label}`,
      };
    }
    return { text: `#box(${call})` };
  }

  const inline = joinParts(prepared.map((p) => renderInline(p, ctx)));
  let text = inline.text;
  if (text.trim() === "") return null; // e.g. a paragraph that was only a comment
  // At the start of a line these would be Typst markup (heading, term list,
  // list items) — pandoc escapes `=` and `/` here; `-`/`+` added for safety.
  if (/^[=/+-]/.test(text)) text = `\\${text}`;
  return { text, trailingHashCall: inline.hashCall };
}

function renderHeading(node: Heading, ctx: Ctx): string {
  const content = renderInlines(node.children, ctx);
  const slug = githubSlug(plainText(node.children));
  let label = slug;
  if (ctx.usedSlugs.has(slug)) {
    let i = 1;
    while (ctx.usedSlugs.has(`${slug}-${i}`)) i++;
    label = `${slug}-${i}`;
  }
  ctx.usedSlugs.add(label);
  let text = `${"=".repeat(node.depth)} ${content.text}`;
  if (label !== "") text += `\n<${label}>`;
  return text;
}

/** GitHub's auto-identifier algorithm, as pandoc's gfm_auto_identifiers. */
function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
    .replace(/ /g, "-");
}

/** Plain-text content of inlines, for heading labels (includes image alt). */
function plainText(nodes: readonly PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode" || node.type === "inlineMath")
      out += node.value;
    else if (node.type === "image" || node.type === "imageReference") out += node.alt ?? "";
    else if (node.type === "break") out += " ";
    else if ("children" in node) out += plainText(node.children);
  }
  return out;
}

function renderCode(node: Code): string {
  const runs = node.value.match(/`+/g) ?? [];
  const fence = "`".repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
  return `${fence}${node.lang ?? ""}\n${node.value}\n${fence}`;
}

function renderList(node: List, ctx: Ctx): string {
  const loose = node.spread === true || node.children.some((c) => c.spread === true);
  const marker = node.ordered === true ? "+" : "-";
  const body = node.children
    .map((item) => renderListItem(item, marker, loose, ctx))
    .join(loose ? "\n\n" : "\n");
  const start = node.start ?? 1;
  if (node.ordered === true && start !== 1) {
    // Typst's `+` markers always count from 1 — pandoc wraps in a scoped
    // #set enum to keep the author's numbering.
    return `#block[\n#set enum(numbering: "1.", start: ${start})\n${body}\n]`;
  }
  return body;
}

function renderListItem(item: ListItem, marker: string, loose: boolean, ctx: Ctx): string {
  const parts: string[] = [];
  for (const child of item.children) {
    const rendered = renderBlock(child, ctx);
    if (rendered !== null) parts.push(rendered.text);
  }
  let body = parts.join(loose ? "\n\n" : "\n");
  if (item.checked === true) body = `☒ ${body}`;
  else if (item.checked === false) body = `☐ ${body}`;
  const lines = body.split("\n");
  const rest = lines.slice(1).map((line) => (line === "" ? line : `  ${line}`));
  return [`${marker} ${lines[0] ?? ""}`, ...rest].join("\n");
}

function renderTable(node: Table, ctx: Ctx): string {
  const [headerRow, ...bodyRows] = node.children;
  // Cells are `[...]` bodies, so a trailing hash call needs its `;` too.
  const headerCells =
    headerRow === undefined
      ? []
      : headerRow.children.map((cell) => renderBracketBody(cell.children, ctx));
  const aligns = (
    node.align !== null && node.align !== undefined && node.align.length > 0
      ? node.align
      : headerCells.map(() => null)
  ).map((a) => a ?? "auto");
  const columns = aligns.length;
  const pad = (cells: string[]): string[] => {
    while (cells.length < columns) cells.push("");
    return cells.slice(0, columns);
  };
  const lines: string[] = [];
  lines.push("#figure(");
  lines.push("  align(center)[#table(");
  lines.push(`    columns: ${columns},`);
  lines.push(`    align: (${aligns.join(",")},),`);
  lines.push(`    table.header(${pad(headerCells).map((c) => `[${c}]`).join(", ")},),`);
  lines.push("    table.hline(),");
  for (const row of bodyRows) {
    const cells = pad(row.children.map((cell) => renderBracketBody(cell.children, ctx)));
    lines.push(`    ${cells.map((c) => `[${c}]`).join(", ")},`);
  }
  lines.push("  )]");
  lines.push("  , kind: table");
  lines.push("  )");
  return lines.join("\n");
}
