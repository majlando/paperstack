import type { Platform } from "../platform/platform.ts";
import { PaperstackError } from "../errors.ts";
import { resolveProjectPath } from "../project/paths.ts";

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
  /**
   * @param scratchDir absolute build directory for the temp input file —
   *   input travels via file, not stdin (see Platform.runBinary).
   */
  constructor(
    private readonly platform: Platform,
    private readonly pandoc: string,
    private readonly scratchDir: string,
  ) {}

  async toTypst(markdown: string, sectionDir: string): Promise<string> {
    const inputPath = `${this.scratchDir}/pandoc-input.md`;
    await this.platform.writeTextFile(inputPath, markdown);
    const result = await this.platform.runBinary(
      this.pandoc,
      // implicit_figures: an image alone in a paragraph becomes a numbered
      // figure with the alt text as caption (the Paperstack figure convention)
      // attributes: supports ![alt](img.png){width=62%} for figure sizing
      ["-f", "gfm+implicit_figures+attributes", "-t", "typst", "--wrap=none", inputPath],
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
 *
 * Raw segments — code listings and inline code, which Pandoc emits as
 * backtick-delimited Typst raw — are verbatim text and must pass through
 * untouched: an image("...") inside a code sample is not an image.
 */
export function rewriteImagePaths(typst: string, sectionDir: string): string {
  const RAW_SEGMENT = /(`+)[\s\S]*?\1/g;
  let out = "";
  let last = 0;
  for (const raw of typst.matchAll(RAW_SEGMENT)) {
    out += rewriteSegment(typst.slice(last, raw.index), sectionDir);
    out += raw[0];
    last = raw.index + raw[0].length;
  }
  return out + rewriteSegment(typst.slice(last), sectionDir);
}

function rewriteSegment(typst: string, sectionDir: string): string {
  return typst.replace(/image\("([^"]+)"/g, (match, path: string) => {
    if (path.startsWith("/")) return match;
    return `image("${resolveProjectPath(sectionDir, path, "image path")}"`;
  });
}
