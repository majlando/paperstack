import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NodePlatform } from "./node-platform.ts";
import { FakePlatform } from "./test-utils.ts";
import { loadProject } from "./project.ts";
import { countProject } from "./counters.ts";
import { PaperstackError } from "./errors.ts";

const fixtureDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../fixtures/demo-report",
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
