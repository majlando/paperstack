import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { latexToTypstMath } from "./typst-math.ts";
import { PaperstackError } from "../errors.ts";

export interface MathProblem {
  /** Character offset of the math expression — drives click-to-jump. */
  offset: number;
  message: string;
}

/** Minimal structural view of the mdast nodes this walker touches. */
interface MdNode {
  type: string;
  value?: string;
  position?: { start?: { offset?: number } };
  children?: MdNode[];
}

const parser = unified().use(remarkParse).use(remarkMath);

/**
 * Math expressions the export cannot convert, with their character offsets.
 * Uses the same parse (remark-math) and translator (`latexToTypstMath`) the
 * converter runs, so the pre-check matches the export exactly — what passes
 * here compiles, what fails here would fail the export too. Lets the Problems
 * panel surface unsupported math before hand-in instead of at export time.
 */
export function findMathProblems(markdown: string): MathProblem[] {
  const problems: MathProblem[] = [];
  const walk = (node: MdNode): void => {
    if ((node.type === "inlineMath" || node.type === "math") && typeof node.value === "string") {
      try {
        latexToTypstMath(node.value);
      } catch (e) {
        if (!(e instanceof PaperstackError)) throw e;
        problems.push({ offset: node.position?.start?.offset ?? 0, message: e.userMessage });
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(parser.parse(markdown) as unknown as MdNode);
  return problems;
}
