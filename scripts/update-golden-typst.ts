/**
 * Regenerates the committed pandoc golden files in fixtures/golden-typst/:
 * every section of fixtures/demo-report converted through the real pandoc in
 * bin/ with the exact PandocConverter pipeline (gfm+implicit_figures+attributes
 * → typst, --wrap=none, then the image-path rewrite). The goldens are the
 * measuring stick for the remark→Typst emitter and make pandoc upgrades
 * visible (see docs/DEVELOPMENT.md, Milestone 5).
 *
 * Usage: pnpm tsx scripts/update-golden-typst.ts
 * Requires bin/pandoc (populate via pnpm fetch-binaries).
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PandocConverter,
  baseOf,
  dirOf,
  extractMermaidBlocks,
  loadProject,
  stemOf,
} from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

const projectDir = resolve("fixtures/demo-report").replaceAll("\\", "/");
const goldenDir = resolve("fixtures/golden-typst").replaceAll("\\", "/");
const exe = process.platform === "win32" ? ".exe" : "";
const pandoc = join(resolve("bin"), `pandoc${exe}`);

const platform = new NodePlatform();
const scratchDir = (await mkdtemp(join(tmpdir(), "paperstack-golden-"))).replaceAll("\\", "/");
try {
  const project = await loadProject(platform, projectDir);
  const converter = new PandocConverter(platform, pandoc, scratchDir);
  await mkdir(goldenDir, { recursive: true });

  const seen = new Set<string>();
  for (const section of project.meta.sections) {
    const stem = stemOf(baseOf(section.file));
    if (seen.has(stem)) {
      throw new Error(`two sections share the golden stem "${stem}" — rename one fixture file`);
    }
    seen.add(stem);

    const source = await platform.readTextFile(`${projectDir}/${section.file}`);
    // Mirror the builder: mermaid blocks are extracted (replaced by image
    // references) before any markdown reaches the converter.
    const { markdown } = extractMermaidBlocks(source);
    const typst = await converter.toTypst(markdown, dirOf(section.file));

    // Committed goldens are LF regardless of platform (pandoc emits native
    // line endings) so the files are identical on every contributor's OS.
    const outPath = `${goldenDir}/${stem}.typ`;
    await writeFile(outPath, typst.replaceAll("\r\n", "\n"), "utf8");
    console.log(`wrote ${outPath}`);
  }
} finally {
  await rm(scratchDir, { recursive: true, force: true });
}
