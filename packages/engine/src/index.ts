// NOTE: NodePlatform deliberately lives in the "./node" subpath export —
// the main entry must stay importable from the webview (no node:* imports).
export type { Platform } from "./platform/platform.ts";
export { PaperstackError, type ErrorCode } from "./errors.ts";
export {
  documentSchema,
  SECTION_ROLES,
  type DocumentMeta,
  type Author,
  type Section,
  type SectionRole,
} from "./project/schema.ts";
export { loadProject, type Project } from "./project/load-project.ts";
export { createProject, type CreateProjectOptions } from "./project/create-project.ts";
export {
  CHARS_PER_NORMALSIDE,
  countAnslag,
  countTodos,
  findTodoOffsets,
  countProject,
  applySectionContent,
  type SectionCount,
  type ProjectCounts,
} from "./project/counters.ts";
export {
  hashDiagram,
  extractMermaidBlocks,
  sweepStaleRenders,
  type MermaidBlock,
  type MermaidExtraction,
} from "./build/mermaid.ts";
export {
  PandocConverter,
  rewriteImagePaths,
  resolveProjectPath,
  type Converter,
} from "./build/converter.ts";
export {
  addSectionToYaml,
  removeSectionFromYaml,
  moveSectionInYaml,
  renameSectionInYaml,
} from "./project/section-edit.ts";
export { editMetadataInYaml, type MetadataEdit } from "./project/metadata-edit.ts";
export { buildReport, type BuildOptions, type BuildResult } from "./build/builder.ts";

export const ENGINE_VERSION = "0.0.1";
