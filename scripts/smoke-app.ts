/**
 * Scripted smoke test for the app shell: scaffolds a scratch project,
 * launches the real app (tauri dev) with the VITE_SMOKE_SCRIPT hook, and
 * asserts the result the in-app scenario writes (open → edit → save →
 * TODO confirm → export, see apps/desktop/src/dev/smoke.ts).
 *
 * Usage: pnpm smoke
 * Needs sidecars in apps/desktop/src-tauri/binaries (pnpm fetch-binaries),
 * a free port 1420, and a desktop session — local only, never CI.
 */
import { spawn, execSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProject } from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

const TIMEOUT_S = 360; // generous: a cold tauri dev includes a cargo build

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" }, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(true));
  });
}

if (!(await portFree(1420))) {
  console.error(
    "Port 1420 is in use — kill the stale dev server first (its env is baked in at Vite startup).",
  );
  process.exit(1);
}

const scratch = (await mkdtemp(join(tmpdir(), "paperstack-smoke-"))).replaceAll("\\", "/");
await createProject(new NodePlatform(), scratch, {
  title: "Smoke Test Report",
  date: "2026-01-01",
});
console.log(`Scratch project: ${scratch}`);

console.log("Launching the app (tauri dev)…");

// One command string: shell:true (needed to resolve pnpm.cmd on Windows)
// concatenates args anyway, and a string avoids Node's DEP0190 warning.
const child = spawn("pnpm --filter @paperstack/desktop tauri dev", {
  env: { ...process.env, VITE_OPEN_PROJECT: scratch, VITE_SMOKE_SCRIPT: "1" },
  stdio: "ignore",
  shell: true,
});

interface SmokeResult {
  pass: boolean;
  steps: { name: string; ok: boolean; detail?: string }[];
}

const resultPath = join(scratch, "output", "smoke-result.json");
let result: SmokeResult | null = null;
const deadline = Date.now() + TIMEOUT_S * 1000;
while (Date.now() < deadline && result === null) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    result = JSON.parse(await readFile(resultPath, "utf8")) as SmokeResult;
  } catch {
    // not written yet — keep polling
  }
}

// Tear down the whole tree (pnpm → tauri → app) before judging the result.
if (child.pid !== undefined) {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    } catch {
      // already gone
    }
  } else {
    child.kill("SIGTERM");
  }
}

if (result === null) {
  console.error(
    `\nNo smoke result within ${TIMEOUT_S}s — scratch kept for inspection: ${scratch}`,
  );
  process.exit(1);
}

console.log("");
for (const step of result.steps) {
  const detail = !step.ok && step.detail ? ` — ${step.detail}` : "";
  console.log(` ${step.ok ? "✓" : "×"} ${step.name}${detail}`);
}
if (result.pass) {
  await rm(scratch, { recursive: true, force: true });
  console.log("\nSmoke test passed.");
} else {
  console.error(`\nSmoke test FAILED — scratch kept for inspection: ${scratch}`);
  process.exit(1);
}
