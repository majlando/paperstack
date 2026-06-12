import mermaid from "mermaid";

let initialized = false;

function init(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    // Labels must be SVG <text>, never <foreignObject>-wrapped HTML (the
    // mermaid default): the exported PDF runs this SVG through Typst's
    // renderer, which skips foreignObject entirely (typst/typst#1421) —
    // node boxes without words. Root-level htmlLabels covers every diagram
    // type; the per-diagram flags are deprecated aliases.
    htmlLabels: false,
    // Concrete families, not ui-sans-serif/system-ui: Typst resolves SVG
    // font names itself and falls back to its serif default when nothing
    // matches. Arial (Windows) / Helvetica (macOS) / DejaVu Sans (Linux CI)
    // keeps the PDF in the same sans the preview measured the labels with.
    fontFamily: "Arial, Helvetica, DejaVu Sans, sans-serif",
    // On a parse error mermaid would append an error diagram to <body>;
    // callers show their own inline error box instead.
    suppressErrorRendering: true,
  });
  initialized = true;
}

/**
 * Render Mermaid source to an SVG string. Used by the live preview and by
 * the save hook that writes `diagrams/rendered/<hash>.svg` for PDF export.
 * Throws on invalid diagram source.
 */
export async function renderMermaidSvg(id: string, code: string): Promise<string> {
  init();
  const { svg } = await mermaid.render(id, code);
  return withExplicitSize(svg);
}

/**
 * Mermaid emits its root <svg> with width="100%", keeping the natural size
 * only as a max-width inline style. Both consumers of this SVG treat it as a
 * standalone image — the preview's <img> and Typst's image() — and an <img>
 * whose SVG has no intrinsic width stretches to fill its container, blowing
 * a small diagram up to the full pane. Rewrite to explicit pixel dimensions
 * from the viewBox so the diagram keeps its natural size; Typst already
 * resolves the size from the viewBox, so the PDF is unchanged.
 */
function withExplicitSize(svg: string): string {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const [, , width, height] = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (root.localName !== "svg" || !(width! > 0) || !(height! > 0)) return svg;
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(root);
}
