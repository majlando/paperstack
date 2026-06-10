import { describe, expect, it } from "vitest";
import { PaperstackError } from "../errors.ts";
import { resolveProjectPath } from "../project/paths.ts";
import { rewriteImagePaths } from "./converter.ts";

describe("project asset paths", () => {
  it("resolves section-relative image paths inside the project", () => {
    expect(resolveProjectPath("sections", "../figures/diagram.png", "image path")).toBe(
      "/figures/diagram.png",
    );
    expect(rewriteImagePaths('image("img/a.png")', "sections")).toBe(
      'image("/sections/img/a.png")',
    );
  });

  it("rejects image paths that escape the project root", () => {
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
    expect(() => resolveProjectPath("sections", "//server/share/secret.png", "image path")).toThrow(
      PaperstackError,
    );
  });
});
