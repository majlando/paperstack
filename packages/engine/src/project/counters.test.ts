import { describe, expect, it } from "vitest";
import {
  applySectionContent,
  countAnslag,
  countTodos,
  findTodoOffsets,
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
});

describe("applySectionContent", () => {
  const base: ProjectCounts = {
    sections: [
      { file: "sections/01-a.md", role: "body", chars: 2400, normalsider: 1, todos: 0 },
      { file: "sections/02-b.md", role: "body", chars: 4800, normalsider: 2, todos: 1 },
      { file: "appendices/a.md", role: "appendix", chars: 100, normalsider: 100 / 2400, todos: 0 },
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
