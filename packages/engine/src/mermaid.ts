/**
 * Mermaid handling: diagrams are pre-rendered to SVG files inside the project
 * (the app renders them on save; see docs/PROJECT.md decision 2). At export
 * time, every ```mermaid block is replaced by an image reference to its
 * rendered SVG, named by a content hash so stale renders are detected.
 *
 * FNV-1a is used instead of node:crypto so this module also runs in the
 * Tauri webview.
 */

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

export function extractMermaidBlocks(markdown: string): MermaidExtraction {
  const blocks: MermaidBlock[] = [];
  const replaced = markdown.replace(
    /```mermaid[^\n]*\r?\n([\s\S]*?)```/g,
    (_match, code: string) => {
      const trimmed = code.trim();
      const hash = hashDiagram(trimmed);
      const renderedPath = `diagrams/rendered/${hash}.svg`;
      blocks.push({ code: trimmed, hash, renderedPath });
      // Root-absolute path; empty alt text = plain image, no forced caption.
      return `![](/${renderedPath})`;
    },
  );
  return { markdown: replaced, blocks };
}
