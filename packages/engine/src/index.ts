// NOTE: NodePlatform deliberately lives in the "./node" subpath export —
// the main entry must stay importable from the webview (no node:* imports).
export type { Platform } from "./platform/platform.ts";
// Test helper (in-memory, zero deps) — exported so app-level tests can drive
// the store/engine against a controllable Platform without touching disk.
export { FakePlatform } from "./platform/fake-platform.ts";
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
  hashContent,
  imageSources,
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
  type Converter,
} from "./build/converter.ts";
export {
  addSectionToYaml,
  removeSectionFromYaml,
  moveSectionInYaml,
  renameSectionInYaml,
} from "./project/section-edit.ts";
export { editMetadataInYaml, type MetadataEdit } from "./project/metadata-edit.ts";
export {
  normalizeSlashes,
  dirOf,
  baseOf,
  stemOf,
  extOf,
  slugify,
  humanize,
  resolveProjectPath,
} from "./project/paths.ts";
export { searchContent, replaceContent, type SearchMatch } from "./project/search.ts";
export { tableMarkdown, formatTableAt, type TableEdit } from "./project/format-table.ts";
export { newSectionFile } from "./project/new-section-file.ts";
export {
  importFigure,
  importFigureBytes,
  suggestedCaption,
  figureMarkdown,
} from "./project/import-figure.ts";
export { buildReport, type BuildOptions, type BuildResult } from "./build/builder.ts";
export {
  RemarkConverter,
  markdownToTypst,
  type RemarkConverterOptions,
} from "./build/remark-typst.ts";
export { parseBibliography, bibliographyKeys, type BibEntry } from "./build/bibliography.ts";
export { SEA_TEMPLATE, templateStatus, type TemplateStatus } from "./build/template.ts";
