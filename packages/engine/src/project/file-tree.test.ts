import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake-platform.ts";
import { buildFileTree } from "./file-tree.ts";

function project(): FakePlatform {
  return new FakePlatform(
    new Map([
      ["/p/document.yaml", "title: T\n"],
      ["/p/references.bib", "% refs\n"],
      ["/p/sections/01-intro.md", "# Intro\n"],
      ["/p/sections/02-method.md", "# Method\n"],
      ["/p/figures/diagram.png", "[binary]"],
      ["/p/figures/chart.svg", "<svg/>"],
      ["/p/output/.build/main.typ", "ignored"],
      ["/p/.git/HEAD", "ref"],
      ["/p/document.yaml.paperstack-tmp", "orphaned"],
    ]),
  );
}

describe("buildFileTree", () => {
  it("lists directories first, then files, each sorted case-insensitively", async () => {
    const tree = await buildFileTree(project(), "/p");
    expect(tree.map((n) => `${n.name}${n.isDir ? "/" : ""}`)).toEqual([
      "figures/",
      "sections/",
      "document.yaml",
      "references.bib",
    ]);
  });

  it("recurses into directories with project-relative paths", async () => {
    const tree = await buildFileTree(project(), "/p");
    const figures = tree.find((n) => n.name === "figures");
    expect(figures?.children?.map((c) => c.path)).toEqual([
      "figures/chart.svg",
      "figures/diagram.png",
    ]);
    const sections = tree.find((n) => n.name === "sections");
    expect(sections?.children?.every((c) => !c.isDir && c.children === undefined)).toBe(true);
  });

  it("hides generated output, the Git directory, and crash-temp files", async () => {
    const names = (await buildFileTree(project(), "/p")).map((n) => n.name);
    expect(names).not.toContain("output");
    expect(names).not.toContain(".git");
    expect(names).not.toContain("document.yaml.paperstack-tmp");
  });

  it("returns an empty list for a missing directory instead of throwing", async () => {
    expect(await buildFileTree(new FakePlatform(), "/nope")).toEqual([]);
  });
});
