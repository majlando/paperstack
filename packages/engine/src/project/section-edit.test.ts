import { describe, expect, it } from "vitest";
import {
  addSectionToYaml,
  moveSectionInYaml,
  removeSectionFromYaml,
  renameSectionInYaml,
} from "./section-edit.ts";
import { PaperstackError } from "../errors.ts";

const YAML = `# Group report — order is the single source of truth
title: "Demo"
sections:
  - { file: sections/00-front.md, role: front-matter }
  - { file: sections/01-intro.md, role: body }
  - { file: sections/02-impl.md, role: body } # the big one
  - { file: sections/03-refs.md, role: back-matter }
  - { file: appendices/appendix-a.md, role: appendix }
`;

describe("addSectionToYaml", () => {
  it("inserts at the end of the role group, in flow style", () => {
    const out = addSectionToYaml(YAML, "sections/04-discussion.md", "body");
    const lines = out.split("\n");
    const at = lines.findIndex((l) => l.includes("04-discussion"));
    expect(lines[at]).toBe("  - { file: sections/04-discussion.md, role: body }");
    expect(lines[at - 1]).toContain("02-impl");
    expect(lines[at + 1]).toContain("03-refs");
  });

  it("places a role with no existing group after the preceding roles", () => {
    const out = addSectionToYaml(
      "title: T\nsections:\n  - { file: a.md, role: body }\n  - { file: x.md, role: appendix }\n",
      "refs.md",
      "back-matter",
    );
    const files = [...out.matchAll(/file: ([^,]+),/g)].map((m) => m[1]);
    expect(files).toEqual(["a.md", "refs.md", "x.md"]);
  });

  it("preserves comments and formatting", () => {
    const out = addSectionToYaml(YAML, "sections/04-d.md", "body");
    expect(out).toContain("# Group report — order is the single source of truth");
    expect(out).toContain("# the big one");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("rejects duplicates and unsafe paths", () => {
    expect(() => addSectionToYaml(YAML, "sections/01-intro.md", "body")).toThrow(
      PaperstackError,
    );
    expect(() => addSectionToYaml(YAML, "../outside.md", "body")).toThrow(
      "stay inside the project folder",
    );
  });

  it("never rewraps long entries other groups wrote by hand (Git no-churn rule)", () => {
    const longEntry =
      "  - { file: sections/a-section-with-a-rather-long-descriptive-filename-by-hand.md, role: back-matter }";
    const yaml = `title: T\nsections:\n  - { file: a.md, role: body }\n${longEntry}\n`;
    const out = addSectionToYaml(yaml, "b.md", "body");
    expect(out).toContain(longEntry);
  });

  it("keeps a hand-written 4-space indent (Git no-churn rule)", () => {
    const four = [
      "title: T",
      "sections:",
      "    - { file: sections/a.md, role: body }",
      "",
    ].join("\n");
    const out = addSectionToYaml(four, "sections/b.md", "body");
    expect(out).toContain("    - { file: sections/a.md, role: body }");
    expect(out).toContain("    - { file: sections/b.md, role: body }");
  });

  it("keeps sequence items the author wrote flush with their key", () => {
    const flush = [
      "title: T",
      "sections:",
      "- { file: sections/a.md, role: body }",
      "",
    ].join("\n");
    const out = addSectionToYaml(flush, "sections/b.md", "body");
    expect(out).toContain("\n- { file: sections/a.md, role: body }");
    expect(out).toContain("\n- { file: sections/b.md, role: body }");
  });
});

describe("removeSectionFromYaml", () => {
  it("removes the entry and nothing else", () => {
    const out = removeSectionFromYaml(YAML, "sections/02-impl.md");
    expect(out).not.toContain("02-impl");
    expect(out).toContain("01-intro");
    expect(out).toContain("# Group report");
  });

  it("refuses to remove an unknown or the last section", () => {
    expect(() => removeSectionFromYaml(YAML, "nope.md")).toThrow("not part of");
    const single = "title: T\nsections:\n  - { file: a.md, role: body }\n";
    expect(() => removeSectionFromYaml(single, "a.md")).toThrow("at least one section");
  });
});

describe("moveSectionInYaml", () => {
  it("swaps with the neighbour of the same role", () => {
    const out = moveSectionInYaml(YAML, "sections/02-impl.md", "up");
    const files = [...out.matchAll(/file: ([^,]+),/g)].map((m) => m[1]);
    expect(files).toEqual([
      "sections/00-front.md",
      "sections/02-impl.md",
      "sections/01-intro.md",
      "sections/03-refs.md",
      "appendices/appendix-a.md",
    ]);
  });

  it("never crosses into another role group", () => {
    // 01-intro is the first body section; front matter sits above it
    expect(moveSectionInYaml(YAML, "sections/01-intro.md", "up")).toBe(YAML);
    expect(moveSectionInYaml(YAML, "sections/02-impl.md", "down")).toBe(YAML);
  });

  it("skips over other roles to find its group neighbour", () => {
    const interleaved =
      "title: T\nsections:\n" +
      "  - { file: a.md, role: body }\n" +
      "  - { file: n.md, role: front-matter }\n" +
      "  - { file: b.md, role: body }\n";
    const out = moveSectionInYaml(interleaved, "b.md", "up");
    const files = [...out.matchAll(/file: ([^,]+),/g)].map((m) => m[1]);
    expect(files).toEqual(["b.md", "n.md", "a.md"]);
  });
});

describe("renameSectionInYaml", () => {
  it("points the entry at the new path, keeping role and position", () => {
    const out = renameSectionInYaml(YAML, "sections/01-intro.md", "sections/01-introduction.md");
    const files = [...out.matchAll(/file: ([^,]+),/g)].map((m) => m[1]);
    expect(files[1]).toBe("sections/01-introduction.md");
    expect(out).toContain("role: body");
  });

  it("validates the new path and rejects collisions", () => {
    expect(() =>
      renameSectionInYaml(YAML, "sections/01-intro.md", "sections/02-impl.md"),
    ).toThrow("already part of the report");
    expect(() =>
      renameSectionInYaml(YAML, "sections/01-intro.md", "C:/evil.md"),
    ).toThrow("relative to the project folder");
  });
});
