import type { Platform } from "./platform.ts";
import { PaperstackError } from "./errors.ts";

/**
 * Markdown → Typst conversion, behind an interface so the Pandoc sidecar can
 * later be replaced by a remark-based emitter without touching the builder.
 */
export interface Converter {
  /**
   * @param sectionDir project-relative directory of the section file
   *   (e.g. "sections") — used to resolve relative image paths.
   */
  toTypst(markdown: string, sectionDir: string): Promise<string>;
}

export class PandocConverter implements Converter {
  constructor(
    private readonly platform: Platform,
    private readonly pandocPath: string,
  ) {}

  async toTypst(markdown: string, sectionDir: string): Promise<string> {
    const result = await this.platform.runBinary(
      this.pandocPath,
      // implicit_figures: an image alone in a paragraph becomes a numbered
      // figure with the alt text as caption (the Paperstack figure convention)
      ["-f", "gfm+implicit_figures", "-t", "typst", "--wrap=none"],
      { stdin: markdown },
    );
    if (result.exitCode !== 0) {
      throw new PaperstackError(
        "convert-failed",
        "A section could not be prepared for the report. Check it for unusual Markdown and try again.",
        result.stderr,
      );
    }
    return rewriteImagePaths(result.stdout, sectionDir);
  }
}

/**
 * Converted sections live in output/.build/, so relative image paths from the
 * original section location would break. Rewrite them to root-absolute Typst
 * paths ("/figures/x.svg"), which resolve against the project root.
 */
export function rewriteImagePaths(typst: string, sectionDir: string): string {
  return typst.replace(/image\("([^"]+)"/g, (match, path: string) => {
    if (path.startsWith("/")) return match;
    return `image("${resolveProjectPath(sectionDir, path)}"`;
  });
}

/** Pure-string posix path resolution (no node:path — must run in the webview). */
function resolveProjectPath(baseDir: string, relative: string): string {
  const parts = [...baseDir.split("/"), ...relative.split("/")].filter(
    (p) => p !== "" && p !== ".",
  );
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}
