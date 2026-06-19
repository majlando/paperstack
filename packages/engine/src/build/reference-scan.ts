/**
 * The single source of truth for how `@`-references are found and classified in
 * Markdown prose. Both the Typst converter and the live preview consume this,
 * so the two can never drift on what counts as a citation versus a figure
 * cross-reference — the "preview and PDF always agree" rule, enforced in one
 * place instead of two parallel regexes.
 *
 * Forms (following pandoc):
 *  - bracketed `[@key]` / `[@a; @b]` / `[@key, p. 12]` → a citation span;
 *  - bare `@key` (with an optional ` [p. 12]` locator) → a narrative citation;
 *  - `@fig:label` or `[@fig:label]` → a figure cross-reference.
 * A bare `@` joined to a word, or sitting inside an email, is not matched.
 */
export type RefToken =
  | { index: number; length: number; kind: "crossref"; label: string }
  | { index: number; length: number; kind: "citation-bracketed"; span: string }
  | { index: number; length: number; kind: "citation-narrative"; key: string; locator?: string };

const SCAN =
  /(\[@[^\]]*\])|(?<![\w@])@([A-Za-z0-9_](?:[A-Za-z0-9_.:-]*[A-Za-z0-9_])?)(?:[ \t]+\[(?!@)([^\]]+)\])?/g;

/** A figure cross-reference key. Only `fig:` is label-backed today. */
const CROSSREF = /^fig:[A-Za-z0-9_-]+$/;
const BRACKET_CROSSREF = /^\[@(fig:[A-Za-z0-9_-]+)\]$/;

/** Every `@`-reference in `text`, in order, classified by kind. */
export function scanReferences(text: string): RefToken[] {
  const tokens: RefToken[] = [];
  for (const m of text.matchAll(SCAN)) {
    const base = { index: m.index, length: m[0].length };
    if (m[1] !== undefined) {
      const cross = BRACKET_CROSSREF.exec(m[1]);
      tokens.push(
        cross
          ? { ...base, kind: "crossref", label: cross[1]! }
          : { ...base, kind: "citation-bracketed", span: m[1] },
      );
    } else if (CROSSREF.test(m[2]!)) {
      tokens.push({ ...base, kind: "crossref", label: m[2]! });
    } else {
      tokens.push({ ...base, kind: "citation-narrative", key: m[2]!, locator: m[3] });
    }
  }
  return tokens;
}
