import { describe, expect, it } from "vitest";
import { newSectionFile } from "./new-section-file.ts";
import type { Section } from "./schema.ts";

const s = (file: string, role: Section["role"]): Section => ({ file, role });

describe("newSectionFile", () => {
  it("continues the numbered sequence in the folder its role lives in", () => {
    const sections = [
      s("sections/01-introduction.md", "body"),
      s("sections/02-analysis.md", "body"),
      s("sections/03-references.md", "back-matter"),
    ];
    expect(newSectionFile(sections, "body", "Design")).toBe("sections/04-design.md");
  });

  it("follows a flat layout: sections at the project root stay at the root", () => {
    const sections = [s("01-introduction.md", "body"), s("02-analysis.md", "body")];
    expect(newSectionFile(sections, "body", "Design")).toBe("03-design.md");
  });

  it("falls back to sections/ and appendices/ in an empty role group", () => {
    const sections = [s("sections/01-introduction.md", "body")];
    expect(newSectionFile([], "body", "Intro")).toBe("sections/01-intro.md");
    expect(newSectionFile(sections, "appendix", "Survey")).toBe(
      "appendices/appendix-a-survey.md",
    );
  });

  it("letters appendices after the highest letter in use", () => {
    const sections = [
      s("appendices/appendix-a-survey.md", "appendix"),
      s("appendices/appendix-c-data.md", "appendix"),
    ];
    expect(newSectionFile(sections, "appendix", "Code")).toBe(
      "appendices/appendix-d-code.md",
    );
  });

  it("continues past z with aa, ab — letters never clamp", () => {
    expect(
      newSectionFile([s("appendices/appendix-z-last.md", "appendix")], "appendix", "More"),
    ).toBe("appendices/appendix-aa-more.md");
    expect(
      newSectionFile([s("appendices/appendix-aa-more.md", "appendix")], "appendix", "Extra"),
    ).toBe("appendices/appendix-ab-extra.md");
  });

  it("ignores appendix-like filenames in other roles when lettering", () => {
    // A body section named appendix-b-… must not consume the letter "b".
    const sections = [
      s("sections/appendix-b-evaluation.md", "body"),
      s("sections/01-introduction.md", "body"),
    ];
    expect(newSectionFile(sections, "appendix", "Survey")).toBe(
      "appendices/appendix-a-survey.md",
    );
  });

  it("slugifies Danish names", () => {
    expect(newSectionFile([], "body", "Løsning & Design")).toBe(
      "sections/01-loesning-design.md",
    );
  });
});
