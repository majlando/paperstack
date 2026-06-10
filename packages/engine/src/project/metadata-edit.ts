/**
 * Metadata edits on document.yaml for the report-details form. Like
 * section-edit.ts, everything goes through the yaml Document API so comments
 * and formatting written by hand survive a form save — the file is shared
 * over Git and must not churn.
 */
import { parseDocument, Scalar, YAMLMap, type Document } from "yaml";
import { PaperstackError } from "../errors.ts";
import { documentSchema, type Author } from "./schema.ts";

export interface MetadataEdit {
  title?: string;
  /** Optional text fields: an empty/whitespace value removes the key. */
  subtitle?: string;
  course?: string;
  institution?: string;
  date?: string;
  language?: "en" | "da";
  body_cap_normalsider?: number;
  /** Replaces the whole list; entries without a student id omit the key. */
  authors?: Author[];
}

/** Key order for newly inserted keys — matches the scaffold's layout. */
const CANONICAL_ORDER = [
  "title",
  "subtitle",
  "course",
  "institution",
  "authors",
  "date",
  "language",
  "body_cap_normalsider",
  "sections",
];

function keyName(pairKey: unknown): string {
  return pairKey instanceof Scalar ? String(pairKey.value) : String(pairKey);
}

/** Replace in place when the key exists; otherwise insert at its canonical spot. */
function setInOrder(doc: Document, map: YAMLMap, key: string, value: unknown): void {
  const node = doc.createNode(value);
  if (map.has(key)) {
    map.set(key, node);
    return;
  }
  const pair = doc.createPair(key, node);
  const target = CANONICAL_ORDER.indexOf(key);
  let insertAt = map.items.length;
  for (let i = 0; i < map.items.length; i++) {
    const position = CANONICAL_ORDER.indexOf(keyName(map.items[i]!.key));
    if (position !== -1 && position > target) {
      insertAt = i;
      break;
    }
  }
  map.items.splice(insertAt, 0, pair);
}

export function editMetadataInYaml(yamlText: string, edit: MetadataEdit): string {
  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) {
    throw new PaperstackError(
      "metadata-invalid-yaml",
      `document.yaml could not be read: ${doc.errors[0]!.message}`,
    );
  }
  const map = doc.contents;
  if (!(map instanceof YAMLMap)) {
    throw new PaperstackError(
      "metadata-invalid",
      "document.yaml has no report metadata to edit.",
    );
  }

  // Mutating an existing scalar's value keeps its quoting style; only new
  // keys get fresh nodes (inserted in canonical order, not appended).
  const setScalar = (key: string, value: string | number) => {
    const existing: unknown = map.get(key, true);
    if (existing instanceof Scalar) existing.value = value;
    else setInOrder(doc, map, key, value);
  };
  const setOptionalText = (key: string, value: string | undefined) => {
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed === "") doc.delete(key);
    else setScalar(key, trimmed);
  };

  if (edit.title !== undefined) setScalar("title", edit.title.trim());
  setOptionalText("subtitle", edit.subtitle);
  setOptionalText("course", edit.course);
  setOptionalText("institution", edit.institution);
  setOptionalText("date", edit.date);
  if (edit.language !== undefined) setScalar("language", edit.language);
  if (edit.body_cap_normalsider !== undefined) {
    setScalar("body_cap_normalsider", edit.body_cap_normalsider);
  }
  if (edit.authors !== undefined) {
    const authors = edit.authors
      .map((a) => ({ name: a.name.trim(), student_id: a.student_id?.trim() }))
      .filter((a) => a.name !== "")
      .map((a) => (a.student_id ? a : { name: a.name }));
    setInOrder(doc, map, "authors", authors);
  }

  // The result must still be a loadable document — same schema as the loader.
  const result = documentSchema.safeParse(doc.toJS());
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(document)"}: ${i.message}`,
    );
    throw new PaperstackError(
      "metadata-invalid",
      `The report details could not be saved:\n${lines.join("\n")}`,
    );
  }

  return doc.toString();
}
