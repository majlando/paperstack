import type { Platform } from "../platform/platform.ts";
import { PaperstackError } from "../errors.ts";
import { baseOf, extOf, humanize, normalizeSlashes, slugify, stemOf } from "./paths.ts";

/** Folders scanned (in order) for where the project keeps its images. */
const IMAGE_DIRS = ["figures", "images", "assets", "resources"] as const;

/**
 * Copies an image into the project's images folder and returns its
 * project-relative path. The filename is slugified ("Screen Shot 1.PNG" →
 * "screen-shot-1.png") so the resulting Markdown link needs no escaping, and
 * a name collision gets a numeric suffix instead of overwriting a shared
 * asset someone else may have committed.
 */
export async function importFigure(
  platform: Platform,
  projectDir: string,
  sourcePath: string,
): Promise<string> {
  const name = baseOf(normalizeSlashes(sourcePath));
  // Typst decodes images by their extension — copying "photo" to
  // "photo.png" when it is really a JPEG breaks the export with no hint
  // back at the import that caused it.
  const ext = extOf(name).toLowerCase();
  if (ext === "") {
    throw new PaperstackError(
      "figure-unsupported",
      `"${name}" has no file extension, so the image type is unknown. ` +
        `Rename it (for example to ${name}.png) and insert it again.`,
    );
  }
  const dest = await figureDestination(platform, projectDir, name, ext);
  await platform.copyFile(sourcePath, `${projectDir}/${dest}`);
  return dest;
}

/**
 * Same import for in-memory image data — e.g. a screenshot pasted from the
 * clipboard, which has no source file to copy. `suggestedName` is whatever
 * the clipboard offered (often just "image.png"); naming and collision
 * handling follow the same rules as importFigure.
 */
export async function importFigureBytes(
  platform: Platform,
  projectDir: string,
  suggestedName: string,
  bytes: Uint8Array,
): Promise<string> {
  const name = baseOf(normalizeSlashes(suggestedName));
  // Clipboards usually offer a name with an extension; when they don't,
  // the bytes themselves say what the image is.
  const ext = extOf(name).toLowerCase() || sniffImageExt(bytes);
  if (ext === null) {
    throw new PaperstackError(
      "figure-unsupported",
      "The pasted image is not a format the report can embed (PNG, JPEG, GIF, or SVG). " +
        "Save it as PNG and insert it again.",
    );
  }
  const dest = await figureDestination(platform, projectDir, name, ext);
  await platform.writeBinaryFile(`${projectDir}/${dest}`, bytes);
  return dest;
}

/** What the bytes say the image is — null when unrecognized (or unsupported by Typst). */
function sniffImageExt(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? 0;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return ".png";
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return ".jpg";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return ".gif";
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return ".svg";
  return null;
}

/** Slugified, collision-safe destination inside the project's images folder. */
async function figureDestination(
  platform: Platform,
  projectDir: string,
  sourceName: string,
  ext: string,
): Promise<string> {
  const stem = slugify(stemOf(sourceName), "figure");

  // Follow the project's own convention for where images live.
  let dir: string | undefined;
  for (const candidate of IMAGE_DIRS) {
    if (await platform.dirExists(`${projectDir}/${candidate}`)) {
      dir = candidate;
      break;
    }
  }
  if (dir === undefined) {
    dir = IMAGE_DIRS[0];
    await platform.mkdir(`${projectDir}/${dir}`);
  }

  let dest = `${dir}/${stem}${ext}`;
  for (let n = 2; await platform.fileExists(`${projectDir}/${dest}`); n++) {
    dest = `${dir}/${stem}-${n}${ext}`;
  }
  return dest;
}

/** "C:\\Pictures\\screen-shot-1.png" → "Screen shot 1" — a starting point for the caption. */
export function suggestedCaption(sourcePath: string): string {
  return humanize(stemOf(baseOf(normalizeSlashes(sourcePath))));
}

/**
 * The Markdown line the build pipeline turns into a captioned figure
 * ("Figure N: …"): an image alone in its paragraph, root-absolute path.
 * Brackets and backslashes in the caption are escaped so they cannot
 * terminate the alt text early. Optional `width` (e.g. "60%", "8cm") and
 * `align` ("left"/"right"; "center" is the default and omitted) are emitted
 * as a `{…}` attribute the converter applies; preview and PDF both honour it.
 */
export function figureMarkdown(
  file: string,
  caption: string,
  width?: string,
  align?: "left" | "center" | "right",
  /** Cross-reference label; "fig:" is prefixed if absent, so `@fig:id` resolves. */
  label?: string,
): string {
  const alt = caption.replace(/[[\]\\]/g, "\\$&");
  const parts: string[] = [];
  const id = label?.trim().replace(/[^A-Za-z0-9:_-]/g, "");
  if (id) parts.push(`#${/^[a-z]+:/.test(id) ? id : `fig:${id}`}`);
  const w = width?.trim();
  if (w) parts.push(`width=${/\s/.test(w) ? `"${w}"` : w}`);
  if (align && align !== "center") parts.push(`align=${align}`);
  const attrs = parts.length > 0 ? `{${parts.join(" ")}}` : "";
  return `![${alt}](/${file})${attrs}`;
}
