import { describe, expect, it } from "vitest";
import { PaperstackError } from "../errors.ts";
import { resolveProjectPath } from "../project/paths.ts";
import { rewriteImagePaths } from "./converter.ts";

describe("resolveProjectPath (image paths)", () => {
  it("resolves a sibling path under the section directory", () => {
    expect(resolveProjectPath("sections", "img.png", "image path")).toBe("/sections/img.png");
  });

  it("resolves ../ against the base directory", () => {
    expect(resolveProjectPath("sections", "../figures/diagram.png", "image path")).toBe(
      "/figures/diagram.png",
    );
  });

  it("drops . segments and empty segments", () => {
    expect(resolveProjectPath("sections", "./a//b.png", "image path")).toBe("/sections/a/b.png");
    expect(resolveProjectPath("", "img.png", "image path")).toBe("/img.png");
  });

  it("rejects paths that escape the project root", () => {
    expect(() => resolveProjectPath("sections", "../../../../etc/passwd", "image path")).toThrow(
      PaperstackError,
    );
    const error = (() => {
      try {
        resolveProjectPath("", "../secret.png", "image path");
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(PaperstackError);
    expect((error as PaperstackError).userMessage).toContain("inside the project");
  });

  it("rejects host-absolute image paths", () => {
    expect(() => resolveProjectPath("sections", "C:/Users/me/secret.png", "image path")).toThrow(
      PaperstackError,
    );
    expect(() =>
      resolveProjectPath("sections", "//server/share/secret.png", "image path"),
    ).toThrow(PaperstackError);
  });
});

describe("rewriteImagePaths", () => {
  it("rewrites relative image paths to root-absolute project paths", () => {
    expect(rewriteImagePaths(`#image("shot.png", width: 50%)`, "sections")).toBe(
      `#image("/sections/shot.png", width: 50%)`,
    );
    expect(rewriteImagePaths('image("img/a.png")', "sections")).toBe(
      'image("/sections/img/a.png")',
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

  it("leaves image(...) inside a raw code listing untouched", () => {
    // Pandoc emits code blocks as backtick-delimited Typst raw — verbatim
    // text in the PDF, so it must never be rewritten.
    const typst = '```python\nimg = image("../shot.png")\n```';
    expect(rewriteImagePaths(typst, "sections")).toBe(typst);
  });

  it("does not fail the export on traversal-looking text in a listing", () => {
    const typst = '```\nimage("../../outside.png")\n```';
    expect(rewriteImagePaths(typst, "sections")).toBe(typst);
  });

  it("leaves inline code spans untouched", () => {
    const typst = 'Call `image("../x.png")` to embed it.';
    expect(rewriteImagePaths(typst, "sections")).toBe(typst);
  });

  it("still rewrites real images around a listing", () => {
    const typst = '#image("a.png")\n```\nimage("b.png")\n```\n#image("c.png")';
    expect(rewriteImagePaths(typst, "sections")).toBe(
      '#image("/sections/a.png")\n```\nimage("b.png")\n```\n#image("/sections/c.png")',
    );
  });
});
