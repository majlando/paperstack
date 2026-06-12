/**
 * LaTeX math → Typst math for the remark emitter (Milestone 5).
 *
 * Authors write standard LaTeX math between `$…$` / `$$…$$` (the syntax
 * KaTeX previews); this translates the practical subset a CS report uses —
 * scripts, fractions, roots, Greek, operators, sets, arrows, big operators
 * with limits, `\text{…}`, styles like `\mathbb`/`\mathcal`, and
 * `\left…\right` — into Typst math notation. Anything outside the subset
 * fails loudly with a readable error naming the unsupported command, never
 * silently wrong output.
 */
import { PaperstackError } from "../errors.ts";

/** Commands that map to a bare Typst symbol, operator, or shorthand. */
const SYMBOLS: Record<string, string> = {
  // Greek (LaTeX's \epsilon/\phi are the variant glyphs in Typst's naming)
  alpha: "alpha", beta: "beta", gamma: "gamma", delta: "delta",
  epsilon: "epsilon.alt", varepsilon: "epsilon", zeta: "zeta", eta: "eta",
  theta: "theta", vartheta: "theta.alt", iota: "iota", kappa: "kappa",
  lambda: "lambda", mu: "mu", nu: "nu", xi: "xi", pi: "pi", varpi: "pi.alt",
  rho: "rho", varrho: "rho.alt", sigma: "sigma", varsigma: "sigma.alt",
  tau: "tau", upsilon: "upsilon", phi: "phi.alt", varphi: "phi", chi: "chi",
  psi: "psi", omega: "omega",
  Gamma: "Gamma", Delta: "Delta", Theta: "Theta", Lambda: "Lambda", Xi: "Xi",
  Pi: "Pi", Sigma: "Sigma", Upsilon: "Upsilon", Phi: "Phi", Psi: "Psi",
  Omega: "Omega",
  // Binary operators and relations
  cdot: "dot.op", times: "times", div: "div", pm: "plus.minus",
  mp: "minus.plus", ast: "ast", star: "star", circ: "compose",
  bullet: "bullet", oplus: "plus.circle", otimes: "times.circle",
  leq: "<=", le: "<=", geq: ">=", ge: ">=", neq: "!=", ne: "!=",
  ll: "<<", gg: ">>", approx: "approx", equiv: "equiv", sim: "tilde.op",
  simeq: "tilde.eq", propto: "prop",
  // Sets and logic
  in: "in", notin: "in.not", ni: "in.rev", subset: "subset",
  subseteq: "subset.eq", supset: "supset", supseteq: "supset.eq",
  cup: "union", cap: "sect", setminus: "without", emptyset: "nothing",
  varnothing: "nothing", land: "and", wedge: "and", lor: "or", vee: "or",
  neg: "not", lnot: "not", forall: "forall", exists: "exists",
  nexists: "exists.not",
  // Arrows
  to: "->", rightarrow: "->", leftarrow: "<-", leftrightarrow: "<->",
  Rightarrow: "=>", Leftarrow: "arrow.l.double", Leftrightarrow: "<=>",
  implies: "==>", iff: "<==>", mapsto: "|->",
  // Misc symbols
  infty: "infinity", partial: "diff", nabla: "nabla", angle: "angle",
  perp: "perp", parallel: "parallel", mid: "|", ldots: "dots.h",
  dots: "dots.h", cdots: "dots.h.c", vdots: "dots.v", ddots: "dots.down",
  langle: "angle.l", rangle: "angle.r", lfloor: "floor.l",
  rfloor: "floor.r", lceil: "ceil.l", rceil: "ceil.r", prime: "prime",
  // Big operators (Typst renders limits below/above automatically)
  sum: "sum", prod: "product", int: "integral", iint: "integral.double",
  oint: "integral.cont",
  // Named operator functions Typst defines under the same name
  lim: "lim", limsup: "limsup", liminf: "liminf", log: "log", ln: "ln",
  lg: "lg", exp: "exp", sin: "sin", cos: "cos", tan: "tan", cot: "cot",
  sec: "sec", csc: "csc", arcsin: "arcsin", arccos: "arccos",
  arctan: "arctan", sinh: "sinh", cosh: "cosh", tanh: "tanh", min: "min",
  max: "max", inf: "inf", sup: "sup", arg: "arg", det: "det", gcd: "gcd",
  mod: "mod", bmod: "mod", deg: "deg", dim: "dim", ker: "ker", hom: "hom",
  Pr: "Pr",
  // Spacing
  quad: "quad", qquad: "wide",
};

/** Commands that wrap one argument in a Typst function (accents, styles). */
const WRAPPERS: Record<string, string> = {
  hat: "hat", tilde: "tilde", bar: "macron", overline: "overline",
  underline: "underline", dot: "dot", ddot: "ddot", vec: "arrow",
  mathbb: "bb", mathcal: "cal", mathbf: "bold", boldsymbol: "bold",
  mathit: "italic", mathrm: "upright", mathsf: "sans", mathtt: "mono",
  mathfrak: "frak",
};

/** Escaped single characters: `\{` etc. — what each becomes in Typst math. */
const CHAR_ESCAPES: Record<string, string> = {
  "{": "{", "}": "}", "$": "\\$", "#": "\\#", "%": "%", "&": "\\&",
  "_": "\\_", ",": "thin", ":": "med", ";": "thick", " ": "space",
  "|": "parallel", "!": "",
};

/** Characters that pass through to Typst math unchanged. */
const PASSTHROUGH = new Set([..."+-=()[]<>,.:;?!|*"]);

export function latexToTypstMath(latex: string): string {
  return new Translator(latex).translate();
}

class Translator {
  private pos = 0;

  constructor(private readonly src: string) {}

  translate(): string {
    const out = this.sequence();
    if (this.peek() === "}") this.fail("it has an unmatched \"}\"");
    return out;
  }

  /** Parses atoms (joined by spaces) until end, `}`, or `\right`. */
  private sequence(stop?: "brace" | "right"): string {
    const parts: string[] = [];
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.src.length) {
        if (stop) this.fail(stop === "brace" ? 'it has an unmatched "{"' : "it has a \\left without a matching \\right");
        break;
      }
      if (stop === "brace" && this.peek() === "}") break;
      if (stop === "right" && this.src.startsWith("\\right", this.pos)) break;
      const atom = this.atomWithScripts();
      if (atom !== "") parts.push(atom);
    }
    return parts.join(" ");
  }

  /** One atom plus any `^`/`_`/`'` attached to it. */
  private atomWithScripts(): string {
    let base = this.primary();
    for (;;) {
      this.skipWhitespace();
      const c = this.peek();
      if (c === "'") {
        this.pos++;
        base += "'";
      } else if (c === "^" || c === "_") {
        this.pos++;
        this.skipWhitespace();
        const arg = this.primary("single-token");
        base += `${c}${/^[A-Za-z0-9.']+$/.test(arg) ? arg : `(${arg})`}`;
      } else {
        return base;
      }
    }
  }

  private primary(mode: "atom" | "single-token" = "atom"): string {
    const c = this.peek();
    if (c === "\\") return this.command();
    if (c === "{") {
      this.pos++;
      const inner = this.sequence("brace");
      this.pos++; // the closing }
      return inner;
    }
    if (c === "}") this.fail('it has an unmatched "}"');
    if (c === "&") this.fail("alignment with \"&\" (matrices, aligned environments) is not supported yet");
    if (c === "^" || c === "_") this.fail(`a "${c}" has nothing to attach to`);
    if (/[0-9]/.test(c)) {
      // In script/argument position TeX takes ONE token — a single digit
      // unless braced. $2^10$ is 2¹0 (what the KaTeX preview shows), and
      // \frac12 is ½; consuming the whole run would render 2¹⁰ in the PDF.
      if (mode === "single-token") {
        this.pos++;
        return c;
      }
      const m = /^[0-9]+(?:\.[0-9]+)?/.exec(this.src.slice(this.pos))!;
      this.pos += m[0].length;
      return m[0];
    }
    if (c === '"') {
      this.pos++;
      return '\\"';
    }
    if (c === "~") {
      this.pos++;
      return "space.nobreak";
    }
    if (PASSTHROUGH.has(c) || /[A-Za-z]/.test(c)) {
      this.pos++;
      return c;
    }
    // `#` starts code mode in Typst math (raw parse error at export) and `%`
    // is a LaTeX comment in the KaTeX preview (the PDF would silently print
    // what the preview hides) — both fail here with the escaped form named.
    if (c === "#") this.fail('"#" is not supported in math — write \\# for a literal #');
    if (c === "%") this.fail('"%" starts a LaTeX comment — write \\% for a percent sign');
    // Anything else (typed Unicode like ε or →) passes through to Typst.
    this.pos++;
    return c;
  }

  private command(): string {
    this.pos++; // the backslash
    const c = this.peek();
    if (c === "\\") this.fail('a line break "\\\\" (matrices, multi-line math) is not supported yet');
    if (!/[A-Za-z]/.test(c)) {
      this.pos++;
      const mapped = CHAR_ESCAPES[c];
      if (mapped === undefined) this.fail(`"\\${c}" is not supported`);
      return mapped;
    }
    const m = /^[A-Za-z]+/.exec(this.src.slice(this.pos))!;
    const name = m[0];
    this.pos += name.length;

    const symbol = SYMBOLS[name];
    if (symbol !== undefined) return symbol;
    const wrapper = WRAPPERS[name];
    if (wrapper !== undefined) return `${wrapper}(${this.argument(name)})`;

    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac": {
        const num = this.argument(name);
        const den = this.argument(name);
        return `(${num})/(${den})`;
      }
      case "binom":
        return `binom(${this.argument(name)}, ${this.argument(name)})`;
      case "sqrt": {
        this.skipWhitespace();
        if (this.peek() === "[") {
          this.pos++;
          const index = this.sequenceUntilBracket();
          return `root(${index}, ${this.argument(name)})`;
        }
        return `sqrt(${this.argument(name)})`;
      }
      case "text":
      case "textrm":
      case "textit":
      case "textbf":
      case "mbox":
        return `"${this.rawArgument(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      case "operatorname":
        return `op("${this.rawArgument(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
      case "left": {
        const open = this.delimiter("left");
        const body = this.sequence("right");
        this.pos += "\\right".length;
        const close = this.delimiter("right");
        const inner = [open.trim(), body, close.trim()].filter((p) => p !== "").join(" ");
        return `lr(${inner})`;
      }
      case "right":
        this.fail("it has a \\right without a matching \\left");
        break;
      case "begin":
        this.fail(`the \\begin{${this.rawArgument(name)}} environment is not supported yet`);
        break;
    }
    this.fail(`"\\${name}" is not supported`);
  }

  /** A `\left`/`\right` delimiter: a bracket character, `\{`, `\|`, or `.` (invisible). */
  private delimiter(side: "left" | "right"): string {
    this.skipWhitespace();
    const c = this.peek();
    if (c === ".") {
      this.pos++;
      return "";
    }
    if (c === "\\") {
      this.pos++;
      const escaped = this.peek();
      this.pos++;
      if (escaped === "{" || escaped === "}") return escaped;
      if (escaped === "|") return "parallel";
      if (/[A-Za-z]/.test(escaped)) {
        // \langle, \rangle, \lfloor, …
        const rest = /^[A-Za-z]*/.exec(this.src.slice(this.pos))![0];
        this.pos += rest.length;
        const symbol = SYMBOLS[escaped + rest];
        if (symbol !== undefined) return `${symbol} `;
      }
      this.fail(`the \\${side} delimiter is not supported`);
    }
    if ("()[]|".includes(c)) {
      this.pos++;
      return c;
    }
    this.fail(`the \\${side} delimiter "${c}" is not supported`);
  }

  /** A required `{…}` argument (or a single token), parsed as math. */
  private argument(command: string): string {
    this.skipWhitespace();
    if (this.pos >= this.src.length) this.fail(`\\${command} is missing its argument`);
    return this.primary("single-token");
  }

  /** A required `{…}` argument taken verbatim (for \text{…}). */
  private rawArgument(command: string): string {
    this.skipWhitespace();
    if (this.peek() !== "{") this.fail(`\\${command} needs a {…} argument`);
    let depth = 0;
    for (let i = this.pos + 1; i < this.src.length; i++) {
      const c = this.src[i];
      if (c === "{") depth++;
      else if (c === "}") {
        if (depth === 0) {
          const raw = this.src.slice(this.pos + 1, i);
          this.pos = i + 1;
          return raw;
        }
        depth--;
      }
    }
    this.fail(`\\${command} has an unclosed {…} argument`);
  }

  /** The content of `\sqrt[…]` up to the closing bracket. */
  private sequenceUntilBracket(): string {
    const parts: string[] = [];
    for (;;) {
      this.skipWhitespace();
      if (this.pos >= this.src.length) this.fail('it has an unclosed "[" after \\sqrt');
      if (this.peek() === "]") {
        this.pos++;
        return parts.join(" ");
      }
      const atom = this.atomWithScripts();
      if (atom !== "") parts.push(atom);
    }
  }

  private peek(): string {
    return this.src[this.pos] ?? "";
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) this.pos++;
  }

  private fail(reason: string): never {
    const snippet = this.src.length > 60 ? `${this.src.slice(0, 57)}…` : this.src;
    throw new PaperstackError(
      "math-invalid",
      `A math expression could not be converted: ${reason}. Edit "$${snippet}$" or remove it.`,
      this.src,
    );
  }
}
