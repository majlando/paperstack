/**
 * Project-wide text search. Pure text logic only — reading the section files
 * and choosing what content to search (disk vs. unsaved editor text) is the
 * caller's job, so the same function serves the app and any future CLI.
 */

export interface SearchMatch {
  /** 1-based line number of the match. */
  line: number;
  /** Character offset of the match in the searched content — drives editor jumps. */
  offset: number;
  /** Offset of the match within `preview` (for highlighting). */
  column: number;
  /** The matched line, without its line ending. */
  preview: string;
}

/**
 * Case-insensitive substring search. Matches never span lines (the query is
 * what a writer would type into a search box, not a regex), and overlapping
 * occurrences report once per non-overlapping position.
 */
export function searchContent(content: string, query: string): SearchMatch[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const matches: SearchMatch[] = [];
  const lines = content.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.replace(/\r$/, "");
    const lower = line.toLowerCase();
    let column = lower.indexOf(q);
    while (column !== -1) {
      matches.push({ line: i + 1, offset: offset + column, column, preview: line });
      column = lower.indexOf(q, column + q.length);
    }
    offset += raw.length + 1; // +1 for the split-away \n
  }
  return matches;
}
