/**
 * Submission-readiness check for a Paperstack project — the report "franchise"
 * (length-vs-cap + what's-not-ready) distilled to one headless command, with no
 * Typst binary required. It reads the project exactly as the app does and reuses
 * the engine's own checks (countProject + collectProblems + the math pre-check),
 * so the terminal and the in-app Problems panel can never disagree.
 *
 * Usage: pnpm tsx scripts/check-report.ts <project-dir>   (default fixtures/demo-report)
 *
 * Exits non-zero when the report has blocking errors, so it drops straight into
 * CI or a pre-commit hook to keep a Git-shared group report submission-ready.
 */
import { resolve } from "node:path";
import {
  loadProject,
  countProject,
  collectProblems,
  bibliographyKeys,
  findMathProblems,
  PaperstackError,
  type Problem,
} from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const projectDir = resolve(arg ?? "fixtures/demo-report").replaceAll("\\", "/");
const platform = new NodePlatform();

/** offset → 1-based line, so problems read as file:line like every other CS tool. */
function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") line++;
  }
  return line;
}

try {
  const project = await loadProject(platform, projectDir);
  const counts = await countProject(platform, project);

  // Same rule as the builder/store: a non-empty references.bib activates
  // citation validation; without one, citations are inactive (nothing to check).
  let bibKeys = new Set<string>();
  try {
    bibKeys = bibliographyKeys(await platform.readTextFile(`${projectDir}/references.bib`));
  } catch {
    // no references.bib
  }

  const problems = await collectProblems(platform, project, counts, bibKeys, findMathProblems);

  // --- Length ---
  const { cap, bodyNormalsider: used, overCap } = counts;
  const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
  const verdict = overCap
    ? `OVER cap by ${(used - cap).toFixed(2)} ns`
    : `${(cap - used).toFixed(2)} ns to spare`;
  console.log(`\nPaperstack check — ${projectDir}\n`);
  console.log(`Length (body):  ${used.toFixed(2)} / ${cap} normalsider  (${pct}%) — ${verdict}`);
  for (const s of counts.sections) {
    // Only body sections count toward the cap; others are shown for context.
    const note = s.role === "body" ? "" : "  (not counted)";
    console.log(
      `   ${s.file.padEnd(38)} ${s.normalsider.toFixed(2).padStart(6)} ns  ${s.role}${note}`,
    );
  }

  // --- Problems (errors first, then warnings; each with a file:line) ---
  const fileCache = new Map<string, string>();
  const where = async (p: Problem): Promise<string> => {
    if (!p.file) return "";
    if (p.offset === undefined) return p.file;
    let content = fileCache.get(p.file);
    if (content === undefined) {
      content = await platform.readTextFile(`${projectDir}/${p.file}`).catch(() => "");
      fileCache.set(p.file, content);
    }
    return `${p.file}:${lineAt(content, p.offset)}`;
  };

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  console.log(`\nReadiness:  ${plural(errors.length, "error")}, ${plural(warnings.length, "warning")}`);
  for (const p of [...errors, ...warnings]) {
    const tag = p.severity === "error" ? "ERROR" : "WARN ";
    const loc = await where(p);
    console.log(`   ${tag}  ${loc ? loc + "  " : ""}${p.message}`);
  }

  if (errors.length > 0) {
    console.log(`\nNot ready to submit — ${plural(errors.length, "blocking error")}.\n`);
    process.exit(1);
  }
  const tail = warnings.length ? ` (${plural(warnings.length, "warning")} to review)` : "";
  console.log(`\nReady to submit.${tail}\n`);
} catch (error) {
  if (error instanceof PaperstackError) {
    console.error(`\n${error.userMessage}`);
    if (process.env.DEBUG && error.details) console.error(`\n--- details ---\n${error.details}`);
    process.exit(1);
  }
  throw error;
}
