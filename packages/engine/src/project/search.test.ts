import { describe, expect, it } from "vitest";
import { replaceContent, searchContent } from "./search.ts";

describe("searchContent", () => {
  it("finds case-insensitive matches with line, offset, and column", () => {
    const content = "# Title\n\nThe Cache layer.\ncache again";
    const matches = searchContent(content, "cache");
    expect(matches).toEqual([
      { line: 3, offset: 13, column: 4, preview: "The Cache layer." },
      { line: 4, offset: 26, column: 0, preview: "cache again" },
    ]);
    // offsets index back into the original content (what the editor selects)
    expect(content.slice(13, 18).toLowerCase()).toBe("cache");
  });

  it("reports multiple matches on one line", () => {
    const matches = searchContent("a b a", "a");
    expect(matches.map((m) => m.column)).toEqual([0, 4]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchContent("anything", "")).toEqual([]);
  });

  it("keeps offsets correct in CRLF files and strips \\r from previews", () => {
    const content = "first\r\nsecond match\r\n";
    const [m] = searchContent(content, "match");
    expect(m?.line).toBe(2);
    expect(m?.preview).toBe("second match");
    expect(content.slice(m!.offset, m!.offset + 5)).toBe("match");
  });

  it("matches never span lines", () => {
    expect(searchContent("end\nstart", "end\nstart")).toEqual([]);
  });
});

describe("replaceContent", () => {
  it("replaces every case-insensitive occurrence and reports the count", () => {
    expect(replaceContent("The Cache layer.\ncache again", "cache", "store")).toEqual({
      text: "The store layer.\nstore again",
      count: 2,
    });
  });

  it("leaves the text untouched when nothing matches", () => {
    const r = replaceContent("nothing here", "cache", "store");
    expect(r).toEqual({ text: "nothing here", count: 0 });
  });

  it("handles a replacement containing the query without looping", () => {
    expect(replaceContent("a a", "a", "aa")).toEqual({ text: "aa aa", count: 2 });
  });

  it("preserves CRLF line endings around replacements", () => {
    expect(replaceContent("one\r\ntwo\r\n", "two", "2").text).toBe("one\r\n2\r\n");
  });
});
