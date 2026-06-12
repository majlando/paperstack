import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NodePlatform } from "../platform/node-platform.ts";
import { FakePlatform } from "../platform/fake-platform.ts";
import { loadProject } from "./load-project.ts";
import { countProject } from "./counters.ts";
import { PaperstackError } from "../errors.ts";

const fixtureDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../fixtures/demo-report",
).replaceAll("\\", "/");

describe("loadProject on the demo fixture", () => {
  const platform = new NodePlatform();

  it("loads metadata and sections with roles", async () => {
    const project = await loadProject(platform, fixtureDir);
    expect(project.meta.title).toBe("Demo Project Report");
    expect(project.meta.language).toBe("en");
    expect(project.meta.sections).toHaveLength(6);
    expect(project.meta.sections.filter((s) => s.role === "body")).toHaveLength(3);
    expect(project.meta.authors[0]?.student_id).toBe("100001");
  });

  it("counts the fixture: 2 real TODOs, body under cap", async () => {
    const project = await loadProject(platform, fixtureDir);
    const counts = await countProject(platform, project);
    expect(counts.todosTotal).toBe(2);
    expect(counts.bodyChars).toBeGreaterThan(0);
    expect(counts.overCap).toBe(false);
    // back-matter and appendix must not count toward the body
    const bodyFiles = counts.sections.filter((s) => s.role === "body");
    expect(counts.bodyChars).toBe(bodyFiles.reduce((sum, s) => sum + s.chars, 0));
  });
});

describe("loadProject error messages", () => {
  it("reports a missing document.yaml in plain language", async () => {
    const platform = new FakePlatform(new Map());
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error).toBeInstanceOf(PaperstackError);
    expect(error.code).toBe("metadata-missing");
    expect(error.userMessage).toContain("document.yaml");
  });

  it("names Git conflict markers instead of surfacing a YAML parse error", async () => {
    const yaml =
      "title: Mine\n<<<<<<< HEAD\nbody_cap_normalsider: 40\n=======\nbody_cap_normalsider: 35\n>>>>>>> main\nsections:\n  - { file: a.md, role: body }\n";
    const platform = new FakePlatform(new Map([["/proj/document.yaml", yaml]]));
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error).toBeInstanceOf(PaperstackError);
    expect(error.code).toBe("metadata-conflict-markers");
    expect(error.userMessage).toContain("merge conflict");
    expect(error.userMessage).not.toMatch(/exit|code \d+/i);
  });

  it("reports invalid metadata with field names", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/proj/document.yaml", "title: ''\nsections:\n  - { file: a.md, role: nope }\n"],
      ]),
    );
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error.code).toBe("metadata-invalid");
    expect(error.userMessage).toContain("title");
    expect(error.userMessage).toContain("sections.0.role");
  });

  it("rejects section paths that escape the project folder", async () => {
    const platform = new FakePlatform(
      new Map([
        [
          "/proj/document.yaml",
          "title: T\nsections:\n  - { file: ../outside.md, role: body }\n",
        ],
      ]),
    );
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error.code).toBe("metadata-invalid");
    expect(error.userMessage).toContain("stay inside the project folder");
  });

  it("rejects absolute and backslash section paths", async () => {
    const platform = new FakePlatform(
      new Map([
        [
          "/proj/document.yaml",
          "title: T\nsections:\n  - { file: 'C:/x.md', role: body }\n  - { file: 'a\\\\b.md', role: body }\n",
        ],
      ]),
    );
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error.code).toBe("metadata-invalid");
    expect(error.userMessage).toContain("relative to the project folder");
    expect(error.userMessage).toContain("forward slashes");
  });

  it("refuses an unquoted student id with a leading zero (it already lost the zero)", async () => {
    const yaml = (id: string) =>
      `title: T\nauthors:\n  - name: Ada\n    student_id: ${id}\nsections:\n  - { file: a.md, role: body }\n`;
    const load = (id: string) =>
      loadProject(
        new FakePlatform(new Map([["/proj/document.yaml", yaml(id)], ["/proj/a.md", "# A\n"]])),
        "/proj",
      );
    const error = await load("0123456").catch((e) => e);
    expect(error.code).toBe("metadata-invalid");
    expect(error.userMessage).toContain('student_id: "0123456"');
    // quoted ids and zero-less numeric ids keep loading
    expect((await load('"0123456"')).meta.authors[0]?.student_id).toBe("0123456");
    expect((await load("123456")).meta.authors[0]?.student_id).toBe("123456");
  });

  it("names an empty or doubled document.yaml readably", async () => {
    const load = (content: string) =>
      loadProject(new FakePlatform(new Map([["/proj/document.yaml", content]])), "/proj");
    const empty = await load("# only a comment\n").catch((e) => e);
    expect(empty.userMessage).toContain("document.yaml is empty");
    const doubled = await load("title: a\n---\ntitle: b\n").catch((e) => e);
    expect(doubled.userMessage).toContain("more than one YAML document");
    expect(doubled.userMessage).not.toContain("parseAllDocuments");
  });

  it("rejects section paths that alias other entries via ./ or //", async () => {
    // "./a.md" and "a.md" are the same file — letting both through would
    // defeat the duplicate guard and count the section twice toward the cap.
    const yaml = (file: string) =>
      `title: T\nsections:\n  - { file: a.md, role: body }\n  - { file: '${file}', role: body }\n`;
    for (const alias of ["./a.md", "sections//a.md", "sections/./a.md"]) {
      const platform = new FakePlatform(new Map([["/proj/document.yaml", yaml(alias)]]));
      const error = await loadProject(platform, "/proj").catch((e) => e);
      expect(error.code).toBe("metadata-invalid");
      expect(error.userMessage).toContain("plain relative paths");
    }
  });

  it("rejects the same file listed twice", async () => {
    const platform = new FakePlatform(
      new Map([
        [
          "/proj/document.yaml",
          "title: T\nsections:\n  - { file: a.md, role: body }\n  - { file: a.md, role: appendix }\n",
        ],
      ]),
    );
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error.code).toBe("metadata-invalid");
    expect(error.userMessage).toContain("more than once");
  });

  it("tolerates hand-edited logo values instead of refusing to open", async () => {
    // The logo was once stripped as an unknown key — projects that carry a
    // leading-slash or empty value must keep loading after the upgrade.
    const yaml = (logo: string) =>
      `title: T\n${logo}\nsections:\n  - { file: a.md, role: body }\n`;
    const load = (logo: string) =>
      loadProject(
        new FakePlatform(new Map([["/proj/document.yaml", yaml(logo)], ["/proj/a.md", "# A\n"]])),
        "/proj",
      );
    expect((await load("logo: /resources/logo.png")).meta.logo).toBe("resources/logo.png");
    expect((await load("logo: ./logo.png")).meta.logo).toBe("logo.png");
    expect((await load("logo:")).meta.logo).toBeUndefined();
    expect((await load("logo: ''")).meta.logo).toBeUndefined();
    // a UNC path is absolute — rejected readably, never silently mangled
    // into a bogus project-relative path that fails later as missing
    const unc = await load("logo: \\\\server\\share\\logo.png").catch((e) => e);
    expect(unc.code).toBe("metadata-invalid");
    expect(unc.userMessage).toContain("relative to the project folder");
    // genuinely unusable values still fail with the field named
    const error = await load("logo: ../logo.png").catch((e) => e);
    expect(error.code).toBe("metadata-invalid");
    expect(error.userMessage).toContain("stay inside the project folder");
  });

  it("lists missing section files by name", async () => {
    const platform = new FakePlatform(
      new Map([
        [
          "/proj/document.yaml",
          "title: T\nsections:\n  - { file: sections/gone.md, role: body }\n",
        ],
      ]),
    );
    const error = await loadProject(platform, "/proj").catch((e) => e);
    expect(error.code).toBe("section-missing");
    expect(error.userMessage).toContain("sections/gone.md");
  });
});
