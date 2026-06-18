import type { Platform } from "../platform/platform.ts";
import type { Project } from "./load-project.ts";
import type { SectionRole } from "./schema.ts";

/** Danish academic page unit: 1 normalside = 2400 characters (anslag). */
export const CHARS_PER_NORMALSIDE = 2400;

/**
 * Character count for the length cap. HTML comments are authoring notes and
 * are stripped; carriage returns are stripped so counts are identical across
 * Windows/Unix checkouts.
 *
 * The unit is Unicode code points, not UTF-16 units: this number feeds a
 * hard academic cap printed on the cover, so its definition is pinned —
 * an emoji or other astral character counts as one anslag, not two.
 * (Danish text is unaffected either way.)
 */
export function countAnslag(markdown: string): number {
  const stripped = markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "");
  let count = 0;
  // for..of iterates code points; a spread would allocate an array per keystroke.
  for (const _ of stripped) count++;
  return count;
}

/**
 * Genuine `[TODO` placeholders. A backtick directly before (inline code like
 * `` `[TODO]` ``) means the text *discusses* a TODO and is not one.
 */
const TODO_MARKER = /(?<!`)\[TODO/g;

/** Character offsets of every `[TODO` marker — drives the editor's click-to-jump. */
export function findTodoOffsets(markdown: string): number[] {
  return [...markdown.matchAll(TODO_MARKER)].map((m) => m.index ?? 0);
}

export function countTodos(markdown: string): number {
  return findTodoOffsets(markdown).length;
}

/**
 * FNV-1a over the content with carriage returns stripped — EOL-insensitive so
 * a CRLF-rewriting checkout doesn't read as "every section changed". Same
 * algorithm as the diagram hashing in build/mermaid.ts; duplicated rather
 * than imported so project/ stays independent of build/.
 */
export function hashContent(content: string): string {
  const stripped = content.replace(/\r/g, "");
  let h = 0x811c9dc5;
  for (let i = 0; i < stripped.length; i++) {
    h ^= stripped.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Visible text of a heading's inline markup, for the sidebar/search label:
 * link and image labels are kept, their URLs and the emphasis/code markers
 * dropped, so `**Results**`, `_C#_`, and `[Results](r.md)` all read as plain
 * words. Underscores are only stripped at word boundaries — `my_var` keeps
 * its underscore (CommonMark never treats intraword `_` as emphasis).
 */
function stripInlineMarkup(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url), ![alt](url) → label
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1") // [text][ref] → label
    .replace(/`+/g, "") // inline-code backticks
    .replace(/\*/g, "") // emphasis / strong
    .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, ""); // non-intraword underscores
}

/**
 * Text of the file's first ATX heading — what the sidebar shows as the
 * section's name, or null when the file has none. Headings inside fenced
 * code blocks are not headings (a section may open with a shell snippet
 * whose comments start with `#`); only a fence of the same marker character
 * that opened the block closes it, so a `~~~` line inside a ``` block does
 * not end it. A trailing `#` run is an ATX closing sequence only when it is
 * whitespace-separated from the text, so `# C#` keeps its sharp.
 *
 * Deliberately a lightweight line reader, not the converter's full remark
 * parse: project/ stays independent of build/, and this runs on every
 * keystroke. It covers the heading forms a section title realistically takes.
 */
export function firstHeading(markdown: string): string | null {
  let fence: string | null = null; // marker char of the open fence, or null
  for (const line of markdown.split("\n")) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!; // "`" or "~"
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (m) {
      const text = stripInlineMarkup(m[1]!).trim();
      if (text !== "") return text;
    }
  }
  return null;
}

export interface OutlineItem {
  /** Heading level, 1–6. */
  depth: number;
  /** Plain-text heading, inline markup stripped. */
  text: string;
  /** Character offset of the heading line start — drives click-to-jump. */
  offset: number;
}

/**
 * Every ATX heading in document order, with its level and character offset —
 * the section's outline for navigation. Fence-aware like firstHeading, and
 * offsets count line endings verbatim so they line up with the editor's
 * cursor positions.
 */
export function documentOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let fence: string | null = null;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
    } else if (fence === null) {
      const m = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
      if (m) {
        const text = stripInlineMarkup(m[2]!).trim();
        if (text !== "") items.push({ depth: m[1]!.length, text, offset });
      }
    }
    offset += line.length + 1; // +1 for the "\n" split removed
  }
  return items;
}

export interface SectionCount {
  file: string;
  role: SectionRole;
  /** First heading of the file, or null when it has none (display falls back to the file name). */
  title: string | null;
  chars: number;
  normalsider: number;
  todos: number;
  /** Content hash as last read/applied — drives the changed-on-disk indicators. */
  hash: string;
}

export interface ProjectCounts {
  sections: SectionCount[];
  /** Only sections with role "body" count toward the cap. */
  bodyChars: number;
  bodyNormalsider: number;
  cap: number;
  overCap: boolean;
  todosTotal: number;
}

/** Recompute the totals for a given set of section counts. */
function totals(sections: SectionCount[], cap: number): ProjectCounts {
  const bodyChars = sections
    .filter((s) => s.role === "body")
    .reduce((sum, s) => sum + s.chars, 0);
  const bodyNormalsider = bodyChars / CHARS_PER_NORMALSIDE;
  return {
    sections,
    bodyChars,
    bodyNormalsider,
    cap,
    overCap: bodyNormalsider > cap,
    todosTotal: sections.reduce((sum, s) => sum + s.todos, 0),
  };
}

export async function countProject(
  platform: Platform,
  project: Project,
): Promise<ProjectCounts> {
  const sections: SectionCount[] = [];
  for (const s of project.meta.sections) {
    const content = await platform.readTextFile(`${project.dir}/${s.file}`);
    const chars = countAnslag(content);
    sections.push({
      file: s.file,
      role: s.role,
      title: firstHeading(content),
      chars,
      normalsider: chars / CHARS_PER_NORMALSIDE,
      todos: countTodos(content),
      hash: hashContent(content),
    });
  }
  return totals(sections, project.meta.body_cap_normalsider);
}

/**
 * Pure update of ProjectCounts after one section's content changed (e.g. on
 * every keystroke in the editor) — keeps live counters in sync without
 * re-reading the project from disk.
 */
export function applySectionContent(
  counts: ProjectCounts,
  file: string,
  content: string,
): ProjectCounts {
  const chars = countAnslag(content);
  const sections = counts.sections.map((s) =>
    s.file === file
      ? {
          ...s,
          title: firstHeading(content),
          chars,
          normalsider: chars / CHARS_PER_NORMALSIDE,
          todos: countTodos(content),
          hash: hashContent(content),
        }
      : s,
  );
  return totals(sections, counts.cap);
}
