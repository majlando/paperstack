/**
 * Emit options for re-stringifying document.yaml. The yaml library does not
 * read formatting style from the source, so without help a structure edit
 * re-wraps and re-indents the whole file — churn in a file the group shares
 * over Git. lineWidth: 0 keeps hand-written long lines; the indent style is
 * detected from the text being edited.
 */
import type { ToStringOptions } from "yaml";

export function emitOptions(yamlText: string): ToStringOptions {
  const style: ToStringOptions = { lineWidth: 0 };
  // Indent width: the first indented non-comment line. Hand-written files
  // commonly use 4; the scaffold uses 2 (the library default).
  const indented = /^( +)[^\s#]/m.exec(yamlText);
  if (indented) {
    const width = indented[1]!.length;
    if (width >= 1 && width <= 8) style.indent = width;
  }
  // Sequence style: `sections:` followed by `- …` at column 0 means the
  // author writes sequence items flush with their key.
  if (/^[^\s#-][^\n]*:[ \t]*\r?\n-[ \t]/m.test(yamlText)) style.indentSeq = false;
  return style;
}
