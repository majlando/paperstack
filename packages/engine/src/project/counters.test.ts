import { describe, expect, it } from "vitest";
import {
  applySectionContent,
  countAnslag,
  countTodos,
  findTodoOffsets,
  firstHeading,
  hashContent,
  imageSources,
  type ProjectCounts,
} from "./counters.ts";

describe("countAnslag", () => {
  it("counts plain characters", () => {
    expect(countAnslag("abcdef")).toBe(6);
  });

  it("strips HTML comments (authoring notes)", () => {
    expect(countAnslag("abc<!-- hidden note -->def")).toBe(6);
    expect(countAnslag("<!-- multi\nline\ncomment -->ab")).toBe(2);
  });

  it("strips carriage returns so CRLF and LF checkouts count the same", () => {
    expect(countAnslag("a\r\nb")).toBe(countAnslag("a\nb"));
  });

  it("counts code points, not UTF-16 units: an emoji is one anslag", () => {
    expect(countAnslag("🙂")).toBe(1);
    expect(countAnslag("a🙂b")).toBe(3);
  });
});

describe("applySectionContent", () => {
  const base: ProjectCounts = {
    sections: [
      { file: "sections/01-a.md", role: "body", title: "A", images: [], chars: 2400, normalsider: 1, todos: 0, hash: "0" },
      { file: "sections/02-b.md", role: "body", title: "B", images: [], chars: 4800, normalsider: 2, todos: 1, hash: "0" },
      { file: "appendices/a.md", role: "appendix", title: null, images: [], chars: 100, normalsider: 100 / 2400, todos: 0, hash: "0" },
    ],
    bodyChars: 7200,
    bodyNormalsider: 3,
    cap: 4,
    overCap: false,
    todosTotal: 1,
  };

  it("updates the changed section and the body totals", () => {
    const next = applySectionContent(base, "sections/01-a.md", "x".repeat(4800));
    expect(next.sections[0]?.chars).toBe(4800);
    expect(next.bodyChars).toBe(9600);
    expect(next.bodyNormalsider).toBe(4);
    expect(next.overCap).toBe(false);
  });

  it("flags over-cap and counts TODOs from the new content", () => {
    const next = applySectionContent(base, "sections/01-a.md", "x".repeat(7300) + "[TODO: y]");
    expect(next.overCap).toBe(true);
    expect(next.todosTotal).toBe(2);
  });

  it("appendix changes never affect the body total", () => {
    const next = applySectionContent(base, "appendices/a.md", "x".repeat(50_000));
    expect(next.bodyChars).toBe(7200);
    expect(next.overCap).toBe(false);
  });

  it("re-extracts the title, so a heading edit renames the sidebar entry live", () => {
    const next = applySectionContent(base, "sections/01-a.md", "# Renamed section\n\ntext");
    expect(next.sections[0]?.title).toBe("Renamed section");
    expect(next.sections[1]?.title).toBe("B");
  });

  it("re-extracts image sources, so the sidebar thumbnails track edits live", () => {
    const next = applySectionContent(base, "sections/01-a.md", "![a](../figures/x.png)\ntext");
    expect(next.sections[0]?.images).toEqual(["../figures/x.png"]);
    expect(next.sections[1]?.images).toEqual([]);
  });

  it("tracks the content hash of applied edits", () => {
    const next = applySectionContent(base, "sections/01-a.md", "new text");
    expect(next.sections[0]?.hash).toBe(hashContent("new text"));
    expect(next.sections[1]?.hash).toBe("0"); // untouched sections keep theirs
  });
});

describe("hashContent", () => {
  it("is stable, content-sensitive, and EOL-insensitive", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
    // a CRLF-rewriting git checkout must not read as "section changed"
    expect(hashContent("a\r\nb")).toBe(hashContent("a\nb"));
  });
});

describe("firstHeading", () => {
  it("returns the text of the first ATX heading", () => {
    expect(firstHeading("# Introduction\n\nBody text")).toBe("Introduction");
    expect(firstHeading("intro line\n\n## Deeper heading\n")).toBe("Deeper heading");
  });

  it("returns null when the file has no heading", () => {
    expect(firstHeading("just prose, no heading")).toBeNull();
    expect(firstHeading("")).toBeNull();
  });

  it("ignores # lines inside fenced code blocks", () => {
    expect(firstHeading("```sh\n# a shell comment\n```\n\n# Real title\n")).toBe("Real title");
    expect(firstHeading("~~~\n# only inside the fence\n~~~\n")).toBeNull();
  });

  it("only closes a fence with its own marker, so a ~~~ inside a ``` block is content", () => {
    expect(firstHeading("```\n~~~\n# inside the code block\n```\n\n# Real\n")).toBe("Real");
  });

  it("strips inline markup and closing hashes — the sidebar renders plain text", () => {
    expect(firstHeading("# **Results** and `findings` ##")).toBe("Results and findings");
    expect(firstHeading("#    spaced   ")).toBe("spaced");
  });

  it("strips underscore/link markup but keeps intraword underscores", () => {
    expect(firstHeading("# _Results_ of the study")).toBe("Results of the study");
    expect(firstHeading("# [Results](r.md) here")).toBe("Results here");
    expect(firstHeading("# the my_var helper")).toBe("the my_var helper");
  });

  it("keeps a trailing # that is not a space-separated ATX closing sequence", () => {
    expect(firstHeading("# C#")).toBe("C#");
    expect(firstHeading("# F# basics")).toBe("F# basics");
    expect(firstHeading("# Done ###")).toBe("Done");
  });

  it("does not treat #hashtag-style lines or empty headings as titles", () => {
    expect(firstHeading("#no-space\n\n# Real\n")).toBe("Real");
    expect(firstHeading("# \n")).toBeNull();
  });
});

describe("imageSources", () => {
  it("returns each image src in order, de-duplicated", () => {
    const md = "intro\n\n![one](../figures/a.png)\n\ntext ![two](/images/b.svg) more\n\n![dup](../figures/a.png)";
    expect(imageSources(md)).toEqual(["../figures/a.png", "/images/b.svg"]);
  });

  it("keeps the src verbatim and ignores any title", () => {
    expect(imageSources('![cap](/figures/c.png "a title")')).toEqual(["/figures/c.png"]);
    expect(imageSources("![cap](<../has space.png>)")).toEqual(["../has space.png"]);
  });

  it("skips images written inside code fences (those are samples, not figures)", () => {
    expect(imageSources("```md\n![x](/figures/in-code.png)\n```\n\n![real](/figures/real.png)")).toEqual([
      "/figures/real.png",
    ]);
  });

  it("returns an empty array when there are no images", () => {
    expect(imageSources("# Heading\n\njust prose")).toEqual([]);
  });
});

describe("countTodos", () => {
  it("counts [TODO markers", () => {
    expect(countTodos("[TODO: write intro]\nsome text\n[TODO later]")).toBe(2);
  });

  it("reports marker offsets for click-to-jump", () => {
    expect(findTodoOffsets("[TODO: a]\ntext\n[TODO: b]")).toEqual([0, 15]);
    expect(findTodoOffsets("only `[TODO]` in code")).toEqual([]);
  });

  it("ignores inline-code mentions like `[TODO]`", () => {
    expect(countTodos("we sweep `[TODO]` markers before hand-in")).toBe(0);
  });

  it("returns 0 for clean text", () => {
    expect(countTodos("nothing to do here")).toBe(0);
  });
});
