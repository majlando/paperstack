export type ErrorCode =
  | "project-exists"
  | "metadata-missing"
  | "metadata-conflict-markers"
  | "metadata-invalid-yaml"
  | "metadata-invalid"
  | "section-missing"
  | "diagram-not-rendered"
  | "dependency-missing"
  | "convert-failed"
  | "math-invalid"
  | "citation-unknown"
  | "image-missing"
  | "figure-unsupported"
  | "output-locked"
  | "export-failed";

/**
 * Every error the engine throws carries a `userMessage` written for the
 * person writing the report — never a raw exit code or tool name.
 * `details` holds the underlying tool output for logs/diagnostics only.
 */
export class PaperstackError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly userMessage: string,
    readonly details?: string,
  ) {
    super(userMessage);
    this.name = "PaperstackError";
  }
}
