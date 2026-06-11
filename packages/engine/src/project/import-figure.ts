import type { Platform } from "../platform/platform.ts";
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
  const dest = await figureDestination(platform, projectDir, baseOf(normalizeSlashes(sourcePath)));
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
  const dest = await figureDestination(platform, projectDir, baseOf(normalizeSlashes(suggestedName)));
  await platform.writeBinaryFile(`${projectDir}/${dest}`, bytes);
  return dest;
}

/** Slugified, collision-safe destination inside the project's images folder. */
async function figureDestination(
  platform: Platform,
  projectDir: string,
  sourceName: string,
): Promise<string> {
  const stem = slugify(stemOf(sourceName), "figure");
  const ext = extOf(sourceName).toLowerCase() || ".png";

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
 * terminate the alt text early.
 */
export function figureMarkdown(file: string, caption: string): string {
  const alt = caption.replace(/[[\]\\]/g, "\\$&");
  return `![${alt}](/${file})`;
}
