import { describe, expect, it } from "vitest";
import {
  buildLengthLine,
  escapeTypstString,
  generateMainTypst,
  type ConvertedSection,
} from "./assembler.ts";
import type { DocumentMeta } from "../project/schema.ts";
import type { ProjectCounts } from "../project/counters.ts";

const meta = (over: Partial<DocumentMeta> = {}): DocumentMeta => ({
  title: "T",
  authors: [],
  language: "en",
  body_cap_normalsider: 40,
  sections: [{ file: "sections/01.md", role: "body" }],
  ...over,
});

const counts: ProjectCounts = {
  sections: [],
  bodyChars: 60000,
  bodyNormalsider: 25,
  cap: 40,
  overCap: false,
  todosTotal: 0,
};

describe("escapeTypstString", () => {
  it("escapes backslashes and quotes, backslashes first", () => {
    expect(escapeTypstString('a "b" c')).toBe('a \\"b\\" c');
    expect(escapeTypstString("a\\b")).toBe("a\\\\b");
    // a pre-escaped quote must not lose its backslash to double-escaping
    expect(escapeTypstString('\\"')).toBe('\\\\\\"');
  });

  it("passes plain text through", () => {
    expect(escapeTypstString("Søren's håndbog")).toBe("Søren's håndbog");
  });
});

describe("buildLengthLine", () => {
  // The cover-page length line is user-visible hand-in text: pin it exactly.
  it("formats the English line", () => {
    expect(buildLengthLine(meta(), counts)).toBe(
      "Length (body): 60,000 characters / 25.00 normalsider (cap: 40, 1 normalside = 2,400 characters)",
    );
  });

  it("formats the Danish line with Danish number conventions", () => {
    expect(buildLengthLine(meta({ language: "da" }), counts)).toBe(
      "Anslag (brødtekst): 60.000 / 25,00 normalsider (grænse: 40, 1 normalside = 2.400 anslag)",
    );
  });
});

describe("generateMainTypst", () => {
  const body = (path: string): ConvertedSection => ({ path, role: "body" });
  const plain = (path: string): ConvertedSection => ({ path, role: "front-matter" });
  const appendix = (path: string): ConvertedSection => ({ path, role: "appendix" });

  it("imports the template and includes sections in order", () => {
    const main = generateMainTypst(meta(), [body("/o/a.typ"), body("/o/b.typ")], "L");
    // the project-vendored template is the default; the builder may override
    expect(main).toContain(`#import "/paperstack-template.typ": report`);
    expect(main.indexOf(`#include "/o/a.typ"`)).toBeLessThan(
      main.indexOf(`#include "/o/b.typ"`),
    );
  });

  it("escapes include paths (a quote in a section filename is legal on macOS/Linux)", () => {
    const main = generateMainTypst(meta(), [body(`/o/a"b.typ`)], "L");
    expect(main).toContain(`#include "/o/a\\"b.typ"`);
  });

  it("escapes metadata that contains quotes and backslashes", () => {
    const main = generateMainTypst(
      meta({ title: 'Smart "Home" \\ Hub' }),
      [body("/o/a.typ")],
      'cap "40"',
    );
    expect(main).toContain(`title: "Smart \\"Home\\" \\\\ Hub",`);
    expect(main).toContain(`length-line: "cap \\"40\\"",`);
  });

  it("omits optional metadata that is absent", () => {
    const main = generateMainTypst(meta(), [body("/o/a.typ")], "L");
    expect(main).not.toContain("subtitle:");
    expect(main).not.toContain("course:");
    expect(main).not.toContain("logo:");
    expect(main).not.toContain("authors:");
    expect(main).not.toContain("date:");
  });

  it("renders authors with and without student ids as a Typst array", () => {
    const main = generateMainTypst(
      meta({ authors: [{ name: "Ann", student_id: "123" }, { name: "Bo", student_id: undefined }] }),
      [body("/o/a.typ")],
      "L",
    );
    expect(main).toContain(`authors: ("Ann (123)", "Bo",),`);
  });

  it("makes the logo path root-absolute so Typst resolves it against --root", () => {
    const main = generateMainTypst(meta({ logo: "figures/logo.png" }), [body("/o/a.typ")], "L");
    expect(main).toContain(`logo: "/figures/logo.png",`);
  });

  it("switches heading numbering by role", () => {
    const main = generateMainTypst(
      meta(),
      [plain("/o/front.typ"), body("/o/b.typ"), appendix("/o/x.typ")],
      "L",
    );
    const front = main.indexOf(`#include "/o/front.typ"`);
    const b = main.indexOf(`#include "/o/b.typ"`);
    const x = main.indexOf(`#include "/o/x.typ"`);
    expect(main.lastIndexOf(`#set heading(numbering: none)`, front)).toBeGreaterThan(-1);
    expect(main.lastIndexOf(`#set heading(numbering: "1.1")`, b)).toBeGreaterThan(front);
    expect(main.lastIndexOf(`#set heading(numbering: "A.1.")`, x)).toBeGreaterThan(b);
  });

  it("resets the heading counter once per numbered mode", () => {
    const main = generateMainTypst(
      meta(),
      [body("/o/a.typ"), appendix("/o/x.typ")],
      "L",
    );
    expect(main.match(/#counter\(heading\)\.update\(0\)/g)).toHaveLength(2);
  });

  it("emits the bibliography before the first appendix, unnumbered", () => {
    const main = generateMainTypst(
      meta(),
      [body("/o/a.typ"), appendix("/o/x.typ")],
      "L",
      "/paperstack-template.typ",
      "/references.bib",
    );
    const bib = main.indexOf("#bibliography(");
    expect(main).toContain(
      `#bibliography("/references.bib", title: "References", style: "ieee")`,
    );
    expect(bib).toBeGreaterThan(main.indexOf(`#include "/o/a.typ"`));
    expect(bib).toBeLessThan(main.indexOf(`#include "/o/x.typ"`));
    // unnumbered title, and the appendix mode re-establishes its numbering after
    expect(main.lastIndexOf("#set heading(numbering: none)", bib)).toBeGreaterThan(-1);
    expect(main.indexOf(`#set heading(numbering: "A.1.")`)).toBeGreaterThan(bib);
  });

  it("emits the bibliography last when there are no appendices, localized", () => {
    const main = generateMainTypst(
      meta({ language: "da" }),
      [body("/o/a.typ")],
      "L",
      "/paperstack-template.typ",
      "/references.bib",
    );
    expect(main).toContain(`title: "Referencer"`);
    expect(main.indexOf("#bibliography(")).toBeGreaterThan(main.indexOf(`#include "/o/a.typ"`));
  });

  it("emits no bibliography when the project has none", () => {
    const main = generateMainTypst(meta(), [body("/o/a.typ")], "L");
    expect(main).not.toContain("#bibliography(");
  });

  it("does not restart body numbering when roles are interleaved", () => {
    // body, front-matter, body is schema-legal in a hand-edited
    // document.yaml — the second body run must continue numbering, not
    // silently restart at 1 in the middle of a graded report.
    const main = generateMainTypst(
      meta(),
      [body("/o/a.typ"), plain("/o/front.typ"), body("/o/b.typ")],
      "L",
    );
    expect(main.match(/#set heading\(numbering: "1\.1"\)/g)).toHaveLength(2);
    expect(main.match(/#counter\(heading\)\.update\(0\)/g)).toHaveLength(1);
    expect(main.indexOf("#counter(heading).update(0)")).toBeLessThan(
      main.indexOf(`#include "/o/front.typ"`),
    );
  });
});
