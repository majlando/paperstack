import { describe, expect, it } from "vitest";
import {
  formatBibEntry,
  readBibRecords,
  removeBibEntry,
  upsertBibEntry,
} from "./bibliography-edit.ts";
import { bibliographyKeys } from "./bibliography.ts";

describe("formatBibEntry", () => {
  it("writes fields in conventional order, brace-wrapped, with a trailing newline", () => {
    expect(
      formatBibEntry({
        key: "knuth84",
        type: "Book",
        fields: [
          { name: "publisher", value: "Addison-Wesley" },
          { name: "title", value: "The TeXbook" },
          { name: "author", value: "Donald E. Knuth" },
          { name: "year", value: "1984" },
        ],
      }),
    ).toBe(
      "@book{knuth84,\n" +
        "  author = {Donald E. Knuth},\n" +
        "  title = {The TeXbook},\n" +
        "  year = {1984},\n" +
        "  publisher = {Addison-Wesley}\n" +
        "}\n",
    );
  });

  it("drops empty fields", () => {
    const out = formatBibEntry({
      key: "k",
      type: "misc",
      fields: [{ name: "title", value: "T" }, { name: "note", value: "  " }],
    });
    expect(out).not.toContain("note");
  });
});

describe("readBibRecords", () => {
  const BIB = `% example commented out
% @book{ignored, title = {Nope}}

@article{smith2020,
  author = {Jane Smith},
  title = {On Things},
  journal = {J. Things},
  year = {2020}
}

@online{typst,
  title = "Typst Docs",
  url = {https://typst.app/docs/}
}
`;

  it("reads only real entries, with all their fields in order", () => {
    const records = readBibRecords(BIB);
    expect(records.map((r) => r.key)).toEqual(["smith2020", "typst"]);
    expect(records[0]?.fields.map((f) => f.name)).toEqual(["author", "title", "journal", "year"]);
    expect(records[1]?.fields).toEqual([
      { name: "title", value: "Typst Docs" },
      { name: "url", value: "https://typst.app/docs/" },
    ]);
  });
});

describe("upsertBibEntry / removeBibEntry", () => {
  const BIB = `@article{smith2020,
  author = {Jane Smith},
  year = {2020}
}
`;

  it("appends a new entry, leaving existing ones intact", () => {
    const next = upsertBibEntry(BIB, {
      key: "knuth84",
      type: "book",
      fields: [{ name: "title", value: "The TeXbook" }],
    });
    expect(bibliographyKeys(next)).toEqual(new Set(["smith2020", "knuth84"]));
    expect(next).toContain("@article{smith2020,");
    expect(next.endsWith("}\n")).toBe(true);
  });

  it("replaces an entry with the same key in place", () => {
    const next = upsertBibEntry(BIB, {
      key: "smith2020",
      type: "article",
      fields: [{ name: "author", value: "J. Smith" }, { name: "title", value: "Revised" }],
    });
    expect(readBibRecords(next)).toHaveLength(1);
    expect(next).toContain("title = {Revised}");
    expect(next).not.toContain("Jane Smith");
  });

  it("removes an entry by key", () => {
    const twin = upsertBibEntry(BIB, { key: "k2", type: "misc", fields: [{ name: "title", value: "Two" }] });
    const next = removeBibEntry(twin, "smith2020");
    expect(bibliographyKeys(next)).toEqual(new Set(["k2"]));
    expect(next).not.toContain("smith2020");
  });
});
