# remark→Typst emitter — parity status

Status as of 2026-06-11, measured against pandoc 3.6.3
(`-f gfm+implicit_figures+attributes -t typst --wrap=none` + the image-path
rewrite — exactly what `PandocConverter` runs).

**The emitter is the default converter everywhere** (M5 cutover, 2026-06-11):
byte-identical with pandoc on every section of the demo fixture *and* all 23
sections of the migrated real report (`pnpm tsx scripts/converter-parity.ts
<project-dir>` re-runs that comparison on any local project). Pandoc remains
available as the fallback via `--converter=pandoc` / `PAPERSTACK_CONVERTER=pandoc`
in `scripts/build-report.ts`, and the committed goldens still pin pandoc's
output so upgrades stay visible.

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
- ~~**Formatting inside image alt text**~~ fixed 2026-06-11: the real report
  uses code spans in figure captions, so this was not rare after all. The raw
  description is recovered from the source via the node's position and
  re-parsed as inlines — captions now render their markup exactly like pandoc.
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

## Cutover record (2026-06-11)

- **Real-report parity verified**: `scripts/converter-parity.ts` diffs both
  converters over any local project. The migrated real report diverged in
  exactly one place (code spans in figure captions — fixed, see above); all
  23 sections are now byte-identical, and the default converter is the
  emitter everywhere (builder, app, CLI).
- **Booktabs tables** landed in the *template*, not the emitter, so golden
  parity for tables is intact.
- **Math and citations** are the next M5 tasks and land *in* the emitter.
  `$x$` is currently plain text (gfm has no math) — adding it is a feature,
  not a parity break, since the pandoc path never supported it either.
- Non-GFM constructs pandoc supports but remark-gfm has no syntax for
  (definition lists, superscript, …) stay out of scope: authors cannot write
  them in Paperstack's GFM anyway.
