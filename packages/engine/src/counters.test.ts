import { describe, expect, it } from "vitest";
import { countAnslag, countTodos } from "./counters.ts";

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

describe("countTodos", () => {
  it("counts [TODO markers", () => {
    expect(countTodos("[TODO: write intro]\nsome text\n[TODO later]")).toBe(2);
  });

  it("ignores inline-code mentions like `[TODO]`", () => {
    expect(countTodos("we sweep `[TODO]` markers before hand-in")).toBe(0);
  });

  it("returns 0 for clean text", () => {
    expect(countTodos("nothing to do here")).toBe(0);
  });
});
