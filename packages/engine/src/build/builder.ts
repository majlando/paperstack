import type { Platform } from "../platform/platform.ts";
import { PaperstackError } from "../errors.ts";
import { loadProject } from "../project/load-project.ts";
import { countProject, type ProjectCounts } from "../project/counters.ts";
import { extractMermaidBlocks, sweepStaleRenders } from "./mermaid.ts";
import { bibliographyKeys } from "./bibliography.ts";
import type { Converter } from "./converter.ts";
import { RemarkConverter } from "./remark-typst.ts";
import { SEA_TEMPLATE } from "./template.ts";
import {
  buildLengthLine,
  generateMainTypst,
  type ConvertedSection,
} from "./assembler.ts";

export interface BuildOptions {
  /** Binary identifier for Platform.runBinary: a path in Node, a sidecar name in the app. */
  typst: string;
  /** Skip the binary startup probe — for callers that already built successfully this session. */
  skipPreflight?: boolean;
  /** Override the converter (tests, the pandoc fallback in scripts/build-report.ts). */
  converter?: Converter;
}

export interface BuildResult {
  pdfPath: string;
  counts: ProjectCounts;
  warnings: string[];
}

export async function buildReport(
  platform: Platform,
  projectDir: string,
  options: BuildOptions,
): Promise<BuildResult> {
  // Preflight by actually running the binary: an existence check can't work
  // uniformly (sidecars are names, not paths) and a binary that exists but
  // can't start would fail later with a worse message anyway. Only typst is
  // probed — conversion is an in-process function since the M5 cutover.
  if (!options.skipPreflight) {
    const probe = await platform
      .runBinary(options.typst, ["--version"])
      .catch((e) => ({ exitCode: -1, stdout: "", stderr: String(e) }));
    if (probe.exitCode !== 0) {
      throw new PaperstackError(
        "dependency-missing",
        "The PDF engine (typst) could not be started. Reinstall Paperstack — or, in development, run pnpm fetch-binaries.",
        `probe failed for ${options.typst}: ${probe.stderr}`,
      );
    }
  }

  const project = await loadProject(platform, projectDir);
  const counts = await countProject(platform, project);
  const warnings: string[] = [];

  if (counts.todosTotal > 0) {
    warnings.push(
      `The report still contains ${counts.todosTotal} [TODO] placeholder${counts.todosTotal === 1 ? "" : "s"}.`,
    );
  }
  if (counts.overCap) {
    warnings.push(
      `The body is over the length cap: ${counts.bodyNormalsider.toFixed(2)} of ${counts.cap} normalsider.`,
    );
  }
  // Appendices share the body's heading counter, so body sections placed
  // after an appendix get wrong (often duplicate) numbers. Only a hand-edited
  // document.yaml can produce this order — warn rather than block.
  const firstAppendix = project.meta.sections.findIndex((s) => s.role === "appendix");
  if (
    firstAppendix !== -1 &&
    project.meta.sections.slice(firstAppendix + 1).some((s) => s.role === "body")
  ) {
    warnings.push(
      "Some body sections come after an appendix, so their heading numbers may be wrong. Move appendices to the end of the report.",
    );
  }

  const buildDir = `${projectDir}/output/.build`;
  await platform.mkdir(`${buildDir}/converted`);
  // A references.bib at the project root switches citations on: `[@key]`
  // spans become Typst #cite calls and the bibliography section is generated.
  // Only real entries count — the scaffolded file ships commented-out
  // examples, and an empty bibliography must not render an empty References
  // heading in every new report.
  const bibText = await platform
    .readTextFile(`${projectDir}/references.bib`)
    .then((t) => (bibliographyKeys(t).size > 0 ? t : null))
    .catch(() => null);
  // The in-house remark→Typst emitter is the default since the M5 cutover
  // (byte-identical with pandoc on the demo fixture and the migrated real
  // report — fixtures/golden-typst/ and scripts/converter-parity.ts).
  const converter =
    options.converter ??
    new RemarkConverter(bibText === null ? {} : { citationKeys: bibliographyKeys(bibText) });

  const converted: ConvertedSection[] = [];
  const referencedRenders = new Set<string>();
  for (let i = 0; i < project.meta.sections.length; i++) {
    const section = project.meta.sections[i]!;
    const source = await platform.readTextFile(`${projectDir}/${section.file}`);

    // Unlike document.yaml (where markers break the load), markers in a
    // section build fine — straight into the hand-in PDF. Warn loudly.
    if (/^<{7}( |\r?$)/m.test(source)) {
      warnings.push(
        `"${section.file}" contains unresolved Git merge conflict markers (<<<<<<<), which will show up in the PDF.`,
      );
    }

    const { markdown, blocks } = extractMermaidBlocks(source);
    for (const block of blocks) {
      referencedRenders.add(block.renderedPath);
      if (!(await platform.fileExists(`${projectDir}/${block.renderedPath}`))) {
        throw new PaperstackError(
          "diagram-not-rendered",
          `A diagram in "${section.file}" has not been rendered yet. Open that section in Paperstack to render it, then try again.`,
          `expected ${block.renderedPath}`,
        );
      }
    }

    const slash = section.file.lastIndexOf("/");
    const sectionDir = slash === -1 ? "" : section.file.slice(0, slash);
    let typst: string;
    try {
      typst = await converter.toTypst(markdown, sectionDir);
    } catch (e) {
      // Conversion errors (unsupported math, unknown citation key, …) say
      // which section to open — the converter alone cannot know.
      if (e instanceof PaperstackError) {
        throw new PaperstackError(e.code, `In "${section.file}": ${e.userMessage}`, e.details);
      }
      throw e;
    }

    const stem = section.file.slice(slash + 1).replace(/\.md$/i, "");
    const outRel = `output/.build/converted/${String(i).padStart(3, "0")}-${stem}.typ`;
    await platform.writeTextFile(`${projectDir}/${outRel}`, typst);
    converted.push({ path: `/${outRel}`, role: section.role });
  }

  const templateRel = "paperstack-template.typ";
  if (!(await platform.fileExists(`${projectDir}/${templateRel}`))) {
    await platform.writeTextFile(`${projectDir}/${templateRel}`, SEA_TEMPLATE);
  }
  const main = generateMainTypst(
    project.meta,
    converted,
    buildLengthLine(project.meta, counts),
    `/${templateRel}`,
    bibText === null ? undefined : "/references.bib",
  );
  await platform.writeTextFile(`${buildDir}/main.typ`, main);

  const compile = (outputRel: string) =>
    platform.runBinary(options.typst, [
      "compile",
      "--root",
      projectDir,
      `${buildDir}/main.typ`,
      `${projectDir}/${outputRel}`,
    ]);

  let pdfRel = "output/report.pdf";
  let result = await compile(pdfRel);

  // Most common Windows export failure: report.pdf is open in a viewer.
  if (result.exitCode !== 0 && /os error 32|permission denied|failed to (write|create)/i.test(result.stderr)) {
    // Local time, not UTC — the fallback filename should match the user's clock.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    pdfRel = `output/report-${stamp}.pdf`;
    warnings.push(
      `report.pdf is locked — it is probably open in a PDF viewer. The report was saved as ${pdfRel} instead.`,
    );
    result = await compile(pdfRel);
  }

  if (result.exitCode !== 0) throw mapTypstError(result.stderr);

  // Only after a successful export: renders for since-edited diagrams are stale.
  await sweepStaleRenders(platform, projectDir, referencedRenders);

  // Converted .typ files for renamed/removed sections linger forever
  // otherwise (harmless — main.typ never includes them — but they pile up).
  // Same rule as the diagram sweep: only files matching this builder's own
  // NNN-*.typ naming scheme are ever deleted, and best-effort only.
  const keepTyp = new Set(converted.map((c) => c.path.slice(c.path.lastIndexOf("/") + 1)));
  const typEntries = await platform.listDir(`${buildDir}/converted`).catch(() => []);
  for (const name of typEntries) {
    if (!/^\d{3}-.*\.typ$/.test(name) || keepTyp.has(name)) continue;
    await platform.removeFile(`${buildDir}/converted/${name}`).catch(() => {});
  }

  return { pdfPath: `${projectDir}/${pdfRel}`, counts, warnings };
}

function mapTypstError(stderr: string): PaperstackError {
  const notFound = stderr.match(/file not found \(searched at ([^)]+)\)/);
  if (notFound) {
    return new PaperstackError(
      "image-missing",
      `The file "${notFound[1]}" could not be found. Check that it exists, or reinsert it.`,
      stderr,
    );
  }
  const firstError =
    stderr
      .split(/\r?\n/)
      .find((line) => line.includes("error:"))
      ?.replace(/^.*?error:\s*/, "") ?? "unknown error";
  return new PaperstackError(
    "export-failed",
    `The PDF could not be created: ${firstError}`,
    stderr,
  );
}
