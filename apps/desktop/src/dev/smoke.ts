/**
 * Scripted smoke scenario (VITE_SMOKE_SCRIPT=1 + VITE_OPEN_PROJECT=<dir>):
 * drives the store through the core loop — open → edit → save → TODO
 * confirm → export — and writes output/smoke-result.json into the project
 * for scripts/smoke-app.ts to assert and report. Dev hook only; the module
 * is loaded dynamically so it never reaches a release bundle.
 */
import { useStore } from "../store.ts";
import { platform, allowExistingProjectScope } from "../platform/tauri-platform.ts";
import { gitStatus, gitCommitAll, gitPush, gitFetch } from "../platform/git.ts";

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}

export async function runScriptedSmoke(projectDir: string): Promise<void> {
  const dir = projectDir.replaceAll("\\", "/");
  const steps: Step[] = [];
  const state = () => useStore.getState();
  const check = (name: string, ok: boolean, detail?: string) => {
    steps.push(detail === undefined ? { name, ok } : { name, ok, detail });
    if (!ok) throw new Error(`smoke step failed: ${name}`);
  };

  try {
    // Grant the scope up front so the result file below is writable even
    // when the open itself is what fails.
    await allowExistingProjectScope(dir);

    await state().openProject(dir);
    check(
      "project opens without error",
      state().project !== null && state().error === null,
      state().error?.message,
    );
    check("a section is active after open", state().activeFile !== null);
    check(
      "counters are live (scaffold starts with a [TODO])",
      (state().counts?.todosTotal ?? 0) >= 1,
    );

    state().setContent(`${state().content}\nSmoke paragraph appended by the scripted test.\n`);
    check("editing marks the section dirty", state().dirty);
    check("saving succeeds and clears dirty", (await state().saveActive()) && !state().dirty);
    const onDisk = await platform.readTextFile(`${dir}/${state().activeFile}`);
    check("the edit reached the disk", onDisk.includes("Smoke paragraph appended"));

    await state().exportPdf();
    check("export asks first while a [TODO] remains", state().confirmExport !== null);
    state().cancelExport();
    check("cancel clears the confirmation", state().confirmExport === null);

    await state().exportPdf(true);
    check(
      "forced export compiles via the sidecars",
      state().error === null && (state().notice?.message.startsWith("Report exported") ?? false),
      // include the technical details — a failed export's headline alone
      // doesn't say which layer (validation, spawn, tool) refused
      [state().error?.message, state().error?.details].filter(Boolean).join(" | ") || undefined,
    );
    check("the exported PDF exists", await platform.fileExists(`${dir}/output/report.pdf`));

    // --- Git panel: drive the live run_git command end to end. The harness
    // makes the scratch a Git repo with a remote and leaves the section edit
    // above uncommitted, so there is a real branch, upstream, and change. ---
    const before = await gitStatus(dir);
    check("git status reads the repository", before.isRepo, before.isRepo ? undefined : "not a repo");
    check(
      "git status reports branch and upstream",
      before.branch !== null && before.upstream !== null,
      `branch=${before.branch} upstream=${before.upstream}`,
    );
    check("git status sees the uncommitted edit", before.changed >= 1, `changed=${before.changed}`);

    await gitCommitAll(dir, "smoke: commit the edited section");
    const committed = await gitStatus(dir);
    check(
      "commit clears the tree and goes ahead of upstream",
      committed.changed === 0 && committed.ahead >= 1,
      `changed=${committed.changed} ahead=${committed.ahead}`,
    );

    await gitPush(dir);
    check("push clears the ahead count", (await gitStatus(dir)).ahead === 0);

    await gitFetch(dir);
    check("fetch against the remote succeeds", true);
  } catch (e) {
    // a failed check is already recorded; anything else becomes its own step
    if (steps.every((s) => s.ok)) steps.push({ name: "scenario crashed", ok: false, detail: String(e) });
  }

  const pass = steps.length > 0 && steps.every((s) => s.ok);
  await platform.mkdir(`${dir}/output`);
  await platform.writeTextFile(
    `${dir}/output/smoke-result.json`,
    `${JSON.stringify({ pass, steps }, null, 2)}\n`,
  );
}
