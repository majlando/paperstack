/**
 * Minimal BibTeX reading for citations (Milestone 5): just enough to know
 * which keys exist (the emitter validates `[@key]` spans against them) and
 * to list entries readably in the Insert Citation helper. Typst's native
 * bibliography does the real rendering — this never formats references.
 */

export interface BibEntry {
  key: string;
  /** Entry type as written, lowercased: "article", "book", "online", … */
  type: string;
  title?: string;
  author?: string;
  year?: string;
}

/**
 * Parses the entries of a references.bib. Tolerant by design: malformed
 * entries and unknown constructs (@comment, @preamble, @string) are skipped
 * rather than failing the build — Typst itself reports real .bib syntax
 * errors with line numbers when it compiles the bibliography.
 */
export function parseBibliography(text: string): BibEntry[] {
  // %-prefixed lines are BibTeX comments — the scaffolded references.bib
  // ships example entries commented out, and they must not count as real.
  const source = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*%/.test(line))
    .join("\n");
  const entries: BibEntry[] = [];
  const opener = /@([A-Za-z]+)\s*\{\s*([^,\s{}]+)\s*,/g;
  for (const m of source.matchAll(opener)) {
    const type = m[1]!.toLowerCase();
    if (type === "comment" || type === "preamble" || type === "string") continue;
    const body = balancedBody(source, m.index + m[0].indexOf("{"));
    if (body === null) continue;
    const entry: BibEntry = { key: m[2]!, type };
    entry.title = field(body, "title");
    entry.author = field(body, "author");
    entry.year = field(body, "year") ?? field(body, "date")?.slice(0, 4);
    entries.push(entry);
  }
  return entries;
}

/** The keys of every entry, for validating `[@key]` spans. */
export function bibliographyKeys(text: string): Set<string> {
  return new Set(parseBibliography(text).map((e) => e.key));
}

/** The content between the brace at `openBrace` and its balanced match. */
function balancedBody(text: string, openBrace: number): string | null {
  let depth = 0;
  for (let i = openBrace; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(openBrace + 1, i);
    }
  }
  return null;
}

/** A field's value with braces stripped and whitespace collapsed. */
function field(body: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*`, "i").exec(body);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const open = body[i];
  let raw: string;
  if (open === "{") {
    const inner = balancedBody(body, i);
    if (inner === null) return undefined;
    raw = inner;
  } else if (open === '"') {
    const end = body.indexOf('"', i + 1);
    if (end === -1) return undefined;
    raw = body.slice(i + 1, end);
  } else {
    const end = body.indexOf(",", i);
    raw = body.slice(i, end === -1 ? body.length : end);
  }
  const value = raw.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  return value === "" ? undefined : value;
}
