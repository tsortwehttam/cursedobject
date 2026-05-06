import { SerialValue } from "./CoreTypings";
import { castToNumber, isTruthy, isValidKey, safeGet, TVars } from "./EvalCasting";
import { parseNumberOrNull } from "./MathHelpers";
import { PRNG } from "./RandHelpers";
import { isBlank } from "./TextHelpers";
import { LexerToken, tokenize } from "./TokenizerLexer";
import { arrayFunctions } from "./functions/ArrayFunctions";
import { dateFunctions } from "./functions/DateFunctions";
import { mathFunctions } from "./functions/MathFunctions";
import { createRandFunctions } from "./functions/RandFunctions";
import { stringFunctions } from "./functions/StringFunctions";
import { unifiedFunctions } from "./functions/UnifiedFunctions";

const BASELIB: Record<string, ExprEvalFunc> = {
  // typeof()
};
for (const key in arrayFunctions) {
  BASELIB[key] = arrayFunctions[key];
}
for (const key in stringFunctions) {
  BASELIB[key] = stringFunctions[key];
}
for (const key in unifiedFunctions) {
  BASELIB[key] = unifiedFunctions[key];
}
for (const key in mathFunctions) {
  BASELIB[key] = mathFunctions[key];
}
for (const key in dateFunctions) {
  BASELIB[key] = dateFunctions[key];
}

export function buildEvalFunctions(extras: Record<string, ExprEvalFunc> = {}) {
  const out: Record<string, ExprEvalFunc> = { ...BASELIB };
  for (const key in extras) {
    out[key] = extras[key];
  }
  return out;
}

export type ExprEvalFunc = (...args: SerialValue[]) => SerialValue;

export type Expr = { op: string; args: Expr[] } | { var: string } | { lit: SerialValue };

export function walkExpr(node: Expr, visit: (expr: Expr) => void) {
  visit(node);
  if ("args" in node) {
    for (const arg of node.args) {
      walkExpr(arg, visit);
    }
  }
}

type OpInfo = { prec: number; assoc: "left" | "right"; alias: string };

const BINOP_PREC: Record<string, OpInfo> = {
  "??": { prec: 2, assoc: "left", alias: "nullCoalesce" },
  "||": { prec: 3, assoc: "left", alias: "or" },
  "&&": { prec: 4, assoc: "left", alias: "and" },
  "|": { prec: 5, assoc: "left", alias: "bitwiseOr" },
  "^": { prec: 6, assoc: "left", alias: "bitwiseXor" },
  "&": { prec: 7, assoc: "left", alias: "bitwiseAnd" },
  "===": { prec: 8, assoc: "left", alias: "eq" },
  "!==": { prec: 8, assoc: "left", alias: "neq" },
  "==": { prec: 8, assoc: "left", alias: "eq" },
  "!=": { prec: 8, assoc: "left", alias: "neq" },
  "<": { prec: 9, assoc: "left", alias: "lt" },
  ">": { prec: 9, assoc: "left", alias: "gt" },
  "<=": { prec: 9, assoc: "left", alias: "lte" },
  ">=": { prec: 9, assoc: "left", alias: "gte" },
  "+": { prec: 11, assoc: "left", alias: "add" },
  "-": { prec: 11, assoc: "left", alias: "sub" },
  "*": { prec: 12, assoc: "left", alias: "mul" },
  "/": { prec: 12, assoc: "left", alias: "div" },
  "%": { prec: 12, assoc: "left", alias: "mod" },
  "**": { prec: 13, assoc: "right", alias: "pow" },
};

const KEYWORD_OPS: Record<string, OpInfo> = {
  has: { prec: 9, assoc: "left", alias: "has" },
  hasnt: { prec: 9, assoc: "left", alias: "hasnt" },
};

const UNOP_ALIAS: Record<string, string> = {
  "+": "toNumber",
  "-": "negate",
  "~": "bitwiseNot",
  "!": "not",
};

const UNARY_PREC = 14;
const TERNARY_PREC = 1;

export function parseExprCore(expr: string): Expr | null {
  const tokens = tokenize(expr).filter((t) => t.type !== "SPC");
  if (tokens.length === 0) return { lit: null };

  let pos = 0;
  let steps = tokens.length * 4 + 8;
  const peek = (offset = 0): LexerToken | undefined => tokens[pos + offset];
  const advance = () => tokens[pos++];
  const guard = () => {
    steps -= 1;
    return steps >= 0;
  };

  function peekOp(): string | null {
    const t0 = peek();
    if (!t0) return null;
    if (t0.type === "WRD" && KEYWORD_OPS[t0.value]) return t0.value;
    if (t0.type !== "PCT") return null;
    const t1 = peek(1);
    const c0 = t0.value;
    const c1 = t1?.type === "PCT" ? t1.value : "";
    const t2 = c1 ? peek(2) : undefined;
    const c2 = t2?.type === "PCT" ? t2.value : "";
    const tri = c0 + c1 + c2;
    const bi = c0 + c1;
    if (BINOP_PREC[tri]) return tri;
    if (BINOP_PREC[bi]) return bi;
    if (BINOP_PREC[c0]) return c0;
    return null;
  }

  function consumeOp(op: string) {
    if (KEYWORD_OPS[op]) {
      advance(); // Single WRD token
    } else {
      for (let i = 0; i < op.length; i++) advance();
    }
  }

  function expect(val: string) {
    const t = advance();
    return !!t && t.value === val;
  }

  function parseExpr(minPrec: number): Expr | null {
    if (!guard()) return null;
    let left = parsePrefix();
    if (!left) return null;

    while (true) {
      if (!guard()) return null;
      const op = peekOp();

      if (op) {
        const info = BINOP_PREC[op] ?? KEYWORD_OPS[op];
        if (!info || info.prec < minPrec) break;
        consumeOp(op);
        const startPos = pos;
        const nextPrec = info.assoc === "right" ? info.prec : info.prec + 1;
        const right = parseExpr(nextPrec);
        if (!right || pos === startPos) return null;
        left = { op: info.alias, args: [left, right] };
        continue;
      }

      const t = peek();
      if (t?.type === "PCT" && t.value === "?") {
        if (TERNARY_PREC < minPrec) break;
        advance();
        const then = parseExpr(0);
        if (!then) return null;
        if (!expect(":")) return null;
        const els = parseExpr(TERNARY_PREC);
        if (!els) return null;
        left = { op: "ternary", args: [left, then, els] };
        continue;
      }

      break;
    }

    return left;
  }

  function parsePrefix(): Expr | null {
    if (!guard()) return null;
    const tok = peek();
    if (!tok) return null;

    if (tok.type === "PCT") {
      const alias = UNOP_ALIAS[tok.value];
      if (alias) {
        advance();
        const value = parseExpr(UNARY_PREC);
        if (!value) return null;
        return parsePostfix({ op: alias, args: [value] });
      }

      if (tok.value === "(") {
        advance();
        const inner = parseExpr(0);
        if (!inner) return null;
        if (!expect(")")) return null;
        return parsePostfix(inner);
      }

      if (tok.value === "[") {
        advance();
        const args: Expr[] = [];
        while (peek() && peek()?.value !== "]") {
          const value = parseExpr(0);
          if (!value) return null;
          args.push(value);
          if (peek()?.value === ",") advance();
          else if (peek()?.value !== "]") return null;
        }
        if (!expect("]")) return null;
        return parsePostfix({ op: "array", args });
      }

      if (tok.value === "{") {
        advance();
        const args: Expr[] = [];
        while (peek() && peek()?.value !== "}") {
          const keyTok = advance();
          if (!keyTok) return null;
          const key = keyTok.value;
          if (!expect(":")) return null;
          const valExpr = parseExpr(0);
          if (!valExpr) return null;
          args.push({ lit: key }, valExpr);
          if (peek()?.value === ",") advance();
          else if (peek()?.value !== "}") return null;
        }
        if (!expect("}")) return null;
        return parsePostfix({ op: "object", args });
      }

      return null;
    }

    if (tok.type === "NUM") {
      advance();
      return parsePostfix({ lit: Number(tok.value) });
    }

    if (tok.type === "QUO") {
      advance();
      return parsePostfix({ lit: tok.value });
    }

    if (tok.type === "WRD") {
      const val = tok.value;
      const lower = val.toLowerCase();
      if (lower === "true") {
        advance();
        return { lit: true };
      }
      if (lower === "false") {
        advance();
        return { lit: false };
      }
      if (lower === "null") {
        advance();
        return { lit: null };
      }
      if (lower === "undefined") {
        advance();
        return { lit: null };
      }

      advance();
      if (peek()?.value === "(") {
        advance();
        const args: Expr[] = [];
        while (peek() && peek()?.value !== ")") {
          const value = parseExpr(0);
          if (!value) return null;
          args.push(value);
          if (peek()?.value === ",") advance();
          else if (peek()?.value !== ")") return null;
        }
        if (!expect(")")) return null;
        return parsePostfix({ op: val, args });
      }

      return parsePostfix({ var: val });
    }

    return null;
  }

  function parsePostfix(base: Expr): Expr | null {
    let left = base;
    while (true) {
      const tok = peek();
      if (tok?.type === "PCT" && tok.value === "[") {
        advance();
        const key = parseExpr(0);
        if (!key) return null;
        if (!expect("]")) return null;
        left = { op: "index", args: [left, key] };
        continue;
      }
      if (tok?.type === "PCT" && tok.value === ".") {
        advance();
        const key = advance();
        if (key?.type !== "WRD") return null;
        left = { op: "member", args: [left, { lit: key.value }] };
        continue;
      }
      break;
    }
    return left;
  }

  const result = parseExpr(0);
  if (!result) return null;
  return pos === tokens.length ? result : null;
}

export function evaluateExprCore(ast: Expr, vars: TVars, funcs: Record<string, ExprEvalFunc>): SerialValue {
  const lib = { ...STDLIB, ...funcs };

  function eval_(node: Expr): SerialValue {
    if ("lit" in node) return node.lit;
    if ("var" in node) return safeGet(vars, node.var);

    const { op, args } = node;

    if (op === "ternary") {
      return isTruthy(eval_(args[0])) ? eval_(args[1]) : eval_(args[2]);
    }
    if (op === "and") {
      const left = eval_(args[0]);
      return isTruthy(left) ? eval_(args[1]) : left;
    }
    if (op === "or") {
      const left = eval_(args[0]);
      return isTruthy(left) ? left : eval_(args[1]);
    }
    if (op === "nullCoalesce") {
      const left = eval_(args[0]);
      return left ?? eval_(args[1]);
    }
    if (op === "array") {
      return args.map(eval_);
    }
    if (op === "object") {
      const result: Record<string, SerialValue> = {};
      for (let i = 0; i < args.length; i += 2) {
        const key = eval_(args[i]);
        const val = eval_(args[i + 1]);
        if (typeof key === "string") result[key] = val;
      }
      return result;
    }
    if (op === "member" || op === "index") {
      return readMember(eval_(args[0]), eval_(args[1]));
    }

    const fn = lib[op];
    if (!fn) throw new Error(`Unknown function: ${op}`);
    return fn(...args.map(eval_));
  }

  return eval_(ast);
}

const n = castToNumber;

const STDLIB: Record<string, ExprEvalFunc> = {
  add: (a, b) => n(a) + n(b),
  sub: (a, b) => n(a) - n(b),
  mul: (a, b) => n(a) * n(b),
  div: (a, b) => n(a) / n(b),
  mod: (a, b) => n(a) % n(b),
  pow: (a, b) => n(a) ** n(b),
  negate: (a) => -n(a),
  toNumber: (a) => n(a),
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  lt: (a, b) => n(a) < n(b),
  gt: (a, b) => n(a) > n(b),
  lte: (a, b) => n(a) <= n(b),
  gte: (a, b) => n(a) >= n(b),
  not: (a) => !isTruthy(a),
  bitwiseAnd: (a, b) => n(a) & n(b),
  bitwiseOr: (a, b) => n(a) | n(b),
  bitwiseXor: (a, b) => n(a) ^ n(b),
  bitwiseNot: (a) => ~n(a),
  bitwiseLeftShift: (a, b) => n(a) << n(b),
  bitwiseRightShift: (a, b) => n(a) >> n(b),
  bitwiseRightShiftUnsigned: (a, b) => n(a) >>> n(b),
  has: (a, b) => {
    if (Array.isArray(a)) return a.some((item) => item === b);
    if (typeof a === "string" && typeof b === "string") return a.includes(b);
    return false;
  },
  hasnt: (a, b) => {
    if (Array.isArray(a)) return !a.some((item) => item === b);
    if (typeof a === "string" && typeof b === "string") return !a.includes(b);
    return true;
  },
  // Special ops handled directly in evaluateExprCore but need to be known for validation
  ternary: () => null,
  and: () => null,
  or: () => null,
  nullCoalesce: () => null,
  array: () => null,
  object: () => null,
  member: () => null,
  index: () => null,
};

function readMember(value: SerialValue, key: SerialValue): SerialValue {
  if (value === null || value === undefined) return null;
  if (typeof key !== "string" && typeof key !== "number") return null;
  const name = String(key);
  if (!isValidKey(name)) return null;
  if (Array.isArray(value)) {
    const idx = Number.parseInt(name, 10);
    if (Number.isNaN(idx)) return null;
    return value[idx] ?? null;
  }
  if (typeof value !== "object") return null;
  return Object.prototype.hasOwnProperty.call(value, name) ? value[name] ?? null : null;
}

export type ExprError = {
  type: "op-undefined" | "var-undefined";
  name: string;
};

export function createLoadedRunner(
  rng: PRNG,
  outerVars: Record<string, SerialValue> = {},
  outerFuncs: Record<string, ExprEvalFunc> = {},
) {
  const baseFunctions = buildEvalFunctions({
    ...createRandFunctions(rng),
    ...outerFuncs,
  });
  function parse(expr: string) {
    return parseExprCore(expr);
  }
  function validate(
    expr: string,
    innerVars: Record<string, SerialValue> = {},
    innerFuncs: Record<string, ExprEvalFunc> = {},
    errors: ExprError[] = [],
  ) {
    const allVars = { ...outerVars, ...innerVars };
    const allFuncs = { ...STDLIB, ...baseFunctions, ...innerFuncs };
    const ast = parse(expr);
    if (!ast) return errors;
    walkExpr(ast, (node) => {
      if ("op" in node) {
        if (!allFuncs[node.op]) {
          errors.push({ type: "op-undefined", name: node.op });
        }
      } else if ("var" in node) {
        const base = node.var.split(".")[0] ?? node.var;
        const hasVar =
          Object.prototype.hasOwnProperty.call(allVars, node.var) ||
          Object.prototype.hasOwnProperty.call(allVars, base);
        if (!hasVar) {
          errors.push({ type: "var-undefined", name: node.var });
        }
      }
    });
    return errors;
  }
  const evaluate = (
    expr: string,
    innerVars: Record<string, SerialValue> = {},
    innerFuncs: Record<string, ExprEvalFunc> = {},
  ) => {
    // Fast paths
    if (isBlank(expr)) return expr; // because empty string yields 0 when put into Number
    if (expr === "false") return false;
    if (expr === "true") return true;
    if (expr === "null" || expr === "undefined") return null;
    const non = parseNumberOrNull(expr);
    if (non !== null) return non;

    const allVars = { ...outerVars, ...innerVars };
    const allFuncs = { ...baseFunctions, ...innerFuncs };
    const ast = parse(expr);
    if (!ast) return null;
    return evaluateExprCore(ast, allVars, allFuncs);
  };
  return {
    parse,
    validate,
    evaluate,
  };
}
