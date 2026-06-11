import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake-platform.ts";
import { createProject } from "./create-project.ts";
import { loadProject } from "./load-project.ts";
import { PaperstackError } from "../errors.ts";

describe("createProject", () => {
  it("scaffolds a project that loadProject accepts as-is", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", {
      title: 'Smart "Home" \\ Hub',
      date: "2026-06-10",
    });

    const project = await loadProject(platform, "/proj");
    expect(project.meta.title).toBe('Smart "Home" \\ Hub');
    expect(project.meta.language).toBe("en");
    expect(project.meta.body_cap_normalsider).toBe(40);
    expect(project.meta.sections.map((s) => s.role)).toEqual(["body"]);
  });

  it("scaffolds an inert references.bib that documents the citation workflow", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", { title: "T" });

    const bib = platform.files.get("/proj/references.bib")!;
    expect(bib).toContain("[@key]");
    // Commented examples only — no real entries, so no empty References
    // section is generated and [@...] stays prose until the first entry.
    const { parseBibliography } = await import("../build/bibliography.ts");
    expect(parseBibliography(bib)).toEqual([]);
  });

  it("writes a project .gitignore covering build output, with trailing newlines", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", { title: "T" });

    const gitignore = platform.files.get("/proj/.gitignore")!;
    expect(gitignore).toContain("output/");
    expect(gitignore).toContain("*.paperstack-tmp"); // crash-orphaned atomic-write temps
    // Rendered diagrams are deliberately committed: content-hashed renders
    // are conflict-free, and group members/CI can build sections containing
    // diagrams they never opened in Paperstack.
    expect(gitignore).not.toContain("diagrams/rendered/");
    for (const [, content] of platform.files) {
      expect(content.endsWith("\n")).toBe(true);
    }
  });

  it("appends to an existing .gitignore instead of overwriting it", async () => {
    const platform = new FakePlatform(
      new Map([["/proj/.gitignore", "node_modules/\n"]]),
    );
    await createProject(platform, "/proj", { title: "T" });

    const gitignore = platform.files.get("/proj/.gitignore")!;
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain("output/");
    expect(gitignore).toContain("*.paperstack-tmp");
  });

  it("recognizes its rules only as whole lines, not substrings", async () => {
    // "build-output/" must not count as the output/ rule — and rules the
    // file already has (with or without a leading slash) are not duplicated.
    const platform = new FakePlatform(
      new Map([["/proj/.gitignore", "build-output/\n/output/\n"]]),
    );
    await createProject(platform, "/proj", { title: "T" });

    const gitignore = platform.files.get("/proj/.gitignore")!;
    expect(gitignore.match(/^\/?output\/$/gm)).toHaveLength(1); // not re-added
    expect(gitignore).toContain("*.paperstack-tmp"); // missing rule appended
  });

  it("writes a .gitattributes that normalizes line endings", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", { title: "T" });
    expect(platform.files.get("/proj/.gitattributes")).toBe("* text=auto\n");
  });

  it("never overwrites an existing .gitattributes", async () => {
    const platform = new FakePlatform(
      new Map([["/proj/.gitattributes", "*.md text eol=lf\n"]]),
    );
    await createProject(platform, "/proj", { title: "T" });
    expect(platform.files.get("/proj/.gitattributes")).toBe("*.md text eol=lf\n");
  });

  it("never overwrites existing section files", async () => {
    const platform = new FakePlatform(
      new Map([["/proj/sections/01-introduction.md", "# Mine\n"]]),
    );
    await createProject(platform, "/proj", { title: "T" });
    expect(platform.files.get("/proj/sections/01-introduction.md")).toBe("# Mine\n");
  });

  it("localizes the starter sections for Danish reports", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", { title: "T", language: "da" });

    expect(platform.files.get("/proj/sections/01-introduction.md")).toContain("# Indledning");
    expect(platform.files.get("/proj/references.bib")).toContain("Referencer til rapporten");
    expect(platform.files.get("/proj/document.yaml")).toContain("language: da");
  });

  it("refuses to scaffold over an existing report", async () => {
    const platform = new FakePlatform(new Map([["/proj/document.yaml", "title: Old\n"]]));
    const error = await createProject(platform, "/proj", { title: "New" }).catch((e) => e);
    expect(error).toBeInstanceOf(PaperstackError);
    expect(error.code).toBe("project-exists");
    expect(platform.files.get("/proj/document.yaml")).toBe("title: Old\n");
  });
});
