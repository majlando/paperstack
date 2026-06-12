/**
 * Mermaid handling: diagrams are pre-rendered to SVG files inside the project
 * (the app renders them on save; see docs/PROJECT.md decision 2). At export
 * time, every ```mermaid block is replaced by an image reference to its
 * rendered SVG, named by a content hash so stale renders are detected.
 *
 * FNV-1a is used instead of node:crypto so this module also runs in the
 * Tauri webview.
 */
import type { Platform } from "../platform/platform.ts";

export function hashDiagram(code: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface MermaidBlock {
  code: string;
  hash: string;
  /** Project-relative path of the rendered SVG. */
  renderedPath: string;
}

export interface MermaidExtraction {
  /** Markdown with each mermaid block replaced by an image reference. */
  markdown: string;
  blocks: MermaidBlock[];
}

/**
 * Fence matching mirrors what the preview's Markdown parser treats as a
 * Mermaid block: any fence of three-plus backticks or tildes whose info
 * string starts with exactly "mermaid" ("mermaid layout" counts;
 * "mermaid-x" does not), closed by a fence of the same character at least
 * as long — including fences indented in lists and fences written inside a
 * blockquote with uniform `>` markers. Prose that merely mentions
 * ```mermaid mid-line is left alone.
 */
interface FenceLine {
  /** Leading blockquote markers and indentation, verbatim. */
  prefix: string;
  /** Number of `>` markers in the prefix. */
  depth: number;
  marker: "`" | "~";
  length: number;
  /** The info string (text after the fence characters), trimmed. */
  info: string;
}

const MERMAID_INFO = /^mermaid(?:[ \t].*)?$/;
const QUOTE_MARKERS = /^(?:[ \t]*>)+[ \t]?/;

function parseFenceLine(line: string): FenceLine | null {
  const m = /^((?:[ \t]*>)*[ \t]*)(`{3,}|~{3,})(.*?)\r?$/.exec(line);
  if (m === null) return null;
  const prefix = m[1]!;
  return {
    prefix,
    depth: (prefix.match(/>/g) ?? []).length,
    marker: m[2]![0] as "`" | "~",
    length: m[2]!.length,
    info: m[3]!.trim(),
  };
}

function closesFence(line: string, open: FenceLine): boolean {
  const f = parseFenceLine(line);
  return (
    f !== null &&
    f.info === "" &&
    f.marker === open.marker &&
    f.length >= open.length &&
    f.depth === open.depth
  );
}

/** `>` markers at the start of the line (0 when not blockquoted). */
function quoteDepth(line: string): number {
  const markers = line.match(/^(?:[ \t]*>)+/)?.[0] ?? "";
  return (markers.match(/>/g) ?? []).length;
}

export function extractMermaidBlocks(markdown: string): MermaidExtraction {
  const blocks: MermaidBlock[] = [];
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const open = parseFenceLine(line);
    // A backtick fence cannot carry backticks in its info string (such a
    // line is inline code, not a fence) — same rule as the preview's parser.
    const isFence = open !== null && !(open.marker === "`" && open.info.includes("`"));
    if (isFence && MERMAID_INFO.test(open.info)) {
      let close = i + 1;
      while (close < lines.length && !closesFence(lines[close]!, open)) close++;
      const content = lines.slice(i + 1, close);
      // A blockquoted fence is only extracted when every diagram line keeps
      // the quote markers — anything lazier parses unpredictably and is
      // safer left alone.
      const uniformQuote =
        open.depth === 0 || content.every((l) => quoteDepth(l) === open.depth);
      if (close < lines.length && uniformQuote) {
        // Strip quote markers like the preview's parser does, and normalize
        // line endings before hashing so CRLF and LF checkouts of the same
        // diagram map to the same rendered SVG file.
        const stripped =
          open.depth === 0 ? content : content.map((l) => l.replace(QUOTE_MARKERS, ""));
        const code = stripped.join("\n").replace(/\r\n?/g, "\n").trim();
        const hash = hashDiagram(code);
        const renderedPath = `diagrams/rendered/${hash}.svg`;
        blocks.push({ code, hash, renderedPath });
        // Root-absolute path; empty alt text = plain image, no forced
        // caption. Keep the fence's prefix so a diagram in a list stays in
        // the list and one in a quote stays in the quote. The replacement
        // fills the fence's exact line count with blank padding (bare quote
        // markers inside a quote): a fence interrupts a paragraph but an
        // image line does not (it would render inline mid-sentence), and
        // the unchanged line count keeps converter "line N" errors pointing
        // at the author's real file.
        const fenceLines = close - i + 1;
        const blankLine = open.depth === 0 ? "" : open.prefix.replace(/[ \t]+$/, "");
        const replacement: string[] = [];
        const prev = out.length > 0 ? out[out.length - 1]! : "";
        if (/\S/.test(prev) && fenceLines >= 2) replacement.push(blankLine);
        replacement.push(`${open.prefix}![](/${renderedPath})`);
        while (replacement.length < fenceLines) replacement.push(blankLine);
        out.push(...replacement);
        i = close + 1;
        continue;
      }
      // Unclosed (or unevenly quoted) mermaid fence: leave it alone.
    } else if (isFence) {
      // A non-mermaid fence: copy it through verbatim up to its closing line,
      // so a ```mermaid example *shown inside* another code block is never
      // extracted (matching how the preview's CommonMark parser reads it).
      out.push(line);
      i++;
      while (i < lines.length && !closesFence(lines[i]!, open)) {
        out.push(lines[i]!);
        i++;
      }
      if (i < lines.length) {
        out.push(lines[i]!);
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return { markdown: out.join("\n"), blocks };
}

/**
 * Deletes rendered SVGs that no current diagram references (edited diagrams
 * change hash and leave their old render behind). Strictly limited to the
 * 8-hex-digit names this module generates — anything a user put in the
 * folder is never touched. Best-effort: a failed delete never fails a build.
 */
export async function sweepStaleRenders(
  platform: Platform,
  projectDir: string,
  /** Project-relative `renderedPath`s still referenced by some section. */
  keep: ReadonlySet<string>,
): Promise<void> {
  let entries: string[];
  try {
    entries = await platform.listDir(`${projectDir}/diagrams/rendered`);
  } catch {
    return; // no rendered diagrams yet
  }
  for (const name of entries) {
    if (!/^[0-9a-f]{8}\.svg$/.test(name)) continue;
    const rel = `diagrams/rendered/${name}`;
    if (keep.has(rel)) continue;
    await platform.removeFile(`${projectDir}/${rel}`).catch(() => {});
  }
}
