import type { Platform } from "../platform/platform.ts";
import type { Project } from "./load-project.ts";
import type { ProjectCounts } from "./counters.ts";
import { findTodoOffsets } from "./counters.ts";
import { dirOf, resolveProjectPath } from "./paths.ts";

export type ProblemKind =
  | "over-cap"
  | "todo"
  | "missing-image"
  | "unknown-citation"
  | "unknown-reference";

export interface Problem {
  kind: ProblemKind;
  severity: "error" | "warning";
  /** Section file the problem is in, or null for a project-level problem. */
  file: string | null;
  /** Character offset for click-to-jump, when the problem has a location. */
  offset?: number;
  message: string;
}

/** Run `onLine` for every line that is not inside a fenced code block. */
function scanOutsideFences(markdown: string, onLine: (line: string, offset: number) => void): void {
  let fence: string | null = null;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const fm = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fm) {
      const marker = fm[1]![0]!;
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
    } else if (fence === null) {
      onLine(line, offset);
    }
    offset += line.length + 1;
  }
}

const IMAGE_RE = /!\[[^\]]*\]\(\s*(?:<([^>]*)>|([^)\s]+))[^)]*\)/g;
// `[@a; @b]` bracket spans and bare `@key`, the same shapes the converter reads.
const REF_RE =
  /(\[@[^\]]*\])|(?<![\w@])@([A-Za-z0-9_](?:[A-Za-z0-9_.:-]*[A-Za-z0-9_])?)/g;
const CROSSREF_RE = /^fig:[A-Za-z0-9_-]+$/;

interface ImageRef {
  src: string;
  offset: number;
}
interface RefUse {
  key: string;
  offset: number;
  bracketed: boolean;
}

function scanSection(content: string): { images: ImageRef[]; refs: RefUse[] } {
  const images: ImageRef[] = [];
  const refs: RefUse[] = [];
  scanOutsideFences(content, (line, lineOffset) => {
    for (const m of line.matchAll(IMAGE_RE)) {
      images.push({ src: (m[1] ?? m[2])!, offset: lineOffset + m.index });
    }
    for (const m of line.matchAll(REF_RE)) {
      const offset = lineOffset + m.index;
      if (m[1] !== undefined) {
        for (const item of m[1].slice(1, -1).split(";")) {
          const k = /^\s*@([A-Za-z0-9_][A-Za-z0-9_.:-]*)/.exec(item);
          if (k) refs.push({ key: k[1]!, offset, bracketed: true });
        }
      } else {
        refs.push({ key: m[2]!, offset, bracketed: false });
      }
    }
  });
  return { images, refs };
}

/** Collect every figure label (`{#fig:…}`) defined anywhere in the project. */
function definedLabels(contents: Iterable<string>): Set<string> {
  const labels = new Set<string>();
  for (const content of contents) {
    scanOutsideFences(content, (line) => {
      for (const m of line.matchAll(/#(fig:[A-Za-z0-9_-]+)/g)) labels.add(m[1]!);
    });
  }
  return labels;
}

/**
 * The pre-hand-in checklist: everything that would block or mar a clean
 * submission, gathered in one pass instead of surfacing piecemeal at export —
 * remaining TODOs, an over-cap body, missing image files, unknown citation
 * keys, and figure cross-references with no matching label. Each carries a
 * location so the UI can jump to it.
 */
export async function collectProblems(
  platform: Platform,
  project: Project,
  counts: ProjectCounts,
  bibKeys: ReadonlySet<string>,
): Promise<Problem[]> {
  const problems: Problem[] = [];
  if (counts.overCap) {
    problems.push({
      kind: "over-cap",
      severity: "error",
      file: null,
      message: `Body is ${counts.bodyNormalsider.toFixed(1)} of ${counts.cap} normalsider — over the cap.`,
    });
  }

  const contents = new Map<string, string>();
  for (const s of project.meta.sections) {
    contents.set(
      s.file,
      await platform.readTextFile(`${project.dir}/${s.file}`).catch(() => ""),
    );
  }
  const labels = definedLabels(contents.values());

  for (const s of project.meta.sections) {
    const content = contents.get(s.file)!;
    const sectionDir = dirOf(s.file);

    for (const offset of findTodoOffsets(content)) {
      problems.push({
        kind: "todo",
        severity: "warning",
        file: s.file,
        offset,
        message: "Unresolved [TODO] placeholder.",
      });
    }

    const { images, refs } = scanSection(content);

    for (const img of images) {
      if (/^(https?:|data:)/i.test(img.src)) continue; // remote/inline — not a project file
      let rel: string;
      try {
        rel = img.src.startsWith("/") ? img.src.slice(1) : resolveProjectPath(sectionDir, img.src).slice(1);
      } catch {
        problems.push({
          kind: "missing-image",
          severity: "error",
          file: s.file,
          offset: img.offset,
          message: `Image path "${img.src}" points outside the project.`,
        });
        continue;
      }
      if (!(await platform.fileExists(`${project.dir}/${rel}`))) {
        problems.push({
          kind: "missing-image",
          severity: "error",
          file: s.file,
          offset: img.offset,
          message: `Image "${img.src}" is not in the project.`,
        });
      }
    }

    for (const ref of refs) {
      if (CROSSREF_RE.test(ref.key)) {
        if (!labels.has(ref.key)) {
          problems.push({
            kind: "unknown-reference",
            severity: "error",
            file: s.file,
            offset: ref.offset,
            message: `Cross-reference @${ref.key} has no figure with that label.`,
          });
        }
      } else if (ref.bracketed && bibKeys.size > 0 && !bibKeys.has(ref.key)) {
        // Only bracketed [@key] hard-fails the export; a bare @key silently
        // stays prose, so it is not flagged.
        problems.push({
          kind: "unknown-citation",
          severity: "error",
          file: s.file,
          offset: ref.offset,
          message: `Citation [@${ref.key}] has no entry in references.bib.`,
        });
      }
    }
  }
  return problems;
}
