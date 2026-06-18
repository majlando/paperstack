import type { Platform } from "../platform/platform.ts";
import { PaperstackError } from "../errors.ts";
import { SEA_TEMPLATE } from "../build/template.ts";

export interface CreateProjectOptions {
  title: string;
  language?: "en" | "da";
  /** ISO date (YYYY-MM-DD) for document.yaml — injected so writes stay deterministic. */
  date?: string;
}

/**
 * Scaffolds a new SEA report project: document.yaml, starter sections, a
 * .gitignore that keeps generated output out of the group's repo, and a
 * .gitattributes that keeps line endings consistent across the group's
 * machines. Everything is written deterministically (stable key order,
 * trailing newlines) so the very first commit of a shared project is clean.
 */
export async function createProject(
  platform: Platform,
  dir: string,
  options: CreateProjectOptions,
): Promise<void> {
  if (await platform.fileExists(`${dir}/document.yaml`)) {
    throw new PaperstackError(
      "project-exists",
      `This folder already contains a Paperstack report. Open it instead of creating a new one.`,
      `${dir}/document.yaml exists`,
    );
  }

  const lang = options.language ?? "en";
  const da = lang === "da";
  const dateLine = options.date ? `date: "${options.date}"\n` : "";

  // JSON string escaping is valid YAML double-quote escaping.
  const documentYaml =
    `title: ${JSON.stringify(options.title)}\n` +
    `course: ""\n` +
    `institution: ""\n` +
    `authors: [] # - { name: "Full Name", student_id: "12345" }\n` +
    dateLine +
    `language: ${lang}\n` +
    `body_cap_normalsider: 40\n` +
    `sections:\n` +
    `  - { file: sections/00-abstract.md, role: front-matter }\n` +
    `  - { file: sections/01-introduction.md, role: body }\n`;

  // An abstract is unnumbered front matter (it does not count toward the cap)
  // and sits before the body — a SEA report opens with one, so scaffold it.
  const abstract = da
    ? `# Resumé\n\n[TODO: Sammenfat rapporten i et kort afsnit.]\n`
    : `# Abstract\n\n[TODO: Summarise the report in a short paragraph.]\n`;
  const introduction = da
    ? `# Indledning\n\n[TODO: Beskriv projektet.]\n`
    : `# Introduction\n\n[TODO: Introduce the project.]\n`;
  // The References section is generated from references.bib at export —
  // the scaffolded file documents the workflow with commented-out examples
  // and stays inert (no empty References heading) until a real entry exists.
  const references = da
    ? `% Referencer til rapporten (BibTeX). Citér i en sektion med [@nøgle],\n` +
      `% fx [@knuth84] eller [@knuth84, s. 12]. Referencelisten genereres\n` +
      `% automatisk i PDF'en, før eventuelle bilag. Indtil en rigtig post\n` +
      `% findes herunder, forbliver [@...] almindelig tekst.\n` +
      `%\n` +
      `% @book{knuth84,\n` +
      `%   title     = {The {TeX}book},\n` +
      `%   author    = {Donald E. Knuth},\n` +
      `%   year      = {1984},\n` +
      `%   publisher = {Addison-Wesley}\n` +
      `% }\n` +
      `% @online{typst-docs,\n` +
      `%   title   = {Typst Documentation},\n` +
      `%   url     = {https://typst.app/docs/},\n` +
      `%   urldate = {2026-06-11}\n` +
      `% }\n`
    : `% References for this report (BibTeX). Cite in any section with [@key],\n` +
      `% e.g. [@knuth84] or [@knuth84, p. 12]. The reference list is generated\n` +
      `% in the PDF automatically, before any appendix. Until a real entry\n` +
      `% exists below, [@...] stays plain text.\n` +
      `%\n` +
      `% @book{knuth84,\n` +
      `%   title     = {The {TeX}book},\n` +
      `%   author    = {Donald E. Knuth},\n` +
      `%   year      = {1984},\n` +
      `%   publisher = {Addison-Wesley}\n` +
      `% }\n` +
      `% @online{typst-docs,\n` +
      `%   title   = {Typst Documentation},\n` +
      `%   url     = {https://typst.app/docs/},\n` +
      `%   urldate = {2026-06-11}\n` +
      `% }\n`;

  await platform.mkdir(`${dir}/sections`);
  await platform.mkdir(`${dir}/figures`);
  await platform.mkdir(`${dir}/diagrams`);
  await platform.writeTextFile(`${dir}/document.yaml`, documentYaml);
  await writeIfAbsent(platform, `${dir}/paperstack-template.typ`, SEA_TEMPLATE);
  // The chosen folder may not be empty (e.g. an existing group repo):
  // never overwrite files that are already there.
  await writeIfAbsent(platform, `${dir}/sections/00-abstract.md`, abstract);
  await writeIfAbsent(platform, `${dir}/sections/01-introduction.md`, introduction);
  await writeIfAbsent(platform, `${dir}/references.bib`, references);
  await ensureGitignore(platform, dir);
  // Mixed Windows/macOS groups hit CRLF diff churn in week one without this.
  await writeIfAbsent(platform, `${dir}/.gitattributes`, `* text=auto\n`);
}

async function writeIfAbsent(platform: Platform, path: string, content: string): Promise<void> {
  if (!(await platform.fileExists(path))) await platform.writeTextFile(path, content);
}

/**
 * Adds the generated-files rules to .gitignore, preserving any existing one.
 * diagrams/rendered/ is deliberately NOT ignored: the renders are
 * content-hashed and deterministic, so committing them is conflict-free and
 * lets group members (and CI) build sections containing diagrams they never
 * opened in Paperstack.
 */
async function ensureGitignore(platform: Platform, dir: string): Promise<void> {
  const path = `${dir}/.gitignore`;
  const header = `# Generated by Paperstack — build output is recreated on demand\n`;
  // *.paperstack-tmp: atomic-write temp files orphaned by a crash — never
  // meaningful to commit, and confusing in a group's repo.
  const rules = ["output/", "*.paperstack-tmp"];
  if (!(await platform.fileExists(path))) {
    await platform.writeTextFile(path, header + rules.join("\n") + "\n");
    return;
  }
  const existing = await platform.readTextFile(path);
  // Whole-line comparison: "build-output/" or a comment that mentions
  // output/ must not count as the rule already being there.
  const present = new Set(
    existing.split(/\r?\n/).map((line) => line.trim().replace(/^\//, "")),
  );
  const missing = rules.filter((rule) => !present.has(rule));
  if (missing.length === 0) return;
  await platform.writeTextFile(
    path,
    `${existing.replace(/\n*$/, "\n\n")}${header}${missing.join("\n")}\n`,
  );
}
