import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodePlatform } from "../platform/node-platform.ts";
import { loadProject } from "../project/load-project.ts";
import { baseOf, dirOf, stemOf } from "../project/paths.ts";
import { extractMermaidBlocks } from "./mermaid.ts";
import { PandocConverter } from "./converter.ts";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const fixtureDir = join(root, "fixtures/demo-report").replaceAll("\\", "/");
const goldenDir = join(root, "fixtures/golden-typst");
const exe = process.platform === "win32" ? ".exe" : "";
const pandocPath = join(root, "bin", `pandoc${exe}`);

// Integration test: needs the dev pandoc (scripts/fetch-binaries.ps1), like
// the PDF test in build.test.ts. Skipped where it is absent (e.g. CI).
const hasPandoc = existsSync(pandocPath);

const normalizeEol = (s: string) => s.replaceAll("\r\n", "\n");

describe.skipIf(!hasPandoc)("pandoc golden files (fixtures/golden-typst)", () => {
  it("pandoc still produces exactly the committed goldens for every demo section", async () => {
    const platform = new NodePlatform();
    const scratchDir = (await mkdtemp(join(tmpdir(), "paperstack-golden-test-"))).replaceAll(
      "\\",
      "/",
    );
    try {
      const project = await loadProject(platform, fixtureDir);
      const converter = new PandocConverter(platform, pandocPath, scratchDir);
      expect(project.meta.sections.length).toBeGreaterThan(0);

      for (const section of project.meta.sections) {
        const source = await platform.readTextFile(`${fixtureDir}/${section.file}`);
        const { markdown } = extractMermaidBlocks(source);
        const typst = await converter.toTypst(markdown, dirOf(section.file));
        const goldenPath = join(goldenDir, `${stemOf(baseOf(section.file))}.typ`);
        const golden = await readFile(goldenPath, "utf8");
        // If this fails after a pandoc upgrade, inspect the diff and rerun
        // `pnpm tsx scripts/update-golden-typst.ts` to accept it.
        expect(normalizeEol(typst), section.file).toBe(normalizeEol(golden));
      }
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  }, 60_000);
});
