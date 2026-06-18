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

  it("reads a quoted caption from the fence and emits a captioned figure image", () => {
    const markdown = '```mermaid "System architecture"\nflowchart TD\n    A --> B\n```';
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks[0]?.caption).toBe("System architecture");
    expect(replaced).toContain(`![System architecture](/diagrams/rendered/${blocks[0]?.hash}.svg)`);
  });

  it("treats a bare (unquoted) info string as a Mermaid hint, not a caption", () => {
    const { blocks } = extractMermaidBlocks("```mermaid layout\nflowchart TD\n    A --> B\n```");
    expect(blocks[0]?.caption).toBeNull();
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

  it("keeps the fence's indentation so a diagram in a list stays in the list", () => {
    const markdown = "- step\n  ```mermaid\n  A --> B\n  ```\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(replaced).toContain(`  ![](/diagrams/rendered/${blocks[0]?.hash}.svg)`);
  });

  it("does not extract a mermaid example shown inside another code block", () => {
    const markdown =
      "Diagrams are written like this:\n\n````markdown\n```mermaid\nA --> B\n```\n````\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(0);
    expect(replaced).toBe(markdown);
  });

  it("does not extract a mermaid example inside a tilde fence", () => {
    const markdown = "~~~\n```mermaid\nA --> B\n```\n~~~\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(0);
    expect(replaced).toBe(markdown);
  });

  it("still extracts a real diagram after an enclosing fence has closed", () => {
    const markdown = "````\n```mermaid\nshown, not drawn\n```\n````\n\n```mermaid\nA --> B\n```\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.code).toBe("A --> B");
    expect(replaced).toContain("shown, not drawn");
  });

  it("extracts four-backtick and tilde fences like the preview does", () => {
    // The preview renders any code block whose language is mermaid — fence
    // length and character must not silently diverge into a code listing.
    const four = "````mermaid\nA --> B\n````\n";
    expect(extractMermaidBlocks(four).blocks[0]?.code).toBe("A --> B");

    const tilde = "~~~mermaid\nA --> B\n~~~\n";
    expect(extractMermaidBlocks(tilde).blocks[0]?.code).toBe("A --> B");

    // a longer close also closes (CommonMark), and ``` lines survive inside
    const nested = "````mermaid\nA --> B\n```\nB --> C\n`````\n";
    expect(extractMermaidBlocks(nested).blocks[0]?.code).toBe("A --> B\n```\nB --> C");
  });

  it("extracts a uniformly quoted fence, keeping the diagram in the quote", () => {
    const markdown = "> intro\n> ```mermaid\n> A --> B\n> ```\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.code).toBe("A --> B"); // markers stripped, like the preview
    const lines = replaced.split("\n");
    expect(lines).toHaveLength(markdown.split("\n").length); // line count kept
    expect(lines[0]).toBe("> intro");
    expect(lines[1]).toBe(">"); // block separation inside the quote
    expect(lines[2]).toBe(`> ![](/diagrams/rendered/${blocks[0]?.hash}.svg)`);
    expect(lines[3]).toBe(">"); // padding stays a quote line
  });

  it("leaves a lazily quoted fence alone (preview may differ; never silently)", () => {
    const markdown = "> ```mermaid\nA --> B\n> ```\n";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(blocks).toHaveLength(0);
    expect(replaced).toBe(markdown);
  });

  it("keeps the replacement a block of its own next to unpadded text", () => {
    // A fence interrupts a paragraph (no blank lines needed); the image
    // replacement must not merge into the neighbouring text as an inline
    // image when the author wrote the fence flush against it.
    const markdown = "```mermaid\nA --> B\n```\nFigure text follows.";
    const { markdown: replaced, blocks } = extractMermaidBlocks(markdown);
    expect(replaced).toBe(
      `![](/diagrams/rendered/${blocks[0]?.hash}.svg)\n\n\nFigure text follows.`,
    );

    const above = "Text above.\n```mermaid\nA --> B\n```";
    const r2 = extractMermaidBlocks(above);
    expect(r2.markdown).toBe(
      `Text above.\n\n![](/diagrams/rendered/${r2.blocks[0]?.hash}.svg)\n`,
    );
  });

  it("preserves the section's total line count (converter errors name real lines)", () => {
    const markdown = "intro\n\n```mermaid\nA --> B\nB --> C\n```\n\n$\\badmath$ on line 8";
    const { markdown: replaced } = extractMermaidBlocks(markdown);
    expect(replaced.split("\n")).toHaveLength(markdown.split("\n").length);
    expect(replaced.split("\n")[7]).toBe("$\\badmath$ on line 8");
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
