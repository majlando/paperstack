import { describe, expect, it } from "vitest";
import { FakePlatform } from "./test-utils.ts";
import { createProject } from "./create-project.ts";
import { loadProject } from "./project.ts";
import { PaperstackError } from "./errors.ts";

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
    expect(project.meta.sections.map((s) => s.role)).toEqual(["body", "back-matter"]);
  });

  it("writes a project .gitignore covering generated files, with trailing newlines", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", { title: "T" });

    const gitignore = platform.files.get("/proj/.gitignore")!;
    expect(gitignore).toContain("output/");
    expect(gitignore).toContain("diagrams/rendered/");
    for (const [, content] of platform.files) {
      expect(content.endsWith("\n")).toBe(true);
    }
  });

  it("localizes the starter sections for Danish reports", async () => {
    const platform = new FakePlatform();
    await createProject(platform, "/proj", { title: "T", language: "da" });

    expect(platform.files.get("/proj/sections/01-introduction.md")).toContain("# Indledning");
    expect(platform.files.get("/proj/sections/02-references.md")).toContain("# Referencer");
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
