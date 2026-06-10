import type { DocumentMeta, SectionRole } from "../project/schema.ts";
import type { ProjectCounts } from "../project/counters.ts";

export function escapeTypstString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** The length line shown on the cover, localized to the document language. */
export function buildLengthLine(meta: DocumentMeta, counts: ProjectCounts): string {
  const ns = counts.bodyNormalsider.toFixed(2);
  if (meta.language === "da") {
    const chars = counts.bodyChars.toLocaleString("da-DK");
    return `Anslag (brødtekst): ${chars} / ${ns.replace(".", ",")} normalsider (grænse: ${counts.cap}, 1 normalside = 2.400 anslag)`;
  }
  const chars = counts.bodyChars.toLocaleString("en-US");
  return `Length (body): ${chars} characters / ${ns} normalsider (cap: ${counts.cap}, 1 normalside = 2,400 characters)`;
}

export interface ConvertedSection {
  /** Root-absolute Typst include path, e.g. "/output/.build/converted/001-intro.typ". */
  path: string;
  role: SectionRole;
}

/**
 * Generates main.typ: template call + includes, with heading numbering
 * switched by section role (front/back matter unnumbered, body "1.1",
 * appendices "A.1." with the heading counter reset).
 */
export function generateMainTypst(
  meta: DocumentMeta,
  sections: ConvertedSection[],
  lengthLine: string,
): string {
  const lines: string[] = [];
  lines.push(`#import "/output/.build/sea.typ": report`, "");
  lines.push(`#show: report.with(`);
  lines.push(`  title: "${escapeTypstString(meta.title)}",`);
  if (meta.subtitle) lines.push(`  subtitle: "${escapeTypstString(meta.subtitle)}",`);
  if (meta.course) lines.push(`  course: "${escapeTypstString(meta.course)}",`);
  if (meta.institution)
    lines.push(`  institution: "${escapeTypstString(meta.institution)}",`);
  if (meta.authors.length > 0) {
    const authors = meta.authors
      .map((a) => {
        const display = a.student_id ? `${a.name} (${a.student_id})` : a.name;
        return `"${escapeTypstString(display)}"`;
      })
      .join(", ");
    lines.push(`  authors: (${authors},),`);
  }
  if (meta.date) lines.push(`  date: "${escapeTypstString(meta.date)}",`);
  lines.push(`  language: "${meta.language}",`);
  lines.push(`  length-line: "${escapeTypstString(lengthLine)}",`);
  lines.push(`)`, "");

  type Mode = "plain" | "body" | "appendix";
  const modeFor = (role: SectionRole): Mode =>
    role === "body" ? "body" : role === "appendix" ? "appendix" : "plain";

  let current: Mode | null = null;
  for (const section of sections) {
    const mode = modeFor(section.role);
    if (mode !== current) {
      lines.push("");
      if (mode === "plain") {
        lines.push(`#set heading(numbering: none)`);
      } else if (mode === "body") {
        lines.push(`#set heading(numbering: "1.1")`);
        lines.push(`#counter(heading).update(0)`);
      } else {
        lines.push(`#set heading(numbering: "A.1.")`);
        lines.push(`#counter(heading).update(0)`);
      }
      current = mode;
    }
    lines.push(`#include "${section.path}"`);
  }
  lines.push("");
  return lines.join("\n");
}
