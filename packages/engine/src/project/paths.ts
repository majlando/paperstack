/**
 * Path and filename helpers for project-relative paths. Project paths always
 * use forward slashes regardless of OS — OS paths (e.g. from a file dialog)
 * are normalized at the boundary with `normalizeSlashes`.
 */

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
