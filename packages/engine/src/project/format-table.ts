/**
 * GFM table authoring helpers (Milestone 5): a skeleton generator for the
 * Insert Table button and a pure re-align transform for "Format table".
 * Text in, text out — the editor decides where the cursor is and applies
 * the returned edit.
 */

/** A GFM table skeleton: empty header, delimiter row, empty body rows. */
export function tableMarkdown(rows: number, cols: number): string {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const cells = `|${"     |".repeat(c)}`;
  const delim = `|${" --- |".repeat(c)}`;
  return [cells, delim, ...Array.from({ length: r }, () => cells)].join("\n");
}

export interface TableEdit {
  /** Character range of the table block in the original text. */
  from: number;
  to: number;
  /** The re-aligned table. */
  text: string;
}

/**
 * Re-aligns the pipes of the GFM table containing `offset`: every column is
 * padded to its widest cell, alignment colons are preserved, cell content is
 * untouched. Returns null when the offset is not inside a recognizable table
 * (leading-pipe rows with a delimiter as the second line).
 */
export function formatTableAt(text: string, offset: number): TableEdit | null {
  const lines = text.split("\n");
  // line index + start offset of each line
  const starts: number[] = [];
  let pos = 0;
  for (const line of lines) {
    starts.push(pos);
    pos += line.length + 1;
  }
  const at = Math.min(Math.max(offset, 0), text.length);
  let lineIdx = starts.findIndex((s, i) => at >= s && at <= s + lines[i]!.length);
  if (lineIdx === -1) lineIdx = lines.length - 1;

  const isRow = (i: number) => i >= 0 && i < lines.length && /^\s*\|/.test(lines[i]!);
  if (!isRow(lineIdx)) return null;
  let first = lineIdx;
  while (isRow(first - 1)) first--;
  let last = lineIdx;
  while (isRow(last + 1)) last++;
  if (last - first < 1) return null;

  const delimiter = lines[first + 1]!;
  if (!/^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(delimiter.replace(/\r$/, ""))) return null;

  const indent = /^\s*/.exec(lines[first]!)![0];
  const rows: string[][] = [];
  for (let i = first; i <= last; i++) {
    if (i === first + 1) continue; // the delimiter is regenerated
    rows.push(splitCells(lines[i]!.replace(/\r$/, "")));
  }
  const aligns = splitCells(delimiter.replace(/\r$/, "")).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    return left && right ? "center" : right ? "right" : left ? "left" : "none";
  });

  const columns = Math.max(aligns.length, ...rows.map((r) => r.length));
  const widths = Array.from({ length: columns }, (_, col) =>
    Math.max(3, ...rows.map((r) => [...(r[col] ?? "")].length)),
  );

  const pad = (cell: string, col: number) =>
    cell + " ".repeat(widths[col]! - [...cell].length);
  const delimCell = (col: number) => {
    const a = aligns[col] ?? "none";
    const dashes = (n: number) => "-".repeat(n);
    if (a === "center") return `:${dashes(widths[col]! - 2)}:`;
    if (a === "right") return `${dashes(widths[col]! - 1)}:`;
    if (a === "left") return `:${dashes(widths[col]! - 1)}`;
    return dashes(widths[col]!);
  };

  const render = (cells: string[]) =>
    `${indent}| ${Array.from({ length: columns }, (_, c) => pad(cells[c] ?? "", c)).join(" | ")} |`;
  const out = [
    render(rows[0]!),
    `${indent}| ${Array.from({ length: columns }, (_, c) => delimCell(c)).join(" | ")} |`,
    ...rows.slice(1).map(render),
  ];

  const from = starts[first]!;
  const lastLine = lines[last]!;
  const crlf = lastLine.endsWith("\r");
  const to = starts[last]! + lastLine.length - (crlf ? 1 : 0);
  return { from, to, text: out.join(crlf ? "\r\n" : "\n") };
}

/** Cells of a `| a | b |` row — `\|` stays literal, outer pipes dropped. */
function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (c === "\\" && trimmed[i + 1] === "|") {
      current += "\\|";
      i++;
    } else if (c === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  cells.push(current.trim());
  return cells;
}
