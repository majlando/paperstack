/**
 * Dev runner for the report engine: builds a Paperstack project folder to PDF.
 * Usage: pnpm build:demo            (builds fixtures/demo-report)
 *        pnpm tsx scripts/build-report.ts <project-dir>
 * Requires bin/typst + bin/pandoc (scripts/fetch-binaries.ps1).
 */
import { resolve, join } from "node:path";
import { NodePlatform, buildReport, PaperstackError } from "@paperstack/engine";

const projectDir = resolve(process.argv[2] ?? "fixtures/demo-report").replaceAll("\\", "/");
const exe = process.platform === "win32" ? ".exe" : "";
const binDir = resolve("bin");

try {
  const result = await buildReport(new NodePlatform(), projectDir, {
    typstPath: join(binDir, `typst${exe}`),
    pandocPath: join(binDir, `pandoc${exe}`),
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
