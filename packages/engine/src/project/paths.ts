/**
 * Path and filename helpers for project-relative paths. Project paths always
 * use forward slashes regardless of OS — OS paths (e.g. from a file dialog)
 * are normalized at the boundary with `normalizeSlashes`.
 */
import { PaperstackError } from "../errors.ts";

export function normalizeSlashes(path: string): string {
  return path.replaceAll("\\", "/");
}

/** "sections/01-intro.md" → "sections"; "intro.md" → "". */
export function dirOf(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

/** "sections/01-intro.md" → "01-intro.md". */
export function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** "screenshot.v2.png" → "screenshot.v2" (dotfiles and no-extension names pass through). */
export function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

/** "screenshot.v2.png" → ".png" (dotfiles and no-extension names → ""). */
export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

/** Filename-safe slug: "Løsning & Design" → "loesning-design". */
export function slugify(name: string, fallback = "section"): string {
  const danish: Record<string, string> = { æ: "ae", ø: "oe", å: "aa" };
  const slug = name
    .trim()
    // macOS hands over NFD filenames (å as a + combining ring); compose
    // first so the Danish map sees them — the same file dragged in on
    // Windows and macOS must produce the same slug in the shared repo.
    .normalize("NFC")
    .toLowerCase()
    .replace(/[æøå]/g, (c) => danish[c]!)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (é → e)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/** "screenshot-3" → "Screenshot 3" — a filename stem as human-readable text. */
export function humanize(stem: string): string {
  const words = stem.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/**
 * Resolves a Markdown/project asset path to a root-absolute project path.
 * Throws when the input is absolute outside the project, Windows-absolute,
 * uses backslashes, or tries to climb above the project root.
 */
export function resolveProjectPath(baseDir: string, assetPath: string, what = "asset path"): string {
  if (assetPath.trim() === "") {
    throw new PaperstackError("metadata-invalid", `${what} must not be empty.`);
  }
  if (assetPath.includes("\\")) {
    throw new PaperstackError("metadata-invalid", `Use forward slashes (/) in ${what}s.`);
  }
  if (/^[A-Za-z]:/.test(assetPath) || assetPath.startsWith("//")) {
    throw new PaperstackError(
      "metadata-invalid",
      `${what}s must be relative to the project folder.`,
    );
  }

  const parts = [
    ...(assetPath.startsWith("/") ? [] : baseDir.split("/")),
    ...assetPath.replace(/^\/+/, "").split("/"),
  ].filter((p) => p !== "" && p !== ".");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      if (out.length === 0) {
        throw new PaperstackError(
          "metadata-invalid",
          `${what}s must stay inside the project folder.`,
        );
      }
      out.pop();
    } else {
      out.push(part);
    }
  }
  return "/" + out.join("/");
}
