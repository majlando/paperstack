import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { cp, readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodePlatform } from "../platform/node-platform.ts";
import { buildReport } from "./builder.ts";
import { extractMermaidBlocks } from "./mermaid.ts";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const sourceFixtureDir = join(root, "fixtures/demo-report").replaceAll("\\", "/");
let fixtureDir = sourceFixtureDir;
const exe = process.platform === "win32" ? ".exe" : "";
const typstPath = join(root, "bin", `typst${exe}`);

// Integration test: needs the dev typst (pnpm fetch-binaries) — conversion
// is in-process since the M5 cutover. Skipped where the binary is absent;
// CI fetches it, so this runs on every push.
const hasBinaries = existsSync(typstPath);

describe.skipIf(!hasBinaries)("buildReport on the demo fixture", () => {
  beforeAll(async () => {
    fixtureDir = (await mkdtemp(join(tmpdir(), "paperstack-build-test-"))).replaceAll("\\", "/");
    await cp(sourceFixtureDir, fixtureDir, { recursive: true });

    // A local build may have vendored the then-current template into the
    // fixture (git-ignored). Drop the copy so this test always exercises
    // SEA_TEMPLATE as it stands now, like it does in CI.
    await rm(join(fixtureDir, "paperstack-template.typ"), { force: true });

    // Ensure the fixture's mermaid block has a rendered SVG (in the app
    // this happens on save; the placeholder stands in for a real render).
    const section = await readFile(
      join(fixtureDir, "sections/02-implementation.md"),
      "utf8",
    );
    const { blocks } = extractMermaidBlocks(section);
    for (const block of blocks) {
      const svgPath = join(fixtureDir, block.renderedPath);
      if (!existsSync(svgPath)) {
        await mkdir(join(fixtureDir, "diagrams/rendered"), { recursive: true });
        await writeFile(
          svgPath,
          `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60">` +
            `<rect x="1" y="1" width="238" height="58" fill="#f0f9ff" stroke="#0369a1"/>` +
            `<text x="120" y="35" text-anchor="middle" font-family="sans-serif" font-size="12">[diagram placeholder]</text></svg>`,
          "utf8",
        );
      }
    }
  });

  afterAll(async () => {
    if (fixtureDir !== sourceFixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("produces a PDF and sensible warnings", async () => {
    const platform = new NodePlatform();
    const result = await buildReport(platform, fixtureDir, { typst: typstPath });

    expect(existsSync(result.pdfPath)).toBe(true);
    expect(statSync(result.pdfPath).size).toBeGreaterThan(10_000);
    // The fixture deliberately contains 2 TODOs.
    expect(result.warnings.some((w) => w.includes("2 [TODO]"))).toBe(true);
    expect(result.counts.bodyNormalsider).toBeLessThan(result.counts.cap);
  }, 60_000);

  it("builds a report containing inline and display math", async () => {
    const mathDir = (await mkdtemp(join(tmpdir(), "paperstack-build-math-"))).replaceAll("\\", "/");
    try {
      await cp(fixtureDir, mathDir, { recursive: true });
      const section = join(mathDir, "sections/03-conclusion.md");
      await writeFile(
        section,
        (await readFile(section, "utf8")) +
          "\n## Complexity\n\nLookup is $\\mathcal{O}(\\log n)$ because the loop halves the range.\n\n" +
          "$$\nT(n) = T\\left(\\frac{n}{2}\\right) + 1 \\implies T(n) \\in \\mathcal{O}(\\log n)\n$$\n",
        "utf8",
      );

      const platform = new NodePlatform();
      const result = await buildReport(platform, mathDir, { typst: typstPath });
      expect(existsSync(result.pdfPath)).toBe(true);

      const typst = await readFile(
        join(mathDir, "output/.build/converted/003-03-conclusion.typ"),
        "utf8",
      );
      expect(typst).toContain("$cal(O) ( log n )$");
      expect(typst).toContain("$ T ( n ) = T lr(( (n)/(2) )) + 1 ==> T ( n ) in cal(O) ( log n ) $");
    } finally {
      await rm(mathDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("builds the same project as a Danish report with localized labels", async () => {
    const daDir = (await mkdtemp(join(tmpdir(), "paperstack-build-da-"))).replaceAll("\\", "/");
    try {
      // Reuse the prepared fixture copy (diagram render included).
      await cp(fixtureDir, daDir, { recursive: true });
      const yamlPath = join(daDir, "document.yaml");
      const yaml = await readFile(yamlPath, "utf8");
      await writeFile(yamlPath, yaml.replace(/^language: en$/m, "language: da"), "utf8");

      const platform = new NodePlatform();
      const result = await buildReport(platform, daDir, { typst: typstPath });

      expect(existsSync(result.pdfPath)).toBe(true);
      expect(statSync(result.pdfPath).size).toBeGreaterThan(10_000);
      // The cover length line is engine-localized; Typst localizes the rest
      // (Indholdsfortegnelse, Figur) via text(lang:) from the same setting.
      const main = await readFile(join(daDir, "output/.build/main.typ"), "utf8");
      expect(main).toContain('language: "da"');
      expect(main).toContain("normalsider");
      expect(main).toContain("Anslag");
    } finally {
      await rm(daDir, { recursive: true, force: true });
    }
  }, 60_000);
});
