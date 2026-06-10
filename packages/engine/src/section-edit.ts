/**
 * Edits to the `sections` list in document.yaml — the single source of truth
 * for section order. Every function takes the raw YAML text and returns new
 * YAML text, going through the yaml Document API so comments and formatting
 * survive: report projects are shared over Git, and a structure edit must not
 * show up as churn across the whole file.
 */
import { parseDocument, YAMLMap, YAMLSeq } from "yaml";
import { PaperstackError } from "./errors.ts";
import { sectionFileSchema, SECTION_ROLES, type SectionRole } from "./schema.ts";

function loadSections(yamlText: string): { doc: ReturnType<typeof parseDocument>; seq: YAMLSeq } {
  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) {
    throw new PaperstackError(
      "metadata-invalid-yaml",
      `document.yaml could not be read: ${doc.errors[0]!.message}`,
    );
  }
  const seq = doc.get("sections", true);
  if (!(seq instanceof YAMLSeq)) {
    throw new PaperstackError(
      "metadata-invalid",
      "document.yaml has no sections list to edit.",
    );
  }
  return { doc, seq };
}

function fileOf(item: unknown): string | null {
  if (!(item instanceof YAMLMap)) return null;
  const file = item.get("file");
  return typeof file === "string" ? file : null;
}

function roleOf(item: unknown): string | null {
  if (!(item instanceof YAMLMap)) return null;
  const role = item.get("role");
  return typeof role === "string" ? role : null;
}

function indexOf(seq: YAMLSeq, file: string): number {
  return seq.items.findIndex((item) => fileOf(item) === file);
}

function assertValidPath(file: string): void {
  const result = sectionFileSchema.safeParse(file);
  if (!result.success) {
    throw new PaperstackError(
      "metadata-invalid",
      `"${file}": ${result.error.issues[0]!.message}`,
    );
  }
}

function assertNotListed(seq: YAMLSeq, file: string): void {
  if (indexOf(seq, file) !== -1) {
    throw new PaperstackError(
      "metadata-invalid",
      `"${file}" is already part of the report.`,
    );
  }
}

function mustFind(seq: YAMLSeq, file: string): number {
  const index = indexOf(seq, file);
  if (index === -1) {
    throw new PaperstackError(
      "metadata-invalid",
      `"${file}" is not part of the report structure.`,
    );
  }
  return index;
}

/**
 * Adds a section at the end of its role group (role groups follow the
 * canonical order: front matter, body, back matter, appendices).
 */
export function addSectionToYaml(
  yamlText: string,
  file: string,
  role: SectionRole,
): string {
  assertValidPath(file);
  const { doc, seq } = loadSections(yamlText);
  assertNotListed(seq, file);

  const order = (r: string | null): number => {
    const i = SECTION_ROLES.indexOf(r as SectionRole);
    return i === -1 ? SECTION_ROLES.indexOf("body") : i;
  };
  let insertAt = 0;
  for (let i = 0; i < seq.items.length; i++) {
    if (order(roleOf(seq.items[i])) <= order(role)) insertAt = i + 1;
  }

  const node = doc.createNode({ file, role }) as YAMLMap;
  node.flow = true; // matches the one-line `- { file: ..., role: ... }` style
  seq.items.splice(insertAt, 0, node);
  return doc.toString();
}

/**
 * Removes a section from the report structure. This is deliberately not a
 * file deletion — the Markdown file stays on disk (and in Git history).
 */
export function removeSectionFromYaml(yamlText: string, file: string): string {
  const { doc, seq } = loadSections(yamlText);
  const index = mustFind(seq, file);
  if (seq.items.length <= 1) {
    throw new PaperstackError(
      "metadata-invalid",
      "The report needs at least one section — add another section before removing this one.",
    );
  }
  seq.items.splice(index, 1);
  return doc.toString();
}

/**
 * Swaps a section with its nearest neighbour of the same role, so moving
 * matches what the role-grouped sidebar shows. At the edge of its group the
 * move is a no-op and the text is returned unchanged.
 */
export function moveSectionInYaml(
  yamlText: string,
  file: string,
  direction: "up" | "down",
): string {
  const { doc, seq } = loadSections(yamlText);
  const index = mustFind(seq, file);
  const role = roleOf(seq.items[index]);
  const step = direction === "up" ? -1 : 1;
  for (let j = index + step; j >= 0 && j < seq.items.length; j += step) {
    if (roleOf(seq.items[j]) === role) {
      const tmp = seq.items[index]!;
      seq.items[index] = seq.items[j]!;
      seq.items[j] = tmp;
      return doc.toString();
    }
  }
  return yamlText;
}

/** Points an entry at a new file path (the caller renames the file itself). */
export function renameSectionInYaml(
  yamlText: string,
  oldFile: string,
  newFile: string,
): string {
  assertValidPath(newFile);
  const { doc, seq } = loadSections(yamlText);
  assertNotListed(seq, newFile);
  const index = mustFind(seq, oldFile);
  (seq.items[index] as YAMLMap).set("file", newFile);
  return doc.toString();
}
