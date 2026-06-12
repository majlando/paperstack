# remark→Typst emitter — parity status

Status as of 2026-06-12, measured against pandoc 3.6.3
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
and `px`→`in` conversion) — for inline *and* reference-style images
(`![caption][ref]` resolves its definition into the same figure, fixed
2026-06-12; the caption used to vanish), GFM tables in pandoc's exact
`#figure`/`#table` layout, blockquotes, hard breaks, dropped raw
HTML/comments (collapsing the double space a dropped inline comment leaves,
as pandoc does), GFM footnotes, and image-path resolution identical to
`rewriteImagePaths`.

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
- **Line-start escaping is a superset of pandoc's** (extended 2026-06-12):
  pandoc escapes leading `=` and `/` at the start of a paragraph only. The
  emitter escapes `=` `/` `-` `+` and `N.` at *every* line start it creates —
  the paragraph's first character, after hard breaks, and at figure-caption
  starts. On the pandoc path a hard break followed by `= 400 kr` becomes a
  Typst heading mid-paragraph (a compile error inside captions/quotes);
  strictly safer, and unreachable in the goldens.

## Pandoc warts mirrored on purpose (parity over polish, revisit post-cutover)

- `#box(image(…))` is never `;`-terminated — not even before `.`, where the
  `.` could parse as a Typst field access. Pandoc behaves identically.
- Remote image URLs are mangled by project-path resolution on both paths
  (Typst cannot load remote images anyway).
- ~~A paragraph starting `1925. was…` renders as a Typst enum item, same as
  pandoc~~ — no longer mirrored since the 2026-06-12 line-start escaping
  (see divergences above): the emitter now writes `1925\.`.

## Cutover record (2026-06-11)

- **Real-report parity verified**: `scripts/converter-parity.ts` diffs both
  converters over any local project. The migrated real report diverged in
  exactly one place (code spans in figure captions — fixed, see above); all
  23 sections are now byte-identical, and the default converter is the
  emitter everywhere (builder, app, CLI).
- **Booktabs tables** landed in the *template*, not the emitter, so golden
  parity for tables is intact.
- **Math landed in the emitter (2026-06-11)**: `$x$` / `$$…$$` translate
  LaTeX to Typst math via `typst-math.ts` — a feature the pandoc path never
  had (its gfm reader runs without `tex_math_dollars`), so it is not a
  parity break; the real report contains no `$…$` spans (re-verified). Note
  the standard Markdown-math trade-off: two `$` in one paragraph form a math
  span — visible immediately in the KaTeX preview, escapable as `\$`.
  Tokenization follows TeX (2026-06-12): scripts and macro arguments take
  one digit unless braced ($2^10$ is 2¹0, like the preview shows), and bare
  `#`/`%` fail readably naming `\#`/`\%` — the preview and the PDF must
  never silently disagree.
- **Citations landed in the emitter (2026-06-11)**: `[@key]` spans become
  `#cite` calls *only* when the project has a references.bib (the builder
  passes its keys in), so projects without one keep exact pandoc parity.
  With a bibliography, unknown keys fail the build by design. Emitter-only,
  like math: the pandoc fallback prints `[@key]` literally.
- Non-GFM constructs pandoc supports but remark-gfm has no syntax for
  (definition lists, superscript, …) stay out of scope: authors cannot write
  them in Paperstack's GFM anyway.
