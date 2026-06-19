/**
 * Shared extension plumbing: the engine Platform the commands run on, the
 * project-root lookup, and PaperstackError → human message mapping. Kept in one
 * place so extension.ts and authoring.ts agree on *which* project they act on,
 * and so no command ever surfaces a raw exit code (a Paperstack rule).
 */
import * as vscode from "vscode";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PaperstackError } from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

/** The extension host runs Node, so the engine drives its own NodePlatform. */
export const platform = new NodePlatform();

/** First workspace folder that holds a document.yaml — the project root loadProject expects. */
export function findProjectDir(): string | null {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const dir = folder.uri.fsPath;
    if (existsSync(join(dir, "document.yaml"))) return dir.replaceAll("\\", "/");
  }
  return null;
}

/** Human-readable message for any thrown value — engine errors carry their own. */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof PaperstackError ? e.userMessage : `${fallback}: ${String(e)}`;
}
