/**
 * Unit spec for the remark→Typst emitter. Expected strings were taken from
 * real pandoc 3.6.3 output (`-f gfm+implicit_figures+attributes -t typst
 * --wrap=none`) unless a comment marks a deliberate divergence — see
 * ./remark-typst-parity.md.
 */
import { describe, expect, it } from "vitest";
import { PaperstackError } from "../errors.ts";
import { RemarkConverter, escapeTypstText, markdownToTypst } from "./remark-typst.ts";

/** Convert with the default fixture section dir and strip the final newline. */
const t = (md: string, sectionDir = "sections") =>
  markdownToTypst(md, sectionDir).replace(/\n$/, "");

describe("headings", () => {
  it("emits = markers with a GitHub-style label line", () => {
    expect(t("# Introduction")).toBe("= Introduction\n<introduction>");
    expect(t("### Three")).toBe("=== Three\n<three>");
    expect(t("###### Six")).toBe("====== Six\n<six>");
  });

  it("renders inline formatting in the heading but not in the label", () => {
    expect(t("## Two *emph*")).toBe("== Two #emph[emph]\n<two-emph>");
    expect(t("# with `code` and *emph*")).toBe("= with `code` and #emph[emph]\n<with-code-and-emph>");
  });

  it("keeps unicode letters and strips punctuation in labels", () => {
    expect(t("# Større Æbler")).toBe("= Større Æbler\n<større-æbler>");
    expect(t("# Heading? With: Punc/tuation (and) more!")).toBe(
      "= Heading? With: Punc/tuation (and) more!\n<heading-with-punctuation-and-more>",
    );
    expect(t("# 123 starts with digit")).toBe("= 123 starts with digit\n<123-starts-with-digit>");
  });

  it("deduplicates labels with -1, -2 suffixes", () => {
    expect(t("# Same\n\n# Same\n\n# Same")).toBe(
      "= Same\n<same>\n= Same\n<same-1>\n= Same\n<same-2>",
    );
  });

  it("omits the label when the slug is empty, like pandoc", () => {
    expect(t("# !!!")).toBe("= !!!");
    // ...but a second empty slug gets the bare -1 suffix (pandoc quirk).
    expect(t("# !!!\n\n# ???")).toBe("= !!!\n= ???\n<-1>");
  });

  it("treats setext headings like ATX", () => {
    expect(t("Setext H1\n=========")).toBe("= Setext H1\n<setext-h1>");
  });

  it("separates blocks with a blank line, except after a heading", () => {
    expect(t("Before.\n\n# Head\n\nAfter.")).toBe("Before.\n\n= Head\n<head>\nAfter.");
  });
});

describe("paragraphs and escaping", () => {
  it("escapes Typst-special characters", () => {
    expect(t("chars: # $ * @ < > [ ] _ \\ ~")).toBe(
      "chars: \\# \\$ \\* \\@ \\< \\> \\[ \\] \\_ \\\\ \\~",
    );
    expect(t('quotes " and \' here')).toBe("quotes \\\" and \\' here");
    expect(t("not special: % & + ( ) ^ { }")).toBe("not special: % & + ( ) ^ { }");
  });

  it("escapes backticks and underscores inside words", () => {
    expect(t("a_b_c is plain text")).toBe("a\\_b\\_c is plain text");
  });

  it("escapes // (a Typst comment) but not single slashes", () => {
    expect(t("a // b and a/b")).toBe("a \\/\\/ b and a/b");
  });

  it("escapes line-leading characters that would be Typst markup", () => {
    expect(t("\\= equals at start")).toBe("\\= equals at start");
    expect(t("/ slash colon: term-ish")).toBe("\\/ slash colon: term-ish");
  });

  it("rewrites typographic dashes and quotes to Typst markup", () => {
    expect(t("en – em — dash")).toBe("en -- em --- dash");
    expect(t("don’t")).toBe("don't");
  });

  it("collapses whitespace runs and soft breaks (--wrap=none)", () => {
    expect(t("a  b   c\nsoft wrapped")).toBe("a b c soft wrapped");
  });

  it("renders [TODO: ...] placeholders as escaped brackets", () => {
    expect(t("[TODO: expand conclusion]")).toBe("\\[TODO: expand conclusion\\]");
  });
});

describe("emphasis, strong, strikethrough", () => {
  it("maps to #emph, #strong, #strike", () => {
    expect(t("*emph* **strong** ~~strike~~ end")).toBe(
      "#emph[emph] #strong[strong] #strike[strike] end",
    );
  });

  it("nests and terminates a trailing inner call with ;", () => {
    expect(t("***both*** and **outer *inner* outer**")).toBe(
      "#emph[#strong[both];] and #strong[outer #emph[inner] outer]",
    );
  });

  it("terminates calls with ; before any non-space character", () => {
    expect(t("*a*. *b*, *c*: *d*; *e*! *f*? *g*x *h*1 *i*) *j*-")).toBe(
      "#emph[a];. #emph[b];, #emph[c];: #emph[d];; #emph[e];! #emph[f];? #emph[g];x #emph[h];1 #emph[i];) #emph[j];-",
    );
    expect(t("**m***n* *o*'s")).toBe("#strong[m];#emph[n] #emph[o];\\'s");
    expect(t("~~a~~b")).toBe("#strike[a];b");
  });

  it("terminates a trailing call inside any bracket body", () => {
    expect(t("[a *x*](https://u.com)")).toBe('#link("https://u.com")[a #emph[x];]');
    expect(t("~~a *x*~~ end")).toBe("#strike[a #emph[x];] end");
    expect(t("*a <https://u.com>*")).toBe('#emph[a #link("https://u.com");]');
  });

  it("never terminates images with ; — pandoc does not treat #box(image()) as a call", () => {
    expect(t("see ![i](x.png). and ![j](y.png)text")).toBe(
      'see #box(image("/sections/x.png")). and #box(image("/sections/y.png"))text',
    );
    expect(t("*see ![i](x.png)*")).toBe('#emph[see #box(image("/sections/x.png"))]');
  });
});

describe("inline code", () => {
  it("emits backtick raw markup", () => {
    expect(t("Use `simple` here")).toBe("Use `simple` here");
    expect(t("a `[TODO]` span")).toBe("a `[TODO]` span");
  });

  it("never adds ; after backtick raw (it is markup, not a call)", () => {
    expect(t("`code`. and `code`x")).toBe("`code`. and `code`x");
  });

  it("falls back to #raw() when the span contains a backtick", () => {
    expect(t("only backtick: `` ` ``")).toBe('only backtick: #raw("`")');
    expect(t("``a ` b`` end")).toBe('#raw("a ` b") end');
    expect(t("``a ` b``.")).toBe('#raw("a ` b");.');
  });
});

describe("links", () => {
  it("emits #link with a body", () => {
    expect(t("A [link](https://example.com) here")).toBe(
      'A #link("https://example.com")[link] here',
    );
    expect(t("[link **with** formatting](https://e.com/a_b).")).toBe(
      '#link("https://e.com/a_b")[link #strong[with] formatting];.',
    );
  });

  it("omits the body for autolinks whose text equals the URL", () => {
    expect(t("see <https://auto.example.com> now")).toBe(
      'see #link("https://auto.example.com") now',
    );
    // www autolinks gain an http:// prefix, so text differs from the URL.
    expect(t("Visit www.example.com today")).toBe(
      'Visit #link("http://www.example.com")[www.example.com] today',
    );
  });

  it("links internal anchors to Typst labels", () => {
    expect(t("[internal](#introduction) ref")).toBe("#link(<introduction>)[internal] ref");
  });

  it("resolves reference-style links via their definitions", () => {
    expect(t("[ref text][label]\n\n[label]: https://example.com")).toBe(
      '#link("https://example.com")[ref text]',
    );
  });
});

describe("lists", () => {
  it("renders tight bullet lists", () => {
    expect(t("- a\n- b\n- c")).toBe("- a\n- b\n- c");
  });

  it("renders ordered lists with + markers", () => {
    expect(t("1. first\n2. second")).toBe("+ first\n+ second");
  });

  it("indents nested lists by two spaces", () => {
    expect(t("1. first\n2. second\n   - nested\n   - more\n3. third")).toBe(
      "+ first\n+ second\n  - nested\n  - more\n+ third",
    );
    expect(t("- one\n  - two\n    - three\n- back")).toBe(
      "- one\n  - two\n    - three\n- back",
    );
  });

  it("wraps ordered lists not starting at 1 in a scoped enum block", () => {
    expect(t("5. five\n6. six")).toBe(
      '#block[\n#set enum(numbering: "1.", start: 5)\n+ five\n+ six\n]',
    );
  });

  it("renders loose lists with blank lines and indented blocks", () => {
    expect(t("- one\n\n- two")).toBe("- one\n\n- two");
    expect(t("- para\n\n  second para\n- code\n\n  ```\n  x\n  ```")).toBe(
      "- para\n\n  second para\n\n- code\n\n  ```\n  x\n  ```",
    );
  });

  it("renders GFM task lists with checkbox characters", () => {
    expect(t("- [ ] todo\n- [x] done")).toBe("- ☐ todo\n- ☒ done");
  });
});

describe("code blocks", () => {
  it("emits fenced raw blocks with the language", () => {
    expect(t("```python\nprint('hi')\n```")).toBe("```python\nprint('hi')\n```");
    expect(t("```\nno language\n```")).toBe("```\nno language\n```");
  });

  it("keeps content verbatim — no escaping, no image rewriting", () => {
    expect(t('```js\nconst x = image("../shot.png"); // # $ *\n```')).toBe(
      '```js\nconst x = image("../shot.png"); // # $ *\n```',
    );
  });

  it("lengthens the fence when the content contains backtick runs", () => {
    expect(t("````\ncode with ``` inside\n````")).toBe("````\ncode with ``` inside\n````");
  });

  it("converts tilde fences to backtick fences", () => {
    expect(t("~~~python\nprint('x')\n~~~")).toBe("```python\nprint('x')\n```");
  });

  it("handles stray mermaid blocks gracefully as plain code blocks", () => {
    // The builder extracts mermaid before converting; if one slips through it
    // must not crash — it renders as a code listing, exactly like pandoc.
    expect(t("```mermaid\nflowchart TD\n  A --> B\n```")).toBe(
      "```mermaid\nflowchart TD\n  A --> B\n```",
    );
  });
});

describe("images and figures", () => {
  it("turns an image alone in a paragraph into a captioned figure (implicit_figures)", () => {
    expect(t("![Demo system architecture](../figures/architecture.svg)")).toBe(
      '#figure(image("/figures/architecture.svg"),\n  caption: [\n    Demo system architecture\n  ]\n)',
    );
  });

  it("renders the caption's inline markup, like pandoc — code spans are everyday caption writing", () => {
    expect(t("![uses `Foo.bar` and *emph* here](img.png)")).toBe(
      '#figure(image("/sections/img.png"),\n  caption: [\n    uses `Foo.bar` and #emph[emph] here\n  ]\n)',
    );
    expect(t("![a \\] bracket and `tick`](img.png)")).toBe(
      '#figure(image("/sections/img.png"),\n  caption: [\n    a \\] bracket and `tick`\n  ]\n)',
    );
    // No `;` after a trailing hash call — the `]` follows on its own line.
    expect(t("![caption ending in *emph*](img.png)")).toBe(
      '#figure(image("/sections/img.png"),\n  caption: [\n    caption ending in #emph[emph]\n  ]\n)',
    );
    expect(t("![caption ending in [a link](https://x.dk)](img.png)")).toBe(
      '#figure(image("/sections/img.png"),\n  caption: [\n    caption ending in #link("https://x.dk")[a link]\n  ]\n)',
    );
  });

  it("renders an alt-less standalone image as a plain #box", () => {
    expect(t("![](/diagrams/rendered/2e06c61f.svg)")).toBe(
      '#box(image("/diagrams/rendered/2e06c61f.svg"))',
    );
  });

  it("renders inline images as #box", () => {
    expect(t("Inline ![alt](inline.png) in text")).toBe(
      'Inline #box(image("/sections/inline.png")) in text',
    );
  });

  it("applies {width=…} attributes with pandoc's number formatting", () => {
    expect(t("![Sized](shot.png){width=62%}")).toBe(
      '#figure(image("/sections/shot.png", width: 62.0%),\n  caption: [\n    Sized\n  ]\n)',
    );
    expect(t("![s](x.png){width=62.5%}")).toContain("width: 62.5%");
    expect(t("![s](x.png){width=3cm}")).toContain("width: 3cm");
    expect(t("![s](x.png){width=120px}")).toContain("width: 1.25in");
    expect(t("![s](x.png){height=4cm width=50%}")).toContain("height: 4cm, width: 50.0%");
    expect(t("![](x.png){width=10%}")).toBe('#box(image("/sections/x.png", width: 10.0%))');
  });

  it("emits a figure label for an {#id} attribute and ignores unknown attributes", () => {
    expect(t("![g](x.png){#fig-g width=10%}")).toBe(
      '#figure(image("/sections/x.png", width: 10.0%),\n  caption: [\n    g\n  ]\n)\n<fig-g>',
    );
    expect(t("![a](x.png){width=50% foo=bar .class}")).toContain('image("/sections/x.png", width: 50.0%)');
  });

  it("keeps an attributed image followed by text inline (no implicit figure)", () => {
    expect(t("![a](x.png){width=50%} trailing")).toBe(
      '#box(image("/sections/x.png", width: 50.0%)) trailing',
    );
  });

  it("renders a linked image as #link around #box, not a figure", () => {
    expect(t("[![alt](img.png)](https://example.com)")).toBe(
      '#link("https://example.com")[#box(image("/sections/img.png"))]',
    );
  });

  it("resolves image paths against the section directory", () => {
    expect(t("![a](shot.png)", "sections")).toContain('image("/sections/shot.png")');
    expect(t("![a](../figures/d.png)", "sections")).toContain('image("/figures/d.png")');
    expect(t("![a](img.png)", "")).toContain('image("/img.png")');
    expect(t("![a](my%20file.png)")).toContain('image("/sections/my file.png")');
  });

  it("rejects image paths escaping the project, with a readable error", () => {
    expect(() => t("![a](../../etc/passwd)")).toThrow(PaperstackError);
  });
});

describe("math", () => {
  it("translates inline LaTeX math to Typst math", () => {
    expect(t("the value $x^2$ grows")).toBe("the value $x^2$ grows");
    expect(t("$\\frac{n+1}{2}$ steps")).toBe("$(n + 1)/(2)$ steps");
    expect(t("$\\sum_{i=1}^{n} i^2$")).toBe("$sum_(i = 1)^n i^2$");
    expect(t("$\\mathcal{O}(n \\log n)$")).toBe("$cal(O) ( n log n )$");
    expect(t("$x \\in \\mathbb{R}^n$")).toBe("$x in bb(R)^n$");
    expect(t("$\\sqrt[3]{x} \\neq \\bar{y}$")).toBe("$root(3, x) != macron(y)$");
    expect(t("$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}$")).toBe(
      "$f' ( x ) = lim_(h -> 0) (f ( x + h ) - f ( x ))/(h)$",
    );
    expect(t("$\\text{cost} = 5 \\cdot n$")).toBe('$"cost" = 5 dot.op n$');
  });

  it("implicit multiplication: adjacent letters become separate Typst identifiers", () => {
    expect(t("$xy + 2ab$")).toBe("$x y + 2 a b$");
  });

  it("translates $$-fenced display math as a Typst block equation", () => {
    expect(t("$$\n\\frac{n+1}{2}\n$$")).toBe("$ (n + 1)/(2) $");
    expect(t("before\n\n$$\ne = mc^2\n$$\n\nafter")).toBe("before\n\n$ e = m c^2 $\n\nafter");
    // remark-math only treats $$ fences on their own lines as display math —
    // a single-line $$…$$ stays inline, in the preview and the PDF alike.
    expect(t("$$e = mc^2$$")).toBe("$e = m c^2$");
  });

  it("handles \\left…\\right and literal braces", () => {
    expect(t("$\\left( \\frac{a}{b} \\right)$")).toBe("$lr(( (a)/(b) ))$");
    expect(t("$\\{1, 2\\}$")).toBe("${ 1 , 2 }$");
  });

  it("a single dollar amount stays plain text; escaping always works", () => {
    expect(t("costs $5 today")).toBe("costs \\$5 today");
    expect(t("a \\$5 fee")).toBe("a \\$5 fee");
    // Two dollars in one paragraph DO become a math span (the standard
    // Markdown-math trade-off) — visible immediately in the KaTeX preview,
    // and \$ escapes it. Pinned so the behavior is deliberate, not a surprise.
    expect(t("costs $5 and $10 total")).toBe("costs $5 a n d$10 total");
  });

  it("rejects unsupported commands with a readable error naming them", () => {
    expect(() => t("$\\foobar{x}$")).toThrow(PaperstackError);
    expect(() => t("$\\foobar{x}$")).toThrow(/\\foobar/);
    expect(() => t("$\\begin{matrix}a\\end{matrix}$")).toThrow(/matrix/);
    expect(() => t("$a & b$")).toThrow(/not supported/);
  });
});

describe("tables", () => {
  it("matches pandoc's #figure/#table layout exactly", () => {
    expect(t("| Case | Expected |\n| ---- | -------- |\n| Found | `1` |\n| Empty | `-1` |")).toBe(
      [
        "#figure(",
        "  align(center)[#table(",
        "    columns: 2,",
        "    align: (auto,auto,),",
        "    table.header([Case], [Expected],),",
        "    table.hline(),",
        "    [Found], [`1`],",
        "    [Empty], [`-1`],",
        "  )]",
        "  , kind: table",
        "  )",
      ].join("\n"),
    );
  });

  it("maps column alignments", () => {
    expect(t("| L | C | R |\n|:--|:-:|--:|\n| a | b | c |")).toContain(
      "    align: (left,center,right,),",
    );
  });

  it("renders empty cells, escaped pipes, and inline formatting in cells", () => {
    const out = t("| A | B |\n|---|---|\n|   | a \\| b |\n| *e* `c` | with # hash |");
    expect(out).toContain("    [], [a | b],");
    expect(out).toContain("    [#emph[e] `c`], [with \\# hash],");
  });

  it("terminates a trailing call in a cell, but not a trailing image", () => {
    expect(t("| H |\n|---|\n| *e* |")).toContain("    [#emph[e];],");
    expect(t("| H |\n|---|\n| ![i](x.png) |")).toContain(
      '    [#box(image("/sections/x.png"))],',
    );
  });

  it("renders a header-only table", () => {
    const out = t("| Only | Header |\n|------|--------|");
    expect(out).toContain("    table.header([Only], [Header],),\n    table.hline(),\n  )]");
  });
});

describe("blockquotes", () => {
  it("emits #quote blocks with blank-line-separated content", () => {
    expect(t("> Quoted with *emphasis*.\n>\n> Second paragraph.")).toBe(
      "#quote(block: true)[\nQuoted with #emph[emphasis];.\n\nSecond paragraph.\n]",
    );
  });

  it("nests quotes and other blocks", () => {
    expect(t("> outer\n>\n> > inner")).toBe(
      "#quote(block: true)[\nouter\n\n#quote(block: true)[\ninner\n]\n]",
    );
    expect(t("> - one\n> - two")).toBe("#quote(block: true)[\n- one\n- two\n]");
  });
});

describe("breaks and rules", () => {
  it("renders hard breaks as a trailing backslash", () => {
    expect(t("Line one\\\nline two")).toBe("Line one \\\nline two");
    expect(t("Line three  \nline four")).toBe("Line three \\\nline four");
    expect(t("*emph with\\\nbreak inside*")).toBe("#emph[emph with \\\nbreak inside]");
  });

  it("renders thematic breaks as an inline #line (divergence: pandoc emits #horizontalrule, which is undefined outside its own standalone template)", () => {
    expect(t("above\n\n---\n\nbelow")).toBe(
      "above\n\n#line(start: (25%, 0%), end: (75%, 0%))\n\nbelow",
    );
  });
});

describe("raw HTML", () => {
  it("drops HTML comments without leaving double spaces", () => {
    expect(t("Before.\n\n<!-- a block comment -->\n\nAfter.")).toBe("Before.\n\nAfter.");
    expect(t("After with <!-- inline comment --> inside.")).toBe("After with inside.");
  });

  it("drops tags but keeps the text between them", () => {
    expect(t("Inline <b>bold</b> html.")).toBe("Inline bold html.");
    expect(t("<div>raw block</div>")).toBe("");
  });

  it("produces an empty document for a comment-only section", () => {
    expect(markdownToTypst("<!-- just a comment -->", "sections")).toBe("\n");
  });

  it("decodes HTML entities", () => {
    expect(t("AT&amp;T and &lt;tag&gt;")).toBe("AT&T and \\<tag\\>");
  });
});

describe("footnotes", () => {
  it("inlines footnote definitions as #footnote", () => {
    expect(t("Text with[^1] footnote.\n\n[^1]: The note.")).toBe(
      "Text with#footnote[The note.] footnote.",
    );
  });

  it("joins multi-paragraph footnotes with blank lines", () => {
    expect(t("Text[^a]\n\n[^a]: First para.\n\n    Second para.")).toBe(
      "Text#footnote[First para.\n\nSecond para.]",
    );
  });

  it("terminates the call with ; before punctuation", () => {
    expect(t("note[^1]. after\n\n[^1]: N.")).toBe("note#footnote[N.];. after");
  });
});

describe("RemarkConverter", () => {
  it("implements the Converter interface", async () => {
    const converter = new RemarkConverter();
    await expect(converter.toTypst("# Hi", "sections")).resolves.toBe("= Hi\n<hi>\n");
  });

  it("surfaces path errors as PaperstackError with a human-readable message", async () => {
    const converter = new RemarkConverter();
    const error = await converter.toTypst("![a](../../x.png)", "sections").catch((e) => e);
    expect(error).toBeInstanceOf(PaperstackError);
    expect((error as PaperstackError).userMessage).not.toMatch(/exit code|pandoc|stack/i);
  });
});

describe("escapeTypstText", () => {
  it("maps the no-break space to Typst's ~", () => {
    expect(escapeTypstText("word nbsp")).toBe("word~nbsp");
  });
});
