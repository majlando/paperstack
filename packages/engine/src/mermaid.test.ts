import { describe, expect, it } from "vitest";
import { extractMermaidBlocks, hashDiagram } from "./mermaid.ts";

describe("extractMermaidBlocks", () => {
  it("replaces mermaid blocks with rendered-SVG image references", () => {
    const markdown = "Before.\n\n```mermaid\nflowchart TD\n    A --> B\n```\n\nAfter.";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.code).toBe("flowchart TD\n    A --> B");
    expect(replaced).not.toContain("```mermaid");
    expect(replaced).toContain(`![](/diagrams/rendered/${blocks[0]?.hash}.svg)`);
  });

  it("leaves other code blocks alone", () => {
    const markdown = "```python\nprint('hi')\n```";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(0);
    expect(replaced).toBe(markdown);
  });

  it("hashes are stable and content-sensitive", () => {
    expect(hashDiagram("a --> b")).toBe(hashDiagram("a --> b"));
    expect(hashDiagram("a --> b")).not.toBe(hashDiagram("a --> c"));
  });
});
