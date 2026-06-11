/**
 * Dev runner for the report engine: builds a Paperstack project folder to PDF.
 * Usage: pnpm build:demo            (builds fixtures/demo-report)
 *        pnpm tsx scripts/build-report.ts <project-dir>
 * Requires bin/typst (pnpm fetch-binaries).
 * The in-house remark→Typst emitter is the default converter (M5 cutover).
 * Set PAPERSTACK_CONVERTER=pandoc (or pass --converter=pandoc) to build with
 * the pandoc fallback instead — needs bin/pandoc.
 */
import { resolve, join } from "node:path";
import { buildReport, PandocConverter, PaperstackError } from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const projectDir = resolve(args[0] ?? "fixtures/demo-report").replaceAll("\\", "/");
const exe = process.platform === "win32" ? ".exe" : "";
const binDir = resolve("bin");
const usePandoc =
  process.env.PAPERSTACK_CONVERTER === "pandoc" || flags.includes("--converter=pandoc");
if (usePandoc) console.log("Converter: pandoc (fallback)");

const platform = new NodePlatform();
try {
  const result = await buildReport(platform, projectDir, {
    typst: join(binDir, `typst${exe}`),
    ...(usePandoc
      ? {
          // The builder creates output/.build before converting — pandoc's
          // temp input file lives there, same as before the cutover.
          converter: new PandocConverter(
            platform,
            join(binDir, `pandoc${exe}`),
            `${projectDir}/output/.build`,
          ),
        }
      : {}),
  });

  console.log("\nSection lengths:");
  for (const s of result.counts.sections) {
    const ns = s.normalsider.toFixed(2).padStart(6);
    const todo = s.todos > 0 ? `  [${s.todos} TODO]` : "";
    console.log(`  ${s.file.padEnd(40)} ${String(s.chars).padStart(7)} chars ${ns} ns  (${s.role})${todo}`);
  }
  console.log(
    `  ${"TOTAL BODY".padEnd(40)} ${String(result.counts.bodyChars).padStart(7)} chars ${result.counts.bodyNormalsider.toFixed(2).padStart(6)} ns  (cap ${result.counts.cap})`,
  );

  for (const warning of result.warnings) console.log(`\nWarning: ${warning}`);
  console.log(`\nWrote ${result.pdfPath}`);
} catch (error) {
  if (error instanceof PaperstackError) {
    console.error(`\n${error.userMessage}`);
    if (process.env.DEBUG && error.details) console.error(`\n--- details ---\n${error.details}`);
    process.exit(1);
  }
  throw error;
}
