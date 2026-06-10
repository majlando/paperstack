import { describe, expect, it } from "vitest";
import { extractMermaidBlocks, hashDiagram, sweepStaleRenders } from "./mermaid.ts";
import { FakePlatform } from "../platform/fake-platform.ts";

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

describe("sweepStaleRenders", () => {
  it("deletes only unreferenced hash-named SVGs, never user files", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/p/diagrams/rendered/00000000.svg", "<svg/>"], // stale render
        ["/p/diagrams/rendered/2e06c61f.svg", "<svg/>"], // still referenced
        ["/p/diagrams/rendered/hand-made.svg", "<svg/>"], // not ours
        ["/p/diagrams/rendered/notes.txt", "x"],
      ]),
    );
    await sweepStaleRenders(platform, "/p", new Set(["diagrams/rendered/2e06c61f.svg"]));

    expect(platform.files.has("/p/diagrams/rendered/00000000.svg")).toBe(false);
    expect(platform.files.has("/p/diagrams/rendered/2e06c61f.svg")).toBe(true);
    expect(platform.files.has("/p/diagrams/rendered/hand-made.svg")).toBe(true);
    expect(platform.files.has("/p/diagrams/rendered/notes.txt")).toBe(true);
  });

  it("is a no-op when nothing has been rendered yet", async () => {
    const platform = new FakePlatform();
    await expect(sweepStaleRenders(platform, "/p", new Set())).resolves.toBeUndefined();
  });
});
