import { describe, expect, it } from "vitest";
import { findMathProblems } from "./math-check.ts";

describe("findMathProblems", () => {
  it("returns nothing for math the export can convert", () => {
    expect(findMathProblems("Inline $x^2$ and display:\n\n$$a + b = c$$\n")).toEqual([]);
  });

  it("flags an unsupported command, with its offset for jump-to", () => {
    const md = "text before $\\foobar{x}$ after";
    const probs = findMathProblems(md);
    expect(probs).toHaveLength(1);
    expect(probs[0]!.message).toMatch(/could not be converted/);
    expect(md.slice(probs[0]!.offset)).toMatch(/^\$\\foobar/);
  });

  it("only checks real math nodes, not $ inside inline code or lone $", () => {
    expect(findMathProblems("`$\\foobar$` in code, and a price of $5")).toEqual([]);
  });
});
