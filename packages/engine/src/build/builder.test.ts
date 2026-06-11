import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake-platform.ts";
import { buildReport } from "./builder.ts";
import type { Converter } from "./converter.ts";
import { PaperstackError } from "../errors.ts";

/** FakePlatform whose binaries "run": compiles succeed (optionally failing first). */
class RunnablePlatform extends FakePlatform {
  readonly compiles: string[][] = [];
  constructor(
    files: Map<string, string>,
    private readonly failFirstCompileWith?: string,
  ) {
    super(files);
  }
  override async runBinary(_binary: string, args: string[]) {
    if (args[0] === "compile") {
      this.compiles.push(args);
      if (this.failFirstCompileWith && this.compiles.length === 1) {
        return { exitCode: 1, stdout: "", stderr: this.failFirstCompileWith };
      }
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }
}

const stubConverter: Converter = {
  toTypst: async (markdown) => `// converted: ${markdown.split("\n")[0]}`,
};

const projectFiles = () =>
  new Map([
    ["/proj/document.yaml", "title: T\nsections:\n  - { file: a.md, role: body }\n  - { file: b.md, role: body }\n"],
    ["/proj/a.md", "# A\n"],
    ["/proj/b.md", "# B\n"],
  ]);

describe("buildReport preflight", () => {
  it("reports a missing typst binary in plain language", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/proj/document.yaml", "title: T\nsections:\n  - { file: a.md, role: body }\n"],
        ["/proj/a.md", "# A\n"],
      ]),
    );
    const error = await buildReport(platform, "/proj", {
      typst: "/bin/typst.exe",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PaperstackError);
    expect(error.code).toBe("dependency-missing");
    expect(error.userMessage).toContain("PDF engine");
    expect(error.userMessage).not.toMatch(/exit|code \d+/i);
  });

  it("skips the startup probe when the caller already verified the binaries", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/proj/document.yaml", "title: T\nsections:\n  - { file: a.md, role: body }\n"],
        ["/proj/a.md", "# A\n"],
      ]),
    );
    const error = await buildReport(platform, "/proj", {
      typst: "/bin/typst.exe",
      skipPreflight: true,
    }).catch((e) => e);

    // It gets past the dependency check and fails where FakePlatform
    // genuinely cannot go: actually running a binary.
    expect(error.code).not.toBe("dependency-missing");
    expect(String(error)).toContain("not supported in FakePlatform");
  });
});

describe("deterministic fonts (M6)", () => {
  it("compiles with --ignore-system-fonts so every machine renders the same PDF", async () => {
    const platform = new RunnablePlatform(projectFiles());
    await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
      skipPreflight: true,
    });
    expect(platform.compiles[0]).toEqual([
      "compile",
      "--root",
      "/proj",
      "--ignore-system-fonts",
      "/proj/output/.build/main.typ",
      "/proj/output/report.pdf",
    ]);
  });

  it("adds the project's committed fonts/ folder via --font-path when it exists", async () => {
    const files = projectFiles();
    files.set("/proj/fonts/cambria.ttf", "[font]");
    const platform = new RunnablePlatform(files);
    await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
      skipPreflight: true,
    });
    expect(platform.compiles[0]).toContain("--font-path");
    expect(platform.compiles[0]![platform.compiles[0]!.indexOf("--font-path") + 1]).toBe(
      "/proj/fonts",
    );
  });
});

describe("buildReport orchestration (stub converter, fake compile)", () => {
  it("converts sections in order, assembles main.typ, and reports the PDF path", async () => {
    const platform = new RunnablePlatform(projectFiles());
    const result = await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
    });

    expect(result.pdfPath).toBe("/proj/output/report.pdf");
    expect(result.warnings).toEqual([]);
    expect(platform.files.get("/proj/output/.build/converted/000-a.typ")).toContain("# A");
    expect(platform.files.get("/proj/output/.build/converted/001-b.typ")).toContain("# B");
    const main = platform.files.get("/proj/output/.build/main.typ")!;
    expect(main).toContain(`#include "/output/.build/converted/000-a.typ"`);
    expect(main).toContain(`#include "/output/.build/converted/001-b.typ"`);
    expect(platform.compiles).toHaveLength(1);
  });

  it("sweeps stale converted .typ files but never user files", async () => {
    const files = projectFiles();
    files.set("/proj/output/.build/converted/005-old.typ", "// from a removed section");
    files.set("/proj/output/.build/converted/notes.txt", "mine");
    const platform = new RunnablePlatform(files);
    await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
    });

    expect(platform.files.has("/proj/output/.build/converted/005-old.typ")).toBe(false);
    expect(platform.files.has("/proj/output/.build/converted/notes.txt")).toBe(true);
  });

  it("warns when body sections come after an appendix (shared heading counter)", async () => {
    const files = projectFiles();
    files.set(
      "/proj/document.yaml",
      "title: T\nsections:\n  - { file: a.md, role: body }\n  - { file: x.md, role: appendix }\n  - { file: b.md, role: body }\n",
    );
    files.set("/proj/x.md", "# X\n");
    const platform = new RunnablePlatform(files);
    const result = await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
    });

    expect(result.warnings.some((w) => w.includes("appendix"))).toBe(true);
  });

  it("warns when a section contains Git merge conflict markers", async () => {
    const files = projectFiles();
    files.set("/proj/a.md", "# A\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> main\n");
    const platform = new RunnablePlatform(files);
    const result = await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain(`"a.md"`);
    expect(result.warnings[0]).toContain("merge conflict");
  });

  it("falls back to a timestamped PDF when report.pdf is locked, as a warning", async () => {
    const platform = new RunnablePlatform(
      projectFiles(),
      "error: failed to write PDF (os error 32)",
    );
    const result = await buildReport(platform, "/proj", {
      typst: "typst",
      converter: stubConverter,
    });

    expect(platform.compiles).toHaveLength(2);
    expect(result.pdfPath).toMatch(/\/proj\/output\/report-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.pdf$/);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("open in a PDF viewer");
    expect(result.warnings[0]).not.toMatch(/exit|os error/i);
  });
});
