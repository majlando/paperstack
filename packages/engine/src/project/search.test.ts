import { describe, expect, it } from "vitest";
import { searchContent } from "./search.ts";

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
