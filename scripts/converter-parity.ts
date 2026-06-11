/**
 * Converter parity check: converts every section of a project with both the
 * Pandoc sidecar and the remark→Typst emitter and diffs the output. This is
 * the measuring stick for the Milestone 5 converter cutover — the demo
 * fixture is covered by committed goldens in CI; this script exists to run
 * the same comparison over local projects (e.g. the migrated real report,
 * which is git-ignored and must never become a committed fixture).
 *
 * Usage: pnpm tsx scripts/converter-parity.ts <project-dir>
 * Requires bin/pandoc (pnpm fetch-binaries). Prints a per-section verdict
 * and the first diverging lines; exits 1 when any section diverges.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PandocConverter,
  RemarkConverter,
  dirOf,
  extractMermaidBlocks,
  loadProject,
} from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

const projectDir = resolve(process.argv[2] ?? "fixtures/demo-report").replaceAll("\\", "/");
const exe = process.platform === "win32" ? ".exe" : "";
const pandocPath = resolve("bin", `pandoc${exe}`);

const platform = new NodePlatform();
const scratchDir = (await mkdtemp(join(tmpdir(), "paperstack-parity-"))).replaceAll("\\", "/");
const pandoc = new PandocConverter(platform, pandocPath, scratchDir);
const remark = new RemarkConverter();

const normalize = (s: string) => s.replaceAll("\r\n", "\n");

try {
  const project = await loadProject(platform, projectDir);
  let divergent = 0;

  for (const section of project.meta.sections) {
    const source = await platform.readTextFile(`${projectDir}/${section.file}`);
    const { markdown } = extractMermaidBlocks(source);
    const sectionDir = dirOf(section.file);
    const [a, b] = await Promise.all([
      pandoc.toTypst(markdown, sectionDir).then(normalize),
      remark.toTypst(markdown, sectionDir).then(normalize),
    ]);
    if (a === b) {
      console.log(`  ok        ${section.file}`);
      continue;
    }
    divergent++;
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    let line = 0;
    while (line < Math.max(aLines.length, bLines.length) && aLines[line] === bLines[line]) line++;
    console.log(`  DIVERGES  ${section.file} (first difference at line ${line + 1})`);
    console.log(`    pandoc: ${aLines[line] ?? "<end of output>"}`);
    console.log(`    remark: ${bLines[line] ?? "<end of output>"}`);
  }

  console.log(
    divergent === 0
      ? `\nAll ${project.meta.sections.length} sections byte-identical.`
      : `\n${divergent} of ${project.meta.sections.length} sections diverge.`,
  );
  process.exitCode = divergent === 0 ? 0 : 1;
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
