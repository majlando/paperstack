/**
 * Vanilla-TS live preview — no React imports (see docs/STACK.md, "React,
 * used thin"). Renders Markdown to HTML with remark/rehype, resolves image
 * paths through the host-provided callback, and replaces ```mermaid blocks
 * with live-rendered SVGs.
 */
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { extractMermaidBlocks, hashDiagram } from "@paperstack/engine";
import { renderMermaidSvg } from "./mermaid.ts";

export interface MarkdownPreviewOptions {
  /**
   * Map an image src as written in the Markdown (relative to the section
   * file, or project-root-absolute starting with "/") to a displayable URL.
   */
  resolveImageUrl: (src: string, sectionDir: string) => string;
}

export class MarkdownPreview {
  private readonly processor: Processor;
  private seq = 0;
  /**
   * Render calls are async (mermaid awaits) and unserialized: a render that
   * loses the race must stop touching the DOM the moment it discovers a
   * newer one started — otherwise a slow diagram from section A applies A's
   * scroll position (or its error box) onto section B's fresh preview.
   */
  private renderGeneration = 0;
  private readonly objectUrls = new Set<string>();
  /** Rendered SVG per diagram content hash — typing pauses re-render the
   * HTML every time, but unchanged diagrams should not re-run mermaid. */
  private readonly svgCache = new Map<string, string>();

  /** Fullscreen overlay for a clicked figure/diagram, or null when closed. */
  private lightbox: HTMLElement | null = null;
  private onLightboxKey: ((e: KeyboardEvent) => void) | null = null;

  // The preview is a viewer, not a browser — swallow link navigation, and
  // open a figure/diagram in a fullscreen lightbox when clicked (large
  // diagrams are hard to read inline).
  private readonly onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest("a")) {
      e.preventDefault();
      return;
    }
    const img = target.closest("img.ps-zoomable") as HTMLImageElement | null;
    if (img) this.openLightbox(img.src, img.alt);
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly options: MarkdownPreviewOptions,
  ) {
    container.addEventListener("click", this.onClick);
    this.processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype)
      .use(rehypeHighlight)
      .use(rehypeStringify) as unknown as Processor;
  }

  async render(
    markdown: string,
    sectionDir: string,
    options?: { resetScroll?: boolean; citations?: boolean },
  ): Promise<void> {
    // Keep scroll position while typing; jump to top on section switch.
    const scrollTop = options?.resetScroll ? 0 : this.container.scrollTop;
    const generation = ++this.renderGeneration;
    this.revokeObjectUrls();

    let html: string;
    try {
      html = String(await this.processor.process(markdown));
    } catch (e) {
      if (generation !== this.renderGeneration) return;
      this.container.innerHTML = "";
      this.container.appendChild(this.errorBox(`Preview error: ${(e as Error).message}`));
      return;
    }
    if (generation !== this.renderGeneration) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    sanitizePreviewFragment(template.content);
    this.container.replaceChildren(template.content.cloneNode(true));

    for (const img of Array.from(this.container.querySelectorAll("img"))) {
      const src = img.getAttribute("src") ?? "";
      if (!/^(https?:|data:|blob:)/.test(src)) {
        try {
          img.src = this.options.resolveImageUrl(src, sectionDir);
        } catch (e) {
          img.replaceWith(this.errorBox((e as Error).message));
          continue;
        }
      }
      // `![cap](src){width=60% align=left}` — apply the same width/alignment
      // the PDF uses and drop the now-consumed attribute text so it never shows
      // as literal prose.
      const attrs = applyImageAttrs(img);
      img.classList.add("ps-zoomable", "cursor-zoom-in");
      // An image alone in its paragraph is a figure: show its alt as the
      // caption below, like the PDF (implicit_figures).
      wrapStandaloneFigure(img, attrs.align);
    }

    // Citations become readable [key] placeholders — the numbered form only
    // exists in the compiled report, the same one-rendering-path rule as
    // everything else. Only active for projects with a references.bib, so
    // the preview never suggests a citation the PDF would print literally.
    if (options?.citations) renderCitationPlaceholders(this.container);

    // Math is rendered after sanitization, like Mermaid below: KaTeX builds
    // its DOM from the math source text directly, so nothing it produces
    // ever passes through innerHTML.
    for (const code of Array.from(
      this.container.querySelectorAll("code.math-inline, code.math-display"),
    )) {
      const display = code.classList.contains("math-display");
      const host = document.createElement(display ? "div" : "span");
      if (display) host.className = "my-4 text-center";
      katex.render(code.textContent ?? "", host, {
        displayMode: display,
        // Invalid math renders highlighted in place instead of failing the
        // whole preview — the PDF export reports it as a readable error.
        throwOnError: false,
        errorColor: "#f87171",
      });
      (display ? (code.closest("pre") ?? code) : code).replaceWith(host);
    }

    // Captions live in the fence info string, which the HTML drops — recover
    // them from the source, keyed by the same diagram hash the loop computes.
    const captions = new Map<string, string>();
    for (const block of extractMermaidBlocks(markdown).blocks) {
      if (block.caption) captions.set(block.hash, block.caption);
    }

    const mermaidBlocks = Array.from(
      this.container.querySelectorAll("pre code.language-mermaid"),
    );
    for (const code of mermaidBlocks) {
      const pre = code.closest("pre");
      if (!pre) continue;
      const source = code.textContent ?? "";
      const hash = hashDiagram(source.replace(/\r\n?/g, "\n").trim());
      try {
        let svg = this.svgCache.get(hash);
        if (svg === undefined) {
          svg = await renderMermaidSvg(`preview-${this.seq++}`, source);
          if (this.svgCache.size > 100) this.svgCache.clear();
          this.svgCache.set(hash, svg);
        }
        if (generation !== this.renderGeneration) return;
        const wrapper = document.createElement("div");
        wrapper.className = "my-4 flex flex-col items-center";
        const img = document.createElement("img");
        img.alt = captions.get(hash) ?? "Mermaid diagram";
        img.className = "ps-zoomable max-w-full cursor-zoom-in";
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        this.objectUrls.add(url);
        img.src = url;
        wrapper.appendChild(img);
        const caption = captions.get(hash);
        if (caption) {
          const cap = document.createElement("div");
          cap.className = "mt-1 text-center text-sm italic text-zinc-400";
          cap.textContent = caption;
          wrapper.appendChild(cap);
        }
        pre.replaceWith(wrapper);
      } catch (e) {
        if (generation !== this.renderGeneration) return;
        pre.replaceWith(this.errorBox(`Diagram error: ${(e as Error).message}`));
      }
    }

    this.container.scrollTop = scrollTop;
  }

  private errorBox(message: string): HTMLElement {
    const div = document.createElement("div");
    div.className =
      "my-4 rounded border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300";
    div.textContent = message;
    return div;
  }

  private openLightbox(src: string, alt: string): void {
    this.closeLightbox();
    const overlay = document.createElement("div");
    overlay.className =
      "fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-8 cursor-zoom-out";
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.className = "max-h-full max-w-full";
    overlay.appendChild(img);
    overlay.addEventListener("click", () => this.closeLightbox());
    this.onLightboxKey = (e) => {
      if (e.key === "Escape") this.closeLightbox();
    };
    window.addEventListener("keydown", this.onLightboxKey);
    document.body.appendChild(overlay);
    this.lightbox = overlay;
  }

  private closeLightbox(): void {
    this.lightbox?.remove();
    this.lightbox = null;
    if (this.onLightboxKey) {
      window.removeEventListener("keydown", this.onLightboxKey);
      this.onLightboxKey = null;
    }
  }

  destroy(): void {
    this.renderGeneration++; // any in-flight render stops touching the DOM
    this.closeLightbox();
    this.container.removeEventListener("click", this.onClick);
    this.revokeObjectUrls();
    this.container.replaceChildren();
  }

  private revokeObjectUrls(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
}

/**
 * Citation spans in prose → styled chips, mirroring the PDF forms:
 * bracketed `[@key]` / `[@a; @b, p. 12]` as parenthetical `[key]` chips, and
 * bare `@key` as a narrative `key` chip. Matches the converter's CITE_SCAN.
 */
function renderCitationPlaceholders(root: HTMLElement): void {
  const ITEM = /^@([A-Za-z0-9_][A-Za-z0-9_.:-]*)(?:\s*,\s*(.+))?$/;
  const SCAN =
    /(\[@[^\]]*\])|(?<![\w@])@([A-Za-z0-9_](?:[A-Za-z0-9_.:-]*[A-Za-z0-9_])?)(?:[ \t]+\[(?!@)([^\]]+)\])?/g;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const text of texts) {
    // citations live in prose — never rewrite code samples
    if (text.parentElement?.closest("pre, code")) continue;
    const value = text.nodeValue ?? "";
    let fragment: DocumentFragment | null = null;
    let last = 0;
    for (const m of value.matchAll(SCAN)) {
      let label: string;
      if (m[1] !== undefined) {
        const items = m[1].slice(1, -1).split(";").map((s) => ITEM.exec(s.trim()));
        if (items.some((i) => i === null)) continue; // not citation syntax
        label = `[${items
          .map((i) => (i![2] === undefined ? i![1]! : `${i![1]}, ${i![2]}`))
          .join("; ")}]`;
      } else {
        // bare @key (with optional [locator]) → narrative "key" chip
        label = m[3] === undefined ? m[2]! : `${m[2]}, ${m[3]}`;
      }
      fragment ??= document.createDocumentFragment();
      if (m.index > last) fragment.append(value.slice(last, m.index));
      const chip = document.createElement("span");
      chip.className = "rounded bg-sky-500/15 px-1 text-[0.85em] text-sky-300";
      chip.title = "Citation — appears as an (author, year) reference in the report";
      chip.textContent = label;
      fragment.append(chip);
      last = m.index + m[0].length;
    }
    if (fragment === null) continue;
    if (last < value.length) fragment.append(value.slice(last));
    text.replaceWith(fragment);
  }
}

/**
 * Apply a Markdown image's `{width=… height=… align=…}` attribute (the
 * converter's syntax) as inline CSS in the preview, strip the consumed `{…}`
 * text so it never renders as literal prose, and return the parsed alignment
 * (the caller positions the figure). Only length/percentage values pass.
 */
function applyImageAttrs(img: HTMLImageElement): { align?: "left" | "center" | "right" } {
  const result: { align?: "left" | "center" | "right" } = {};
  const next = img.nextSibling;
  if (!next || next.nodeType !== Node.TEXT_NODE) return result;
  const text = next.textContent ?? "";
  const m = /^\{([^}]*)\}/.exec(text);
  if (!m) return result;
  for (const token of m[1]!.trim().split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1).replace(/^"(.*)"$/, "$1");
    if (key === "align" && (value === "left" || value === "center" || value === "right")) {
      result.align = value;
      continue;
    }
    const css = /^[0-9]+(?:\.[0-9]+)?$/.test(value)
      ? `${value}px`
      : /^[0-9]+(?:\.[0-9]+)?(%|px|cm|mm|in|pt|em|rem)$/.test(value)
        ? value
        : null;
    if (css === null) continue;
    if (key === "width") img.style.width = css;
    else if (key === "height") img.style.height = css;
  }
  next.textContent = text.slice(m[0].length);
  return result;
}

/**
 * An image alone in its paragraph is a figure (the converter's
 * implicit_figures rule): wrap it with its alt text shown as a centered
 * caption, positioned per the `align` attribute. Inline images are left as-is.
 */
function wrapStandaloneFigure(
  img: HTMLImageElement,
  align: "left" | "center" | "right" | undefined,
): void {
  const alt = img.alt.trim();
  const parent = img.parentElement;
  if (alt === "" || !parent || parent.tagName !== "P") return;
  const alone = Array.from(parent.childNodes).every(
    (n) => n === img || (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() === ""),
  );
  if (!alone) return;
  const items = align === "left" ? "items-start" : align === "right" ? "items-end" : "items-center";
  const wrapper = document.createElement("div");
  wrapper.className = `my-4 flex flex-col ${items}`;
  const caption = document.createElement("div");
  caption.className = "mt-1 w-full text-center text-sm italic text-zinc-400";
  caption.textContent = alt;
  parent.replaceWith(wrapper);
  wrapper.append(img, caption);
}

const ALLOWED_TAGS = new Map<string, ReadonlySet<string>>([
  ["a", new Set(["href", "title"])],
  ["blockquote", new Set()],
  ["br", new Set()],
  ["code", new Set(["class"])],
  ["del", new Set()],
  ["em", new Set()],
  ["h1", new Set(["id"])],
  ["h2", new Set(["id"])],
  ["h3", new Set(["id"])],
  ["h4", new Set(["id"])],
  ["h5", new Set(["id"])],
  ["h6", new Set(["id"])],
  ["hr", new Set()],
  ["img", new Set(["src", "alt", "title"])],
  ["li", new Set()],
  ["ol", new Set()],
  ["p", new Set()],
  ["pre", new Set()],
  ["span", new Set(["class"])],
  ["strong", new Set()],
  ["table", new Set()],
  ["tbody", new Set()],
  ["td", new Set(["align"])],
  ["th", new Set(["align"])],
  ["thead", new Set()],
  ["tr", new Set()],
  ["ul", new Set()],
]);

function sanitizePreviewFragment(fragment: DocumentFragment): void {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    elements.push(node as Element);
  }
  for (const el of elements.reverse()) {
    const tag = el.tagName.toLowerCase();
    const allowedAttrs = ALLOWED_TAGS.get(tag);
    if (!allowedAttrs) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowedAttrs.has(name) || name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src") && !isSafeUrl(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed === "" ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:")
  );
}
