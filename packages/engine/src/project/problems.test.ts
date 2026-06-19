import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake-platform.ts";
import { collectProblems } from "./problems.ts";
import type { Project } from "./load-project.ts";
import type { ProjectCounts } from "./counters.ts";

function setup(files: Record<string, string>): { platform: FakePlatform; project: Project } {
  const platform = new FakePlatform(new Map(Object.entries(files)));
  const sections = Object.keys(files)
    .filter((f) => f.startsWith("/p/sections/"))
    .map((f) => ({ file: f.replace("/p/", ""), role: "body" as const }));
  const project = { dir: "/p", meta: { sections } } as unknown as Project;
  return { platform, project };
}

function counts(overCap = false): ProjectCounts {
  return {
    sections: [],
    bodyChars: 0,
    bodyNormalsider: overCap ? 45 : 10,
    cap: 40,
    overCap,
    todosTotal: 0,
  };
}

describe("collectProblems", () => {
  it("reports unresolved TODOs with a location", async () => {
    const { platform, project } = setup({ "/p/sections/a.md": "# A\n\n[TODO: write this]\n" });
    const ps = await collectProblems(platform, project, counts(), new Set());
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ kind: "todo", file: "sections/a.md" });
    expect(ps[0]!.offset).toBeGreaterThan(0);
  });

  it("reports an image whose file is not in the project, but not an existing one", async () => {
    const { platform, project } = setup({
      "/p/sections/a.md": "![ok](../figures/here.png)\n\n![gone](../figures/missing.png)\n",
      "/p/figures/here.png": "[binary]",
    });
    const ps = await collectProblems(platform, project, counts(), new Set());
    expect(ps.filter((p) => p.kind === "missing-image")).toHaveLength(1);
    expect(ps[0]!.message).toContain("missing.png");
  });

  it("flags an unknown bracketed citation but not a known one", async () => {
    const { platform, project } = setup({ "/p/sections/a.md": "see [@nosuch] and [@knuth84]\n" });
    const ps = await collectProblems(platform, project, counts(), new Set(["knuth84"]));
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ kind: "unknown-citation" });
    expect(ps[0]!.message).toContain("nosuch");
  });

  it("flags a figure cross-reference with no matching label", async () => {
    const { platform, project } = setup({
      "/p/sections/a.md": "![Arch](x.png){#fig:arch}\n\nsee @fig:arch and @fig:ghost\n",
    });
    const ps = await collectProblems(platform, project, counts(), new Set());
    const refs = ps.filter((p) => p.kind === "unknown-reference");
    expect(refs).toHaveLength(1);
    expect(refs[0]!.message).toContain("fig:ghost");
  });

  it("surfaces unsupported math through the injected validator", async () => {
    const { platform, project } = setup({ "/p/sections/a.md": "see $\\foobar$ here\n" });
    const validate = (md: string) =>
      md.includes("$\\foobar$") ? [{ offset: md.indexOf("$"), message: "bad math" }] : [];
    const ps = await collectProblems(platform, project, counts(), new Set(), validate);
    expect(ps.some((p) => p.kind === "unsupported-math" && p.file === "sections/a.md")).toBe(true);
  });

  it("skips the math check when no validator is injected", async () => {
    const { platform, project } = setup({ "/p/sections/a.md": "see $\\foobar$ here\n" });
    const ps = await collectProblems(platform, project, counts(), new Set());
    expect(ps.some((p) => p.kind === "unsupported-math")).toBe(false);
  });

  it("reports an over-cap body at the project level", async () => {
    const { platform, project } = setup({ "/p/sections/a.md": "# A\n" });
    const ps = await collectProblems(platform, project, counts(true), new Set());
    expect(ps.some((p) => p.kind === "over-cap" && p.file === null)).toBe(true);
  });

  it("returns nothing for a clean project", async () => {
    const { platform, project } = setup({ "/p/sections/a.md": "# Intro\n\nClean prose.\n" });
    expect(await collectProblems(platform, project, counts(), new Set())).toEqual([]);
  });
});
