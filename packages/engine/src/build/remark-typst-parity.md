# remark→Typst emitter — parity status

Status as of 2026-06-11, measured against pandoc 3.6.3
(`-f gfm+implicit_figures+attributes -t typst --wrap=none` + the image-path
rewrite — exactly what `PandocConverter` runs).

## What matches

**Byte-identical output on every section of `fixtures/demo-report`** — the
parity test (`remark-typst-parity.test.ts`) compares against the committed
goldens in `fixtures/golden-typst/` with no normalization beyond line endings.
Covered and verified against probed pandoc output (see the unit tests for the
exact strings): headings with GitHub-style labels and dedup, paragraphs,
the full escape set (`# $ * @ < > [ ] _ \ ~ " '` plus `//`, nbsp→`~`,
`’`→`'`, `–`→`--`, `—`→`---`), emphasis/strong/strikethrough with pandoc's
`;` call-termination rules, inline code with the `#raw("…")` backtick
fallback, links (bodied, autolink, `www.` autolink, internal `#anchor` →
`label`, reference-style), tight/loose/nested/ordered lists incl.
`start ≠ 1` (`#block[#set enum(…)]`) and task lists, fenced code blocks,
implicit figures with `{width=… height=… #id}` attributes (incl. `%`→`50.0%`
and `px`→`in` conversion), GFM tables in pandoc's exact `#figure`/`#table`
layout, blockquotes, hard breaks, dropped raw HTML/comments (collapsing the
double space a dropped inline comment leaves, as pandoc does), GFM
footnotes, and image-path
resolution identical to `rewriteImagePaths`.

## Deliberate divergences (all rare in real reports)

- **Thematic breaks**: pandoc emits `#horizontalrule`, which only exists in
  pandoc's standalone template — on Paperstack's include-based build that is
  an undefined variable, i.e. the pandoc path would *fail to compile* a
  section containing `---`. The emitter emits the rule pandoc's template
  defines, inline: `#line(start: (25%, 0%), end: (75%, 0%))`.
- **Label dedup collisions**: for `# a`, `# a-1`, `# a` pandoc emits `<a-1>`
  twice; the emitter increments until unique (`<a-2>`).
- **`1)` paren-delimited ordered lists**: mdast does not record the
  delimiter, so these render as plain `+` items; pandoc preserves
  `numbering: "1)"`.
- **Formatting inside image alt text**: mdast stores alt as plain text, so
  `![*Emph* cap](x.png)` loses the emphasis in the caption (pandoc keeps it).
  Plain-text captions — what Insert Figure writes — are identical.
- **Paragraph-leading `-`/`+`**: pandoc only escapes leading `=` and `/`;
  the emitter also escapes `-` and `+` (only reachable via markdown-escaped
  literals; strictly safer in Typst).

## Pandoc warts mirrored on purpose (parity over polish, revisit post-cutover)

- `#box(image(…))` is never `;`-terminated — not even before `.`, where the
  `.` could parse as a Typst field access. Pandoc behaves identically.
- A paragraph starting `1925. was…` (markdown-escaped dot) is not escaped and
  renders as a Typst enum item — same as pandoc.
- Remote image URLs are mangled by project-path resolution on both paths
  (Typst cannot load remote images anyway).

## Still missing for the real-report cutover

- **Goldens for the migrated real report**: `report/` is git-ignored, so the
  committed goldens only cover the demo fixture. Before switching the
  default converter, run both converters over the real report and diff
  (extend `scripts/update-golden-typst.ts` locally or run it on a copy).
- **Math, citations, booktabs tables** are the next M5 tasks and land *in*
  the emitter. Note `$x$` is currently plain text on both paths (gfm has no
  math), so there is no parity gap today — and the booktabs table style will
  deliberately break golden parity for tables when it lands.
- Non-GFM constructs pandoc supports but remark-gfm has no syntax for
  (definition lists, superscript, …) are out of scope: authors cannot write
  them in Paperstack's GFM anyway.
- Pandoc stays the default converter everywhere. The emitter is opt-in via
  `PAPERSTACK_CONVERTER=remark` (or `--converter=remark`) in
  `scripts/build-report.ts`; the app does not use it yet.
