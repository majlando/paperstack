import { describe, expect, it } from "vitest";
import { scanReferences } from "./reference-scan.ts";

/** Compact view of a token for assertions. */
const kinds = (s: string) => scanReferences(s).map((t) => t.kind);

describe("scanReferences", () => {
  it("classifies the three reference forms", () => {
    const t = scanReferences("see @fig:arch and [@knuth84] and @lamport94 [p. 3]");
    expect(t[0]).toMatchObject({ kind: "crossref", label: "fig:arch" });
    expect(t[1]).toMatchObject({ kind: "citation-bracketed", span: "[@knuth84]" });
    expect(t[2]).toMatchObject({ kind: "citation-narrative", key: "lamport94", locator: "p. 3" });
  });

  it("treats a bracketed [@fig:label] as a cross-reference, not a citation", () => {
    expect(scanReferences("(see [@fig:arch])")[0]).toMatchObject({
      kind: "crossref",
      label: "fig:arch",
    });
  });

  it("reports correct span offsets, so callers can splice exactly", () => {
    const text = "x @fig:arch y";
    const tok = scanReferences(text)[0]!;
    expect(text.slice(tok.index, tok.index + tok.length)).toBe("@fig:arch");
  });

  it("does not match an @ joined to a word or inside an email-like token", () => {
    expect(kinds("the user@knuth84 build")).toEqual([]);
    expect(kinds("ping @everyone")).toEqual(["citation-narrative"]); // bare, key resolved later
  });

  it("keeps a multi-key bracket span intact for the caller to split", () => {
    expect(scanReferences("[@a; @b, p. 12]")[0]).toMatchObject({
      kind: "citation-bracketed",
      span: "[@a; @b, p. 12]",
    });
  });
});
