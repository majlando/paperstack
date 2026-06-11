import { describe, expect, it } from "vitest";
import { formatTableAt, tableMarkdown } from "./format-table.ts";

describe("tableMarkdown", () => {
  it("generates a GFM skeleton with the requested shape", () => {
    expect(tableMarkdown(2, 3)).toBe(
      "|     |     |     |\n| --- | --- | --- |\n|     |     |     |\n|     |     |     |",
    );
  });

  it("clamps to at least one row and column", () => {
    expect(tableMarkdown(0, 0)).toBe("|     |\n| --- |\n|     |");
  });
});

describe("formatTableAt", () => {
  const messy = [
    "before",
    "| Case | Input | Expected |",
    "|---|:---:|----:|",
    "| Found |  `[1,2,3]`, 2 | 1 |",
    "| Not found | `[]`, 9 | -1 |",
    "after",
  ].join("\n");

  it("re-aligns every column to its widest cell, preserving alignment colons", () => {
    const edit = formatTableAt(messy, messy.indexOf("Found"))!;
    expect(edit.text).toBe(
      [
        "| Case      | Input        | Expected |",
        "| --------- | :----------: | -------: |",
        "| Found     | `[1,2,3]`, 2 | 1        |",
        "| Not found | `[]`, 9      | -1       |",
      ].join("\n"),
    );
    expect(messy.slice(0, edit.from)).toBe("before\n");
    expect(messy.slice(edit.to)).toBe("\nafter");
  });

  it("returns null outside a table or without a delimiter row", () => {
    expect(formatTableAt(messy, 2)).toBeNull(); // in "before"
    expect(formatTableAt("| a | b |\n| c | d |", 3)).toBeNull(); // no delimiter
    expect(formatTableAt("plain prose", 4)).toBeNull();
  });

  it("keeps escaped pipes inside cells intact", () => {
    const t = "| a \\| b | c |\n| --- | --- |\n| d | e |";
    const edit = formatTableAt(t, 0)!;
    expect(edit.text).toContain("| a \\| b | c   |");
  });

  it("preserves indentation and CRLF line endings", () => {
    const t = "  | a | b |\r\n  | --- | --- |\r\n  | long cell | x |\r\n";
    const edit = formatTableAt(t, 4)!;
    expect(edit.text.split("\r\n")).toEqual([
      "  | a         | b   |",
      "  | --------- | --- |",
      "  | long cell | x   |",
    ]);
  });

  it("pads ragged rows out to the widest row", () => {
    const t = "| a | b | c |\n| --- | --- |\n| only |";
    const edit = formatTableAt(t, 0)!;
    expect(edit.text.split("\n")).toEqual([
      "| a    | b   | c   |",
      "| ---- | --- | --- |",
      "| only |     |     |",
    ]);
  });
});
