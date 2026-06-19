import { invoke } from "@tauri-apps/api/core";

interface GitOutput {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/** Runs one allowlisted Git invocation in the project, validated in Rust. */
function runGit(dir: string, args: string[]): Promise<GitOutput> {
  return invoke<GitOutput>("run_git", { dir, args });
}

export interface GitStatus {
  /** False when the folder is not a Git repository (or git is unavailable). */
  isRepo: boolean;
  branch: string | null;
  upstream: string | null;
  /** Commits to push (HEAD ahead of upstream). */
  ahead: number;
  /** Commits to pull (upstream ahead of HEAD) — accurate only after a fetch. */
  behind: number;
  /** Uncommitted changes in the working tree (tracked edits + untracked). */
  changed: number;
}

/**
 * Parse `git status --porcelain=v2 --branch` output. Pure (no Tauri) so it is
 * unit-tested: one mis-parsed header would silently misreport ahead/behind.
 * The `# branch.*` headers carry the branch, upstream, and ab counts; every
 * other non-`#` line is one changed/untracked entry.
 */
export function parseGitStatus(stdout: string): Omit<GitStatus, "isRepo"> {
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  let changed = 0;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      const b = line.slice("# branch.head ".length).trim();
      branch = b === "(detached)" || b === "" ? null : b;
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length).trim() || null;
    } else if (line.startsWith("# branch.ab ")) {
      const m = /\+(\d+)\s+-(\d+)/.exec(line);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
    } else if (line !== "" && !line.startsWith("#")) {
      changed++;
    }
  }
  return { branch, upstream, ahead, behind, changed };
}

/** Current branch, tracking position, and working-tree dirtiness. */
export async function gitStatus(dir: string): Promise<GitStatus> {
  const out = await runGit(dir, ["status", "--porcelain=v2", "--branch"]);
  if (out.exit_code !== 0) {
    return { isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, changed: 0 };
  }
  return { isRepo: true, ...parseGitStatus(out.stdout) };
}

function check(out: GitOutput): void {
  if (out.exit_code !== 0) {
    throw new Error(out.stderr.trim() || out.stdout.trim() || "The Git command failed.");
  }
}

/** Update remote-tracking refs so behind/ahead counts are accurate. */
export async function gitFetch(dir: string): Promise<void> {
  check(await runGit(dir, ["fetch", "--quiet"]));
}

/** Fast-forward only — never creates a merge commit, so a divergent history
 *  fails loudly instead of producing surprise merges. */
export async function gitPull(dir: string): Promise<void> {
  check(await runGit(dir, ["pull", "--ff-only", "--quiet"]));
}

export async function gitPush(dir: string): Promise<void> {
  check(await runGit(dir, ["push", "--quiet"]));
}

/** Stage everything and commit — the group's "save my work to the shared history". */
export async function gitCommitAll(dir: string, message: string): Promise<void> {
  check(await runGit(dir, ["add", "--all"]));
  check(await runGit(dir, ["commit", "--quiet", "-m", message]));
}
