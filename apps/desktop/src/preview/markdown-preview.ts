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

  constructor(
    private readonly container: HTMLElement,
    private readonly options: MarkdownPreviewOptions,
  ) {
    // The preview is a viewer, not a browser — swallow link navigation.
    container.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) e.preventDefault();
    });
    this.processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeHighlight)
      .use(rehypeStringify) as unknown as Processor;
  }

  async render(markdown: string, sectionDir: string): Promise<void> {
    const scrollTop = this.container.scrollTop;

    let html: string;
    try {
      html = String(await this.processor.process(markdown));
    } catch (e) {
      this.container.innerHTML = "";
      this.container.appendChild(this.errorBox(`Preview error: ${(e as Error).message}`));
      return;
    }
    this.container.innerHTML = html;

    for (const img of Array.from(this.container.querySelectorAll("img"))) {
      const src = img.getAttribute("src") ?? "";
      if (!/^(https?:|data:|blob:)/.test(src)) {
        img.src = this.options.resolveImageUrl(src, sectionDir);
      }
    }

    const mermaidBlocks = Array.from(
      this.container.querySelectorAll("pre code.language-mermaid"),
    );
    for (const code of mermaidBlocks) {
      const pre = code.closest("pre");
      if (!pre) continue;
      try {
        const svg = await renderMermaidSvg(`preview-${this.seq++}`, code.textContent ?? "");
        const wrapper = document.createElement("div");
        wrapper.className = "my-4 flex justify-center [&_svg]:max-w-full";
        wrapper.innerHTML = svg;
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
    this.container.innerHTML = "";
  }
}
