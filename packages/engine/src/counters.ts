import type { Platform } from "./platform.ts";
import type { Project } from "./project.ts";
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

/**
 * Counts genuine `[TODO` placeholders. A backtick directly before (inline
 * code like `` `[TODO]` ``) means the text *discusses* a TODO and is not one.
 */
export function countTodos(markdown: string): number {
  return (markdown.match(/(?<!`)\[TODO/g) ?? []).length;
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
  const bodyChars = sections
    .filter((s) => s.role === "body")
    .reduce((sum, s) => sum + s.chars, 0);
  const bodyNormalsider = bodyChars / CHARS_PER_NORMALSIDE;
  const cap = project.meta.body_cap_normalsider;
  return {
    sections,
    bodyChars,
    bodyNormalsider,
    cap,
    overCap: bodyNormalsider > cap,
    todosTotal: sections.reduce((sum, s) => sum + s.todos, 0),
  };
}
