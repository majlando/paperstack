/**
 * The SEA report Typst template. Written into output/.build/sea.typ at build
 * time (Typst can only include files under --root, so the template must live
 * inside the project during a build).
 *
 * Fonts fall back left to right. Typst-bundled fonts are first so projects
 * render consistently across machines; Windows report-style fonts remain
 * fallback options for users who customize the template later.
 */
export const SEA_TEMPLATE = `// Paperstack SEA report template (written by Paperstack at build time)
#let report(
  title: "",
  subtitle: none,
  course: none,
  institution: none,
  logo: none,
  authors: (),
  date: none,
  language: "en",
  length-line: none,
  body,
) = {
  set document(title: title)
  set text(lang: language, size: 11pt, font: ("Libertinus Serif", "New Computer Modern", "Cambria"))
  show raw: set text(font: ("DejaVu Sans Mono", "Consolas"), size: 9pt)
  let margins = (x: 2.4cm, top: 2.6cm, bottom: 2.6cm)
  set page(paper: "a4", margin: margins)
  set par(justify: true)
  set heading(numbering: "1.1")
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(0.2em)
    it
    v(0.4em)
  }
  show figure.caption: set text(size: 9.5pt)
  // Large images float to the top/bottom of a page instead of leaving a gap
  // (the old hand-built report managed this with manual newpage hints).
  // Only figures taller than ~a third of the text area float: small figures
  // must stay exactly where they are written, and floating is a Typst error
  // inside containers (blockquotes, lists), which small figures can sit in.
  show figure: it => context {
    let text-w = page.width - 2 * margins.x
    let text-h = page.height - margins.top - margins.bottom
    if measure(block(width: text-w, it)).height > 0.35 * text-h {
      place(auto, float: true, block(width: 100%, it))
    } else {
      it
    }
  }
  // Navy headings + navy links: the deliberate default look (M4 decision),
  // matching the original report's heading color.
  show heading: set text(fill: rgb("#1f3864"))
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
  if logo != none {
    v(0.8cm)
    align(center, image(logo, height: 2.4cm))
    v(1.4cm)
  } else {
    v(3cm)
  }
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
