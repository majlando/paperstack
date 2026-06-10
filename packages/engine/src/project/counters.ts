import type { Platform } from "../platform/platform.ts";
import type { Project } from "./load-project.ts";
import type { SectionRole } from "./schema.ts";

/** Danish academic page unit: 1 normalside = 2400 characters (anslag). */
export const CHARS_PER_NORMALSIDE = 2400;

/**
 * Character count for the length cap. HTML comments are authoring notes and
 * are stripped; carriage returns are stripped so counts are identical across
 * Windows/Unix checkouts.
 */
export function countAnslag(markdown: string): number {
  return markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "").length;
}

/** Genuine `[TODO` placeholders in prose (not comments/code). */
const TODO_MARKER = /\[TODO/g;

interface Range {
  start: number;
  end: number;
}

function maskRanges(text: string, ranges: Range[]): string {
  if (ranges.length === 0) return text;
  const chars = [...text];
  for (const { start, end } of ranges) {
    for (let i = Math.max(0, start); i < Math.min(chars.length, end); i += 1) chars[i] = " ";
  }
  return chars.join("");
}

function findCommentRanges(markdown: string): Range[] {
  const ranges: Range[] = [];
  let cursor = 0;
  while (cursor < markdown.length) {
    const start = markdown.indexOf("<!--", cursor);
    if (start === -1) break;
    const endMarker = markdown.indexOf("-->", start + 4);
    const end = endMarker === -1 ? markdown.length : endMarker + 3;
    ranges.push({ start, end });
    cursor = end;
  }
  return ranges;
}

function findFenceRanges(markdown: string): Range[] {
  const ranges: Range[] = [];
  let fenceStart: number | null = null;
  let fenceChar: "`" | "~" | null = null;
  let fenceLen = 0;
  let lineStart = 0;

  while (lineStart < markdown.length) {
    const lineEnd = markdown.indexOf("\n", lineStart);
    const lineStop = lineEnd === -1 ? markdown.length : lineEnd + 1;
    const line = markdown.slice(lineStart, lineEnd === -1 ? markdown.length : lineEnd);
    const match = line.match(/^ {0,3}([`~]{3,})/);

    if (!fenceChar && match) {
      const marker = match[1] as string;
      fenceChar = marker[0] as "`" | "~";
      fenceLen = marker.length;
      fenceStart = lineStart;
    } else if (fenceChar) {
      const close = line.match(/^ {0,3}([`~]{3,})/);
      if (close) {
        const marker = close[1] as string;
        if (marker[0] === fenceChar && marker.length >= fenceLen) {
          ranges.push({ start: fenceStart ?? lineStart, end: lineStop });
          fenceStart = null;
          fenceChar = null;
          fenceLen = 0;
        }
      }
    }

    lineStart = lineStop;
  }

  if (fenceChar && fenceStart !== null) ranges.push({ start: fenceStart, end: markdown.length });
  return ranges;
}

function findInlineCodeRanges(markdown: string): Range[] {
  const ranges: Range[] = [];
  let i = 0;
  while (i < markdown.length) {
    if (markdown[i] !== "`") {
      i += 1;
      continue;
    }

    let openLen = 1;
    while (markdown[i + openLen] === "`") openLen += 1;
    let cursor = i + openLen;
    let closed = false;
    while (cursor < markdown.length) {
      if (markdown[cursor] !== "`") {
        cursor += 1;
        continue;
      }
      let closeLen = 1;
      while (markdown[cursor + closeLen] === "`") closeLen += 1;
      if (closeLen === openLen) {
        ranges.push({ start: i, end: cursor + closeLen });
        i = cursor + closeLen;
        closed = true;
        break;
      }
      cursor += closeLen;
    }
    if (!closed) i += openLen;
  }
  return ranges;
}

function stripTodoIgnoredContent(markdown: string): string {
  const withoutCommentsAndFences = maskRanges(markdown, [
    ...findCommentRanges(markdown),
    ...findFenceRanges(markdown),
  ]);
  return maskRanges(withoutCommentsAndFences, findInlineCodeRanges(withoutCommentsAndFences));
}

/** Character offsets of every `[TODO` marker — drives the editor's click-to-jump. */
export function findTodoOffsets(markdown: string): number[] {
  const searchable = stripTodoIgnoredContent(markdown);
  return [...searchable.matchAll(TODO_MARKER)].map((m) => m.index ?? 0);
}

export function countTodos(markdown: string): number {
  return findTodoOffsets(markdown).length;
}

export interface SectionCount {
  file: string;
  role: SectionRole;
  chars: number;
  normalsider: number;
  todos: number;
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
      chars,
      normalsider: chars / CHARS_PER_NORMALSIDE,
      todos: countTodos(content),
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
          chars,
          normalsider: chars / CHARS_PER_NORMALSIDE,
          todos: countTodos(content),
        }
      : s,
  );
  return totals(sections, counts.cap);
}
