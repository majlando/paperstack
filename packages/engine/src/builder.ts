import type { Platform } from "./platform.ts";
import { PaperstackError } from "./errors.ts";
import { loadProject } from "./project.ts";
import { countProject, type ProjectCounts } from "./counters.ts";
import { extractMermaidBlocks } from "./mermaid.ts";
import { PandocConverter, type Converter } from "./converter.ts";
import { SEA_TEMPLATE } from "./template.ts";
import {
  buildLengthLine,
  generateMainTypst,
  type ConvertedSection,
} from "./assembler.ts";

export interface BuildOptions {
  typstPath: string;
  pandocPath: string;
  /** Override the converter (tests, future remark emitter). */
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
  for (const [name, path] of [
    ["PDF engine (typst)", options.typstPath],
    ["converter (pandoc)", options.pandocPath],
  ] as const) {
    if (!(await platform.fileExists(path))) {
      throw new PaperstackError(
        "dependency-missing",
        `The ${name} could not be found. Reinstall Paperstack — or, in development, run scripts/fetch-binaries.ps1.`,
        `expected at ${path}`,
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

  const buildDir = `${projectDir}/output/.build`;
  await platform.mkdir(`${buildDir}/converted`);
  const converter =
    options.converter ?? new PandocConverter(platform, options.pandocPath);

  const converted: ConvertedSection[] = [];
  for (let i = 0; i < project.meta.sections.length; i++) {
    const section = project.meta.sections[i]!;
    const source = await platform.readTextFile(`${projectDir}/${section.file}`);

    const { markdown, blocks } = extractMermaidBlocks(source);
    for (const block of blocks) {
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
    const typst = await converter.toTypst(markdown, sectionDir);

    const stem = section.file.slice(slash + 1).replace(/\.md$/i, "");
    const outRel = `output/.build/converted/${String(i).padStart(3, "0")}-${stem}.typ`;
    await platform.writeTextFile(`${projectDir}/${outRel}`, typst);
    converted.push({ path: `/${outRel}`, role: section.role });
  }

  await platform.writeTextFile(`${buildDir}/sea.typ`, SEA_TEMPLATE);
  const main = generateMainTypst(
    project.meta,
    converted,
    buildLengthLine(project.meta, counts),
  );
  await platform.writeTextFile(`${buildDir}/main.typ`, main);

  const compile = (outputRel: string) =>
    platform.runBinary(options.typstPath, [
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
