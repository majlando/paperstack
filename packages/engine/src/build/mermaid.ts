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
 * Matches what the preview's Markdown parser treats as a Mermaid block: a
 * fence line starting with exactly ```mermaid (an info string like
 * "mermaid layout" still counts; "mermaid-x" does not), closed by a ``` line.
 * Anchored to line starts so prose that merely mentions ```mermaid is left
 * alone, while indented fences (e.g. inside lists) still match.
 */
const MERMAID_OPEN = /^([ \t]*)```mermaid(?:[ \t][^\n]*)?\r?$/;
const MERMAID_CLOSE = /^[ \t]*```[ \t]*\r?$/;
/** Any other fence opener (longer backtick runs, tildes, other languages). */
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;

export function extractMermaidBlocks(markdown: string): MermaidExtraction {
  const blocks: MermaidBlock[] = [];
  const lines = markdown.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const mermaid = MERMAID_OPEN.exec(line);
    if (mermaid) {
      let close = i + 1;
      while (close < lines.length && !MERMAID_CLOSE.test(lines[close]!)) close++;
      if (close < lines.length) {
        // Normalize line endings before hashing so CRLF and LF checkouts of
        // the same diagram map to the same rendered SVG file.
        const code = lines.slice(i + 1, close).join("\n").replace(/\r\n?/g, "\n").trim();
        const hash = hashDiagram(code);
        const renderedPath = `diagrams/rendered/${hash}.svg`;
        blocks.push({ code, hash, renderedPath });
        // Root-absolute path; empty alt text = plain image, no forced
        // caption. Keep the fence's indentation so a diagram in a list stays
        // in the list. The replacement fills the fence's exact line count
        // with blank padding: a fence interrupts a paragraph but an image
        // line does not (it would render inline mid-sentence), and the
        // unchanged line count keeps converter "line N" errors pointing at
        // the author's real file.
        const fenceLines = close - i + 1;
        const replacement: string[] = [];
        const prev = out.length > 0 ? out[out.length - 1]! : "";
        if (/\S/.test(prev) && fenceLines >= 2) replacement.push("");
        replacement.push(`${mermaid[1]!}![](/${renderedPath})`);
        while (replacement.length < fenceLines) replacement.push("");
        out.push(...replacement);
        i = close + 1;
        continue;
      }
      // Unclosed mermaid fence: leave it alone, like the rest of the line.
    }
    const fence = !mermaid && FENCE_OPEN.exec(line);
    if (fence) {
      // A non-mermaid fence: copy it through verbatim up to its closing line,
      // so a ```mermaid example *shown inside* another code block is never
      // extracted (matching how the preview's CommonMark parser reads it).
      const marker = fence[1]![0]!;
      const minLen = fence[1]!.length;
      const closeRe = new RegExp(`^[ \\t]*\\${marker}{${minLen},}[ \\t]*\\r?$`);
      out.push(line);
      i++;
      while (i < lines.length && !closeRe.test(lines[i]!)) {
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
