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
