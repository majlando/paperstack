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

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (e) {
    throw new PaperstackError(
      "metadata-invalid-yaml",
      `document.yaml could not be read: ${(e as Error).message}`,
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
