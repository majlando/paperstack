// NOTE: NodePlatform deliberately lives in the "./node" subpath export —
// the main entry must stay importable from the webview (no node:* imports).
export type { Platform } from "./platform.ts";
export { PaperstackError, type ErrorCode } from "./errors.ts";
export {
  documentSchema,
  SECTION_ROLES,
  type DocumentMeta,
  type Author,
  type Section,
  type SectionRole,
} from "./schema.ts";
export { loadProject, type Project } from "./project.ts";
export {
  CHARS_PER_NORMALSIDE,
  countAnslag,
  countTodos,
  countProject,
  applySectionContent,
  type SectionCount,
  type ProjectCounts,
} from "./counters.ts";
export {
  hashDiagram,
  extractMermaidBlocks,
  type MermaidBlock,
  type MermaidExtraction,
} from "./mermaid.ts";
export {
  PandocConverter,
  rewriteImagePaths,
  type Converter,
} from "./converter.ts";
export { buildReport, type BuildOptions, type BuildResult } from "./builder.ts";

export const ENGINE_VERSION = "0.0.1";
