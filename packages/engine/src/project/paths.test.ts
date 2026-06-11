import { describe, expect, it } from "vitest";
import { slugify } from "./paths.ts";

describe("slugify", () => {
  it("maps Danish letters and strips other diacritics", () => {
    expect(slugify("Løsning & Design")).toBe("loesning-design");
    expect(slugify("Påske café")).toBe("paaske-cafe");
  });

  it("slugs NFD input (macOS filenames) identically to NFC", () => {
    // macOS hands over decomposed filenames: å as "a" + U+030A (escapes
    // below keep the two forms from being editor-normalized into one).
    // The same file imported on Windows and macOS must land on the same
    // name in the group's shared repo.
    const nfc = "p\u00e5ske.png";
    const nfd = "pa\u030aske.png";
    expect(nfd).not.toBe(nfc); // the inputs really differ
    expect(slugify(nfd)).toBe(slugify(nfc));
    expect(slugify(nfd)).toBe("paaske-png");
  });

  it("falls back when nothing slug-safe remains", () => {
    expect(slugify("???")).toBe("section");
    expect(slugify("", "figure")).toBe("figure");
  });
});
