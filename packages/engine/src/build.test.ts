import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NodePlatform } from "./node-platform.ts";
import { buildReport } from "./builder.ts";
import { extractMermaidBlocks } from "./mermaid.ts";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const fixtureDir = join(root, "fixtures/demo-report").replaceAll("\\", "/");
const exe = process.platform === "win32" ? ".exe" : "";
const typstPath = join(root, "bin", `typst${exe}`);
const pandocPath = join(root, "bin", `pandoc${exe}`);

// Integration test: needs the dev binaries (scripts/fetch-binaries.ps1).
// Skipped where they are absent (e.g. CI) — unit tests still cover the logic.
const hasBinaries = existsSync(typstPath) && existsSync(pandocPath);

describe.skipIf(!hasBinaries)("buildReport on the demo fixture", () => {
  beforeAll(async () => {
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

  it("produces a PDF and sensible warnings", async () => {
    const platform = new NodePlatform();
    const result = await buildReport(platform, fixtureDir, {
      typstPath,
      pandocPath,
    });

    expect(existsSync(result.pdfPath)).toBe(true);
    expect(statSync(result.pdfPath).size).toBeGreaterThan(10_000);
    // The fixture deliberately contains 2 TODOs.
    expect(result.warnings.some((w) => w.includes("2 [TODO]"))).toBe(true);
    expect(result.counts.bodyNormalsider).toBeLessThan(result.counts.cap);
  }, 60_000);
});
