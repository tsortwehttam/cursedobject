import { load as parseYaml } from "js-yaml";
import { SerialObject, SerialValue } from "./lib/CoreTypings";
import { castToString, isTruthy, safeGet } from "./lib/EvalCasting";
import { marshallParams, MarshalledParams } from "./lib/ParamsMarshaller";
import { createPRNG } from "./lib/RandHelpers";
import { buildEvalFunctions, createLoadedRunner, evaluateExprCore, Expr, ExprEvalFunc, walkExpr } from "./lib/ScriptEvaluator";
import { createRandFunctions } from "./lib/functions/RandFunctions";
import { readTemplateToken } from "./lib/TemplateHelpers";

type LoadOptions = {
  seed: string | number;
  cycle: number;
  params: Record<string, SerialValue>;
  fn: Record<string, ExprEvalFunc>;
  io: Record<string, YamlchemyIoFunc>;
};

type LocalVars = Record<string, SerialValue>;
type IfBranch = { expr: string | null; body: string; end: number };

export type YamlchemyIoFunc = (params: MarshalledParams, handle: YamlchemyHandle) => Promise<SerialValue> | SerialValue;

export type YamlchemyHandle = {
  calc(path: string): Promise<SerialValue>;
  calcAll(): Promise<SerialObject>;
  evaluate(expr: string): Promise<SerialValue>;
  raw(path: string): SerialValue;
};

const DEFAULT_OPTIONS: LoadOptions = {
  seed: 1,
  cycle: 0,
  params: {},
  fn: {},
  io: {},
};

const VARIATION_DELIMS = ["|", "^", "~"];

export function load(source: string | object, opts: Partial<LoadOptions> = {}): YamlchemyHandle {
  const options: LoadOptions = { ...DEFAULT_OPTIONS, ...opts };
  const parsed = typeof source === "string" ? parseYaml(source) : source;
  const root = toSerialObject(parsed, "$");
  const rng = createPRNG(options.seed, options.cycle);
  const view: SerialObject = cloneSerial(root) as SerialObject;
  const active = new Set<string>();
  const done = new Set<string>();
  const funcs = createBaseFunctionMap(options.fn);
  const runner = createLoadedRunner(rng, {}, funcs);
  const baseFuncs = buildEvalFunctions({ ...createRandFunctions(rng), ...funcs });
  const astCache = new Map<string, Expr | null>();

  function parseCached(expr: string): Expr | null {
    if (astCache.has(expr)) {
      return astCache.get(expr) ?? null;
    }
    const ast = runner.parse(expr);
    astCache.set(expr, ast);
    return ast;
  }

  function mergedVars(vars: LocalVars): SerialObject {
    const out: SerialObject = { ...view };
    overlay(out, options.params);
    overlay(out, vars);
    return out;
  }

  const handle: YamlchemyHandle = {
    calc,
    calcAll,
    evaluate,
    raw,
  };

  async function calc(path: string): Promise<SerialValue> {
    if (path.trim() === "") {
      return calcAll();
    }
    if (!hasPath(root, path)) {
      throw new Error(`Unknown path: ${path}`);
    }
    if (done.has(path)) {
      return safeGet(view, path);
    }
    if (active.has(path)) {
      throw new Error(`Circular calc path: ${path}`);
    }
    active.add(path);
    const value = await calcValue(safeGet(root, path), path, {});
    active.delete(path);
    setViewPath(view, path, value);
    done.add(path);
    return value;
  }

  async function calcAll(): Promise<SerialObject> {
    for (const key of Object.keys(root)) {
      await calc(key);
    }
    return view;
  }

  function raw(path: string): SerialValue {
    if (!hasPath(root, path)) {
      throw new Error(`Unknown path: ${path}`);
    }
    return safeGet(root, path);
  }

  async function evaluate(expr: string): Promise<SerialValue> {
    return evaluateExpr(expr, {});
  }

  async function calcValue(value: SerialValue, path: string, vars: LocalVars): Promise<SerialValue> {
    if (typeof value === "string") {
      const expr = readArrowExpr(value);
      if (expr !== null) {
        return evaluateExpr(expr, vars);
      }
      return renderText(value, vars);
    }
    if (Array.isArray(value)) {
      const out: SerialValue[] = [];
      for (let i = 0; i < value.length; i += 1) {
        out.push(await calcValue(value[i], joinPath(path, String(i)), vars));
      }
      return out;
    }
    if (value !== null && typeof value === "object") {
      const out: SerialObject = {};
      for (const key of Object.keys(value)) {
        out[key] = await calcValue(value[key], joinPath(path, key), vars);
      }
      return out;
    }
    return value;
  }

  async function renderText(text: string, vars: LocalVars): Promise<string> {
    let out = "";
    let loc = 0;
    while (loc < text.length) {
      const directive = text.indexOf("<<#", loc);
      const conditional = text.indexOf("{{#if", loc);
      const next = nextIndex(directive, conditional);
      if (next < 0) {
        out += await renderTemplates(text.slice(loc), vars);
        break;
      }
      out += await renderTemplates(text.slice(loc, next), vars);
      if (next === directive) {
        const result = await renderDirective(text, next, vars);
        out += result.text;
        loc = result.end;
      } else {
        const result = await renderConditional(text, next, vars);
        out += result.text;
        loc = result.end;
      }
    }
    return out;
  }

  async function renderTemplates(text: string, vars: LocalVars): Promise<string> {
    let out = "";
    let loc = 0;
    while (loc < text.length) {
      const start = text.indexOf("{{", loc);
      if (start < 0) {
        out += text.slice(loc);
        break;
      }
      out += text.slice(loc, start);
      const token = readTemplateToken(text, start, "{{", "}}", true);
      if (!token) {
        throw new Error(`Unclosed template at ${start}`);
      }
      out += castToString(await renderTemplateBody(token.body.trim(), vars));
      loc = token.end;
    }
    return out;
  }

  async function renderTemplateBody(body: string, vars: LocalVars): Promise<SerialValue> {
    const variation = splitVariation(body);
    if (variation.length > 0) {
      const choice = rng.randomElement(variation);
      return renderTemplates(choice, vars);
    }
    return evaluateExpr(await renderTemplates(body, vars), vars);
  }

  async function renderDirective(text: string, start: number, vars: LocalVars): Promise<{ text: string; end: number }> {
    const token = readTemplateToken(text, start, "<<", ">>", false, false);
    if (!token) {
      throw new Error(`Unclosed directive at ${start}`);
    }
    const match = token.body.match(/^#([A-Za-z_$][\w$]*)(?::([A-Za-z_$][\w$]*))?(?:\s+([\s\S]*))?$/);
    if (!match) {
      throw new Error(`Invalid directive: ${token.raw}`);
    }
    const name = match[1];
    const binding = match[2] ?? "";
    const args = await renderTemplates(match[3] ?? "", vars);
    const fn = options.io[name];
    if (!fn) {
      throw new Error(`Unknown io directive: ${name}`);
    }
    const params = marshallParams(args, (expr) => evalParam(expr, vars));
    const value = await fn(params, handle);
    if (binding) {
      vars[binding] = value;
      return { text: "", end: token.end };
    }
    return { text: castToString(value), end: token.end };
  }

  async function renderConditional(text: string, start: number, vars: LocalVars): Promise<{ text: string; end: number }> {
    const block = readIfTemplateBlock(text, start);
    const branches = block.branches;
    for (const branch of branches) {
      if (branch.expr === null || isTruthy(await evaluateExpr(branch.expr, vars))) {
        return { text: await renderText(branch.body, vars), end: block.end };
      }
    }
    return { text: "", end: block.end };
  }

  async function evaluateExpr(expr: string, vars: LocalVars): Promise<SerialValue> {
    if (expr.trim() === "") {
      return runner.evaluate(expr);
    }
    const ast = parseCached(expr);
    if (!ast) {
      throw new Error(`Invalid expression: ${expr}`);
    }
    await calcDependencies(ast, vars);
    const all = mergedVars(vars);
    assertKnownVars(ast, all, expr);
    return evaluateExprCore(ast, all, { ...baseFuncs, ...createPathFunctionMap(all) });
  }

  async function calcDependencies(ast: Expr, vars: LocalVars): Promise<void> {
    const deps = new Set<string>();
    walkExpr(ast, (node) => {
      if ("var" in node && !hasPath(vars, node.var) && hasPath(root, node.var)) {
        deps.add(node.var);
      }
      if ("op" in node && node.op === "get") {
        const path = readLiteralPath(node);
        if (path && hasPath(root, path)) {
          deps.add(path);
        }
      }
      if ("op" in node && node.op === "select") {
        const pattern = readLiteralPath(node);
        if (pattern) {
          for (const path of matchPaths(root, pattern)) {
            deps.add(path);
          }
        }
      }
    });
    for (const dep of deps) {
      await calc(dep);
    }
  }

  function evalParam(expr: string, vars: LocalVars): SerialValue {
    const ast = parseCached(expr);
    const all = mergedVars(vars);
    if (!ast || !hasKnownVars(ast, all)) {
      return null;
    }
    return evaluateExprCore(ast, all, { ...baseFuncs, ...createPathFunctionMap(all) });
  }

  function assertKnownVars(ast: Expr, vars: SerialObject, expr: string): void {
    walkExpr(ast, (node) => {
      if ("var" in node && !hasPath(vars, node.var)) {
        throw new Error(`Unknown variable '${node.var}' in expression: ${expr}`);
      }
    });
  }

  function hasKnownVars(ast: Expr, vars: SerialObject): boolean {
    let ok = true;
    walkExpr(ast, (node) => {
      if ("var" in node && !hasPath(vars, node.var)) {
        ok = false;
      }
    });
    return ok;
  }

  return handle;
}

function createBaseFunctionMap(funcs: Record<string, ExprEvalFunc>): Record<string, ExprEvalFunc> {
  return {
    first: (value) => (Array.isArray(value) ? (value[0] ?? null) : null),
    last: (value) => (Array.isArray(value) ? (value[value.length - 1] ?? null) : null),
    ...funcs,
  };
}

function createPathFunctionMap(vars: SerialObject): Record<string, ExprEvalFunc> {
  return {
    get: (path) => {
      if (typeof path !== "string") {
        return null;
      }
      return hasPath(vars, path) ? safeGet(vars, path) : null;
    },
    select: (pattern) => {
      if (typeof pattern !== "string") {
        return [];
      }
      return matchPaths(vars, pattern).map((path) => safeGet(vars, path));
    },
  };
}

function readLiteralPath(node: Expr): string | null {
  if (!("args" in node)) {
    return null;
  }
  const first = node.args[0];
  if (!first || !("lit" in first) || typeof first.lit !== "string") {
    return null;
  }
  return first.lit;
}

function toSerialObject(value: unknown, path: string): SerialObject {
  const serial = toSerialValue(value, path);
  if (serial === null || typeof serial !== "object" || Array.isArray(serial)) {
    throw new Error("Yamlchemy root must be a YAML object");
  }
  return serial;
}

function toSerialValue(value: unknown, path: string): SerialValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid number at ${path}`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const out: SerialValue[] = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(toSerialValue(value[i], joinPath(path, String(i))));
    }
    return out;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: SerialObject = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = toSerialValue(val, joinPath(path, key));
    }
    return out;
  }
  throw new Error(`Unsupported YAML value at ${path}`);
}

function readArrowExpr(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("->")) {
    return null;
  }
  return trimmed.slice(2).trim();
}

function readIfTemplateBlock(text: string, start: number): { branches: IfBranch[]; end: number } {
  const first = readTemplateToken(text, start, "{{", "}}", true);
  if (!first) {
    throw new Error(`Unclosed if block at ${start}`);
  }
  const head = first.body.trim();
  if (!head.startsWith("#if ")) {
    throw new Error(`Invalid if block at ${start}`);
  }
  const branches: IfBranch[] = [];
  let expr: string | null = head.slice(4).trim();
  let bodyStart = first.end;
  let depth = 0;
  let loc = first.end;
  while (loc < text.length) {
    const next = text.indexOf("{{", loc);
    if (next < 0) {
      break;
    }
    const token = readTemplateToken(text, next, "{{", "}}", true);
    if (!token) {
      throw new Error(`Unclosed template at ${next}`);
    }
    const marker = token.body.trim();
    if (marker.startsWith("#if ")) {
      depth += 1;
      loc = token.end;
      continue;
    }
    if (marker === "/if") {
      if (depth > 0) {
        depth -= 1;
        loc = token.end;
        continue;
      }
      branches.push({ expr, body: text.slice(bodyStart, next), end: token.end });
      return { branches, end: token.end };
    }
    if (depth === 0 && marker.startsWith("elseif ")) {
      branches.push({ expr, body: text.slice(bodyStart, next), end: token.end });
      expr = marker.slice("elseif ".length).trim();
      bodyStart = token.end;
      loc = token.end;
      continue;
    }
    if (depth === 0 && marker === "else") {
      branches.push({ expr, body: text.slice(bodyStart, next), end: token.end });
      expr = null;
      bodyStart = token.end;
      loc = token.end;
      continue;
    }
    loc = token.end;
  }
  throw new Error(`Missing {{/if}} for if block at ${start}`);
}

function splitVariation(body: string): string[] {
  for (const delim of VARIATION_DELIMS) {
    const parts = splitTopLevel(body, delim);
    if (parts.length > 1 && parts.every(looksLikeVariationPart)) {
      return parts;
    }
  }
  return [];
}

function splitTopLevel(text: string, delim: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && ch === delim) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

function looksLikeVariationPart(part: string): boolean {
  if (!part) {
    return false;
  }
  if (part.includes("{{") || part.includes("}}")) {
    return true;
  }
  return !/[()+*/<>=?:,;[\]{}]/.test(part);
}

function setViewPath(root: SerialObject, path: string, value: SerialValue): void {
  const parts = path.split(".");
  let cur: SerialValue = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    if (cur === null || typeof cur !== "object") return;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return;
      cur = cur[idx] ?? null;
      continue;
    }
    cur = cur[part] ?? null;
  }
  const last = parts[parts.length - 1]!;
  if (cur === null || typeof cur !== "object") return;
  if (Array.isArray(cur)) {
    const idx = Number(last);
    if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return;
    cur[idx] = value;
    return;
  }
  cur[last] = value;
}

function overlay(target: SerialObject, source: Record<string, SerialValue>): void {
  for (const key of Object.keys(source)) {
    const a = target[key];
    const b = source[key];
    if (isPlainObj(a) && isPlainObj(b)) {
      const merged: SerialObject = { ...a };
      overlay(merged, b);
      target[key] = merged;
      continue;
    }
    target[key] = b;
  }
}

function isPlainObj(value: SerialValue | undefined): value is SerialObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function cloneSerial(value: SerialValue): SerialValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const out: SerialValue[] = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(cloneSerial(value[i] ?? null));
    }
    return out;
  }
  const out: SerialObject = {};
  for (const key of Object.keys(value)) {
    out[key] = cloneSerial(value[key] ?? null);
  }
  return out;
}

function hasPath(root: Record<string, SerialValue>, path: string): boolean {
  if (path.trim() === "") {
    return true;
  }
  const parts = path.split(".");
  let cur: SerialValue | Record<string, SerialValue> = root;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") {
      return false;
    }
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        return false;
      }
      cur = cur[idx];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, part)) {
      return false;
    }
    cur = cur[part];
  }
  return true;
}

function matchPaths(root: SerialObject, pattern: string): string[] {
  if (pattern.trim() === "") {
    return [];
  }
  const out: string[] = [];
  walkPath(root, pattern.split("."), [], out);
  return out;
}

function walkPath(value: SerialValue, parts: string[], path: string[], out: string[]): void {
  if (parts.length === 0) {
    out.push(path.join("."));
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  const [part, ...rest] = parts;
  if (part === "*") {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        walkPath(value[i], rest, [...path, String(i)], out);
      }
      return;
    }
    for (const key of Object.keys(value)) {
      walkPath(value[key], rest, [...path, key], out);
    }
    return;
  }
  if (Array.isArray(value)) {
    const idx = Number(part);
    if (!Number.isInteger(idx) || idx < 0 || idx >= value.length) {
      return;
    }
    walkPath(value[idx], rest, [...path, part], out);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(value, part)) {
    return;
  }
  walkPath(value[part], rest, [...path, part], out);
}

function joinPath(base: string, part: string): string {
  if (base === "$") {
    return part;
  }
  if (!base) {
    return part;
  }
  return `${base}.${part}`;
}

function nextIndex(a: number, b: number): number {
  if (a < 0) {
    return b;
  }
  if (b < 0) {
    return a;
  }
  return Math.min(a, b);
}
