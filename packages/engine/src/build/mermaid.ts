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
const MERMAID_FENCE = /^[ \t]*```mermaid(?:[ \t][^\n]*)?\r?\n([\s\S]*?)^[ \t]*```[ \t]*\r?$/gm;

export function extractMermaidBlocks(markdown: string): MermaidExtraction {
  const blocks: MermaidBlock[] = [];
  const replaced = markdown.replace(
    MERMAID_FENCE,
    (_match, code: string) => {
      // Normalize line endings before hashing so CRLF and LF checkouts of the
      // same diagram map to the same rendered SVG file.
      const trimmed = code.replace(/\r\n?/g, "\n").trim();
      const hash = hashDiagram(trimmed);
      const renderedPath = `diagrams/rendered/${hash}.svg`;
      blocks.push({ code: trimmed, hash, renderedPath });
      // Root-absolute path; empty alt text = plain image, no forced caption.
      return `![](/${renderedPath})`;
    },
  );
  return { markdown: replaced, blocks };
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
