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
export { createProject, type CreateProjectOptions } from "./create-project.ts";
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
  sweepStaleRenders,
  type MermaidBlock,
  type MermaidExtraction,
} from "./mermaid.ts";
export {
  PandocConverter,
  rewriteImagePaths,
  resolveProjectPath,
  type Converter,
} from "./converter.ts";
export {
  addSectionToYaml,
  removeSectionFromYaml,
  moveSectionInYaml,
  renameSectionInYaml,
} from "./section-edit.ts";
export { buildReport, type BuildOptions, type BuildResult } from "./builder.ts";

export const ENGINE_VERSION = "0.0.1";
