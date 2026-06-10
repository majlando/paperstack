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
    // named appendix-b-… must not consume a letter.
    let used = 0;
    for (const s of sameRole) {
      const m = baseOf(s.file).match(/^appendix-([a-z])[-_.]/);
      if (m) used = Math.max(used, m[1]!.charCodeAt(0) - 96);
    }
    const letter = String.fromCharCode(97 + Math.min(used, 25));
    return `${prefix}appendix-${letter}-${slug}.md`;
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
