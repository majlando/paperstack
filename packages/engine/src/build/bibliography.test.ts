import { describe, expect, it } from "vitest";
import { bibliographyKeys, parseBibliography } from "./bibliography.ts";

const BIB = `% references for the demo report
@book{knuth84,
  title     = {The {TeX}book},
  author    = {Donald E. Knuth},
  year      = 1984,
  publisher = {Addison-Wesley}
}

@online{typst-docs,
  title = "Typst Documentation",
  url   = {https://typst.app/docs/},
  date  = {2026-01-15}
}

@comment{not an entry}

@article{nested,
  title = {Braces {keep} their {Content}},
  year  = {2020},
}
`;

describe("parseBibliography", () => {
  it("reads keys, types, and the display fields", () => {
    const entries = parseBibliography(BIB);
    expect(entries.map((e) => e.key)).toEqual(["knuth84", "typst-docs", "nested"]);
    expect(entries[0]).toEqual({
      key: "knuth84",
      type: "book",
      title: "The TeXbook",
      author: "Donald E. Knuth",
      year: "1984",
    });
  });

  it("reads quoted values and derives year from a date field", () => {
    const online = parseBibliography(BIB)[1]!;
    expect(online.title).toBe("Typst Documentation");
    expect(online.year).toBe("2026");
  });

  it("strips nested braces and skips @comment blocks", () => {
    const nested = parseBibliography(BIB)[2]!;
    expect(nested.title).toBe("Braces keep their Content");
  });

  it("tolerates malformed input without throwing", () => {
    expect(parseBibliography("@book{broken")).toEqual([]);
    expect(parseBibliography("just prose, no entries")).toEqual([]);
    expect(parseBibliography("")).toEqual([]);
  });

  it("bibliographyKeys returns the key set", () => {
    expect(bibliographyKeys(BIB)).toEqual(new Set(["knuth84", "typst-docs", "nested"]));
  });
});
