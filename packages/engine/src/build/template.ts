/**
 * The SEA report Typst template. Written into output/.build/sea.typ at build
 * time (Typst can only include files under --root, so the template must live
 * inside the project during a build).
 *
 * Fonts fall back left to right: Cambria/Consolas match the look of the
 * original hand-built pipeline on Windows; Libertinus/DejaVu are Typst's
 * bundled fonts so builds also work on machines without them (e.g. CI).
 */
export const SEA_TEMPLATE = `// Paperstack SEA report template (written by Paperstack at build time)
#let report(
  title: "",
  subtitle: none,
  course: none,
  institution: none,
  authors: (),
  date: none,
  language: "en",
  length-line: none,
  body,
) = {
  set document(title: title)
  set text(lang: language, size: 11pt, font: ("Cambria", "Libertinus Serif", "New Computer Modern"))
  show raw: set text(font: ("Consolas", "DejaVu Sans Mono"), size: 9pt)
  set page(paper: "a4", margin: (x: 2.4cm, top: 2.6cm, bottom: 2.6cm))
  set par(justify: true)
  set heading(numbering: "1.1")
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(0.2em)
    it
    v(0.4em)
  }
  show figure.caption: set text(size: 9.5pt)
  show link: set text(fill: rgb("#1a4b8b"))
  show raw.where(block: true): it => block(
    width: 100%,
    fill: luma(248),
    stroke: 0.5pt + luma(210),
    inset: 8pt,
    radius: 3pt,
    it,
  )

  // ----- Cover page (unnumbered) -----
  v(3cm)
  align(center)[
    #text(size: 25pt, weight: "bold")[#title]
    #if subtitle != none {
      v(0.8em)
      text(size: 14pt, fill: luma(80))[#subtitle]
    }
    #v(2cm)
    #if course != none { text(size: 13pt)[#course] }
    #if institution != none {
      v(0.4em)
      text(size: 13pt)[#institution]
    }
    #v(2cm)
    #for a in authors [
      #a \\
    ]
    #v(1cm)
    #if date != none [#date]
    #if length-line != none {
      v(2.5cm)
      text(size: 9.5pt, fill: luma(100))[#length-line]
    }
  ]
  pagebreak()

  // ----- Table of contents (unnumbered) -----
  outline(depth: 3, indent: auto)

  // Page numbering starts at 1 on the first content page. The set rule
  // itself moves following content to a new page; the first section's weak
  // pagebreak collapses into it.
  set page(numbering: "1")
  counter(page).update(1)

  body
}
`;
