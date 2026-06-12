import { parse } from "yaml";
import type { Platform } from "../platform/platform.ts";
import { PaperstackError } from "../errors.ts";
import { documentSchema, type DocumentMeta } from "./schema.ts";

export interface Project {
  /** Project root directory (forward slashes, no trailing slash). */
  dir: string;
  meta: DocumentMeta;
}

export async function loadProject(platform: Platform, dir: string): Promise<Project> {
  const metaPath = `${dir}/document.yaml`;
  if (!(await platform.fileExists(metaPath))) {
    throw new PaperstackError(
      "metadata-missing",
      `No document.yaml was found in "${dir}". Every Paperstack project needs one — check that you opened the right folder.`,
    );
  }

  const raw = await platform.readTextFile(metaPath);

  // The likeliest broken state after a bad merge of the shared structure
  // file — name it instead of surfacing a YAML parse error.
  if (/^<{7}( |\r?$)/m.test(raw)) {
    throw new PaperstackError(
      "metadata-conflict-markers",
      `document.yaml contains unresolved Git merge conflict markers (<<<<<<<). ` +
        `Open it in a text editor, keep the lines that are right, delete the ` +
        `<<<<<<<, =======, and >>>>>>> lines, then reload the project.`,
    );
  }

  // An unquoted `student_id: 0123456` parses as the integer 123456 — the
  // wrong id would print on the exam cover, and the zeros are unrecoverable
  // after parsing. Ids without a leading zero stay tolerated as numbers.
  const zeroId = /student_id:[ \t]*(0\d+)[ \t]*(?=[,}#\r\n]|$)/m.exec(raw);
  if (zeroId !== null) {
    throw new PaperstackError(
      "metadata-invalid",
      `A student id that starts with 0 must be quoted to keep the zero: ` +
        `write student_id: "${zeroId[1]}" in document.yaml.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (e) {
    // The yaml library's multi-document error suggests calling one of its
    // own APIs — meaningless advice for a report writer.
    const message = (e as Error).message.includes("parseAllDocuments")
      ? "it contains more than one YAML document (a stray --- line?). A report has exactly one."
      : (e as Error).message;
    throw new PaperstackError(
      "metadata-invalid-yaml",
      `document.yaml could not be read: ${message}`,
    );
  }
  if (parsed === null || parsed === undefined) {
    throw new PaperstackError(
      "metadata-invalid",
      `document.yaml is empty — it should hold the report metadata (title, sections). ` +
        `Restore it from Git, or create the project again.`,
    );
  }

  const result = documentSchema.safeParse(parsed);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(document)"}: ${i.message}`,
    );
    throw new PaperstackError(
      "metadata-invalid",
      `document.yaml has invalid report metadata:\n${lines.join("\n")}`,
    );
  }

  const missing: string[] = [];
  for (const s of result.data.sections) {
    if (!(await platform.fileExists(`${dir}/${s.file}`))) missing.push(s.file);
  }
  if (missing.length > 0) {
    throw new PaperstackError(
      "section-missing",
      `These section files are listed in document.yaml but could not be found:\n` +
        missing.map((m) => `  - ${m}`).join("\n") +
        `\nCheck that the files exist, or remove them from the report structure.`,
    );
  }

  return { dir, meta: result.data };
}
