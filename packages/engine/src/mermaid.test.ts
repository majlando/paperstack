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

  it("leaves prose that mentions ```mermaid mid-line alone", () => {
    const markdown = "Fences like ```mermaid\nstart a diagram block\n``` in Markdown.";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(0);
    expect(replaced).toBe(markdown);
  });

  it("does not treat other languages with a mermaid prefix as mermaid", () => {
    const markdown = "```mermaid-style\nnot a diagram\n```";
    const { blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(0);
  });

  it("accepts an info string and CRLF line endings", () => {
    const markdown = "```mermaid layout\r\nflowchart TD\r\n    A --> B\r\n```\r\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(1);
    // line endings are normalized so CRLF and LF checkouts hash identically
    expect(blocks[0]?.code).toBe("flowchart TD\n    A --> B");
    expect(replaced).not.toContain("```");
  });

  it("matches fences indented inside lists", () => {
    const markdown = "- step\n  ```mermaid\n  A --> B\n  ```\n";
    const { blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.code).toBe("A --> B");
  });

  it("hashes are stable and content-sensitive", () => {
    expect(hashDiagram("a --> b")).toBe(hashDiagram("a --> b"));
    expect(hashDiagram("a --> b")).not.toBe(hashDiagram("a --> c"));
  });
});
