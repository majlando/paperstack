/**
 * Handle to the single mounted MarkdownEditor instance, so non-editor chrome
 * (e.g. the status bar's TODO jump) can drive it imperatively without
 * threading refs through React. There is exactly one editor in the app.
 */
import type { MarkdownEditor } from "./markdown-editor.ts";

let active: MarkdownEditor | null = null;

export function registerEditor(editor: MarkdownEditor | null): void {
  active = editor;
}

export function activeEditor(): MarkdownEditor | null {
  return active;
}
