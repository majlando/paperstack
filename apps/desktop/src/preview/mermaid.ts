import mermaid from "mermaid";

let initialized = false;

function init(): void {
  if (initialized) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
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
  return svg;
}
