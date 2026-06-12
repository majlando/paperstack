import type { Section, SectionRole } from "./schema.ts";
import { baseOf, dirOf, slugify } from "./paths.ts";

/**
 * Picks a file path for a new section, following the project's own filename
 * conventions (purely cosmetic — order lives in document.yaml). New files go
 * where existing sections of the same role live: migrated reports may keep
 * everything at the project root, so never hardcode sections//appendices/.
 */
export function newSectionFile(
  sections: Section[],
  role: SectionRole,
  name: string,
): string {
  const slug = slugify(name);
  const sameRole = sections.filter((s) => s.role === role);
  const fallbackDir = role === "appendix" ? "appendices" : "sections";
  const dir = sameRole.length > 0 ? dirOf(sameRole[sameRole.length - 1]!.file) : fallbackDir;
  const prefix = dir === "" ? "" : `${dir}/`;

  if (role === "appendix") {
    // Next letter after the highest in use — counting would repeat letters
    // after a removal (remove appendix-a, add → "a" again beside appendix-b).
    // Only real appendices are scanned: a body section that happens to be
    // named appendix-b-… must not consume a letter. Letters continue past z
    // as aa, ab, … — the filename letter is purely cosmetic (the PDF letters
    // appendices by document.yaml order), so a hand-named appendix-ab-… at
    // worst nudges the next generated name, never the report.
    let used = 0;
    for (const s of sameRole) {
      const m = baseOf(s.file).match(/^appendix-([a-z]{1,2})[-_.]/);
      if (m) {
        let value = 0;
        for (const ch of m[1]!) value = value * 26 + (ch.charCodeAt(0) - 96);
        used = Math.max(used, value);
      }
    }
    return `${prefix}appendix-${appendixLetters(used + 1)}-${slug}.md`;
  }
  // Numbered prefixes share one sequence per folder, whatever the role.
  let max = 0;
  for (const s of sections) {
    if (dirOf(s.file) !== dir) continue;
    const m = baseOf(s.file).match(/^(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}-${slug}.md`;
}

/** 1 → "a", 26 → "z", 27 → "aa" — bijective base-26, so letters never clamp. */
function appendixLetters(n: number): string {
  let out = "";
  while (n > 0) {
    out = String.fromCharCode(97 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
