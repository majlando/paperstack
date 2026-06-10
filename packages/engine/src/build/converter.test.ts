import { describe, expect, it } from "vitest";
import { resolveProjectPath, rewriteImagePaths } from "./converter.ts";

describe("resolveProjectPath", () => {
  it("resolves a sibling path under the section directory", () => {
    expect(resolveProjectPath("sections", "img.png")).toBe("/sections/img.png");
  });

  it("resolves ../ against the base directory", () => {
    expect(resolveProjectPath("sections", "../figures/x.png")).toBe("/figures/x.png");
  });

  it("drops . segments and empty segments", () => {
    expect(resolveProjectPath("sections", "./a//b.png")).toBe("/sections/a/b.png");
    expect(resolveProjectPath("", "img.png")).toBe("/img.png");
  });

  it("clamps .. at the project root instead of escaping it", () => {
    // The resulting root-absolute path resolves against typst --root (the
    // project folder), so even a hostile path stays inside the project.
    expect(resolveProjectPath("sections", "../../../../etc/passwd")).toBe("/etc/passwd");
  });
});

describe("rewriteImagePaths", () => {
  it("rewrites relative image paths to root-absolute project paths", () => {
    expect(rewriteImagePaths(`#image("shot.png", width: 50%)`, "sections")).toBe(
      `#image("/sections/shot.png", width: 50%)`,
    );
  });

  it("leaves already root-absolute paths alone", () => {
    const typst = `#image("/figures/x.svg")`;
    expect(rewriteImagePaths(typst, "sections")).toBe(typst);
  });

  it("rewrites every occurrence", () => {
    const typst = `#image("a.png")\ntext\n#image("../figures/b.png")`;
    expect(rewriteImagePaths(typst, "sections")).toBe(
      `#image("/sections/a.png")\ntext\n#image("/figures/b.png")`,
    );
  });
});
