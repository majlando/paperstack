/**
 * Structured reading and writing of references.bib so the app can manage
 * entries through a form instead of hand-editing BibTeX. Deliberately small:
 * it round-trips the fields the UI exposes and leaves Typst to do the real
 * rendering. Writes are deterministic (stable field order, brace-wrapped
 * values, trailing newline) so a group's references.bib stays churn-free in
 * Git.
 */
import { balancedBody } from "./bibliography.ts";

export interface BibField {
  name: string;
  value: string;
}

export interface BibRecord {
  key: string;
  /** Entry type, lowercased: "article", "book", "online", … */
  type: string;
  fields: BibField[];
}

/** Conventional field order for readable, stable output; the rest follow alphabetically. */
const FIELD_ORDER = [
  "author",
  "title",
  "year",
  "date",
  "journal",
  "booktitle",
  "publisher",
  "address",
  "editor",
  "volume",
  "number",
  "pages",
  "edition",
  "series",
  "url",
  "doi",
  "isbn",
  "urldate",
  "note",
];

function orderIndex(name: string): number {
  const i = FIELD_ORDER.indexOf(name.toLowerCase());
  return i === -1 ? FIELD_ORDER.length : i;
}

/** Serialize one entry: `@type{key,\n  field = {value},\n  …\n}\n`. */
export function formatBibEntry(record: BibRecord): string {
  const fields = record.fields
    .filter((f) => f.name.trim() !== "" && f.value.trim() !== "")
    .map((f) => ({ name: f.name.trim().toLowerCase(), value: f.value.trim() }))
    .sort((a, b) => orderIndex(a.name) - orderIndex(b.name) || a.name.localeCompare(b.name));
  const body = fields.map((f) => `  ${f.name} = {${f.value}}`).join(",\n");
  return `@${record.type.trim().toLowerCase()}{${record.key.trim()},\n${body}\n}\n`;
}

/** Whether the opener at `index` sits on a `%`-commented line (an example entry). */
function commentedAt(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*%/.test(text.slice(lineStart, index));
}

interface EntrySpan {
  key: string;
  type: string;
  /** Start of `@` in the raw text. */
  start: number;
  /** Index just past the closing `}`. */
  end: number;
  bodyOpen: number;
}

/** Every real (non-commented) entry's raw span, in document order. */
function entrySpans(text: string): EntrySpan[] {
  const spans: EntrySpan[] = [];
  const opener = /@([A-Za-z]+)\s*\{\s*([^,\s{}]+)\s*,/g;
  for (const m of text.matchAll(opener)) {
    const type = m[1]!.toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") continue;
    if (commentedAt(text, m.index)) continue;
    const bodyOpen = m.index + m[0].indexOf("{");
    const body = balancedBody(text, bodyOpen);
    if (body === null) continue;
    spans.push({ key: m[2]!, type, start: m.index, end: bodyOpen + body.length + 2, bodyOpen });
  }
  return spans;
}

/** Parse every `name = value` field from an entry body, in written order. */
function parseFields(body: string): BibField[] {
  const fields: BibField[] = [];
  const re = /(?:^|,)\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    let i = m.index + m[0].length;
    const open = body[i];
    let raw: string;
    if (open === "{") {
      const inner = balancedBody(body, i);
      if (inner === null) break;
      raw = inner;
      i += inner.length + 2;
    } else if (open === '"') {
      const end = body.indexOf('"', i + 1);
      if (end === -1) break;
      raw = body.slice(i + 1, end);
      i = end + 1;
    } else {
      const end = body.indexOf(",", i);
      raw = body.slice(i, end === -1 ? body.length : end);
      i = end === -1 ? body.length : end;
    }
    const value = raw.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
    if (value !== "") fields.push({ name: m[1]!.toLowerCase(), value });
    re.lastIndex = i;
  }
  return fields;
}

/** Read every real entry as a full record, for the references manager. */
export function readBibRecords(text: string): BibRecord[] {
  return entrySpans(text).map((s) => ({
    key: s.key,
    type: s.type,
    fields: parseFields(text.slice(s.bodyOpen + 1, s.end - 1)),
  }));
}

/**
 * Replace the entry with `record.key`, or append it when none exists. The rest
 * of the file (comments, other entries, ordering) is preserved.
 */
export function upsertBibEntry(text: string, record: BibRecord): string {
  const formatted = formatBibEntry(record);
  const existing = entrySpans(text).find((s) => s.key === record.key);
  if (existing) {
    return text.slice(0, existing.start) + formatted.replace(/\n$/, "") + text.slice(existing.end);
  }
  const base = text.replace(/\s*$/, "");
  return base === "" ? formatted : `${base}\n\n${formatted}`;
}

/** Remove the entry for `key` (and the surrounding blank lines it leaves). */
export function removeBibEntry(text: string, key: string): string {
  const span = entrySpans(text).find((s) => s.key === key);
  if (!span) return text;
  const before = text.slice(0, span.start).replace(/\n*$/, "");
  const after = text.slice(span.end).replace(/^\n*/, "");
  if (before === "") return after;
  if (after === "") return `${before}\n`;
  return `${before}\n\n${after}`;
}
