/**
 * Vanilla-TS live preview — no React imports (see docs/STACK.md, "React,
 * used thin"). Renders Markdown to HTML with remark/rehype, resolves image
 * paths through the host-provided callback, and replaces ```mermaid blocks
 * with live-rendered SVGs.
 */
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { hashDiagram } from "@paperstack/engine";
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
  private readonly objectUrls = new Set<string>();
  /** Rendered SVG per diagram content hash — typing pauses re-render the
   * HTML every time, but unchanged diagrams should not re-run mermaid. */
  private readonly svgCache = new Map<string, string>();

  // The preview is a viewer, not a browser — swallow link navigation.
  private readonly onClick = (e: Event) => {
    if ((e.target as HTMLElement).closest("a")) e.preventDefault();
  };

  constructor(
    private readonly container: HTMLElement,
    private readonly options: MarkdownPreviewOptions,
  ) {
    container.addEventListener("click", this.onClick);
    this.processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeHighlight)
      .use(rehypeStringify) as unknown as Processor;
  }

  async render(
    markdown: string,
    sectionDir: string,
    options?: { resetScroll?: boolean },
  ): Promise<void> {
    // Keep scroll position while typing; jump to top on section switch.
    const scrollTop = options?.resetScroll ? 0 : this.container.scrollTop;
    this.revokeObjectUrls();

    let html: string;
    try {
      html = String(await this.processor.process(markdown));
    } catch (e) {
      this.container.innerHTML = "";
      this.container.appendChild(this.errorBox(`Preview error: ${(e as Error).message}`));
      return;
    }
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
        }
      }
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
        const wrapper = document.createElement("div");
        wrapper.className = "my-4 flex justify-center";
        const img = document.createElement("img");
        img.alt = "Mermaid diagram";
        img.className = "max-w-full";
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        this.objectUrls.add(url);
        img.src = url;
        wrapper.appendChild(img);
        pre.replaceWith(wrapper);
      } catch (e) {
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

  destroy(): void {
    this.container.removeEventListener("click", this.onClick);
    this.revokeObjectUrls();
    this.container.replaceChildren();
  }

  private revokeObjectUrls(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }
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
