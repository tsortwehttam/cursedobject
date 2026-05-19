import { load as parseYaml } from "js-yaml";
import { SerialObject, SerialValue } from "./lib/CoreTypings";
import { castToString, isTruthy, isValidKey, safeGet } from "./lib/EvalCasting";
import { marshallParams, MarshalledParams } from "./lib/ParamsMarshaller";
import { createPRNG } from "./lib/RandHelpers";
import { buildEvalFunctions, createLoadedRunner, evaluateExprCore, Expr, ExprEvalFunc, walkExpr } from "./lib/ScriptEvaluator";
import { createRandFunctions } from "./lib/functions/RandFunctions";
import { readTemplateToken } from "./lib/TemplateHelpers";

export type YamlchemySource = string | SerialObject;

export type LoadOptions = {
  seed: string | number;
  cycle: number;
  params: Record<string, SerialValue>;
  fn: Record<string, ExprEvalFunc>;
  io: Record<string, YamlchemyIoFunc>;
};

type LocalVars = Record<string, SerialValue>;
type IfBranch = { expr: string | null; body: string; end: number };

export type UpdatePatchValue = SerialValue | UpdatePatch;
export type UpdatePatch = { [key: string]: UpdatePatchValue };
export type UpdateOptions = { create: boolean };

export type YamlchemyIoFunc = (params: MarshalledParams, handle: YamlchemyHandle) => Promise<SerialValue> | SerialValue;

export type YamlchemyHandle = {
  has(path: string): boolean;
  calc: {
    (path: string): Promise<SerialValue>;
    (path: string, vars: Record<string, SerialValue>): Promise<SerialValue>;
  };
  calcAll: {
    (): Promise<SerialObject>;
    (vars: Record<string, SerialValue>): Promise<SerialObject>;
  };
  evaluate: {
    (expr: string): Promise<SerialValue>;
    (expr: string, vars: Record<string, SerialValue>): Promise<SerialValue>;
  };
  raw(path: string): SerialValue;
  update: {
    (patch: UpdatePatch): Promise<void>;
    (patch: UpdatePatch, vars: Record<string, SerialValue>): Promise<void>;
    (patch: UpdatePatch, vars: Record<string, SerialValue>, opts: Partial<UpdateOptions>): Promise<void>;
  };
  clear(): void;
  fork: {
    (): YamlchemyHandle;
    (opts: Partial<LoadOptions>): YamlchemyHandle;
  };
};

const DEFAULT_OPTIONS: LoadOptions = {
  seed: 1,
  cycle: 0,
  params: {},
  fn: {},
  io: {},
};

const VARIATION_MARKERS = new Set(["~", "&", "!"]);

type VariationKind = "sequence" | "cycle" | "random" | "once";

function variationKind(marker: string): VariationKind {
  if (marker === "&") return "cycle";
  if (marker === "~") return "random";
  if (marker === "!") return "once";
  return "sequence";
}

export function load(source: YamlchemySource, opts: Partial<LoadOptions> = {}): YamlchemyHandle {
  const options: LoadOptions = { ...DEFAULT_OPTIONS, ...opts };
  const parsed = typeof source === "string" ? parseYaml(source) : source;
  const root = toSerialObject(parsed, "$");
  const rng = createPRNG(options.seed, options.cycle);
  const state: SerialObject = cloneSerial(root) as SerialObject;
  const view: SerialObject = cloneSerial(root) as SerialObject;
  const active = new Set<string>();
  const funcs = createBaseFunctionMap(options.fn);
  const runner = createLoadedRunner(rng, {}, funcs);
  const baseFuncs = buildEvalFunctions({ ...createRandFunctions(rng), ...funcs });
  const astCache = new Map<string, Expr | null>();
  const cycleCounters = new Map<string, number>();

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
    has,
    calc,
    calcAll,
    evaluate,
    raw,
    update,
    clear,
    fork,
  };

  function has(path: string): boolean {
    return hasPath(state, path);
  }

  async function calc(path: string, vars: LocalVars = {}): Promise<SerialValue> {
    if (path.trim() === "") {
      return calcAll(vars);
    }
    if (!hasPath(state, path)) {
      throw new Error(`Unknown path: ${path}`);
    }
    if (active.has(path)) {
      throw new Error(`Circular calc path: ${path}`);
    }
    active.add(path);
    const value = await calcValue(safeGet(state, path), path, vars);
    active.delete(path);
    setViewPath(view, path, value);
    return value;
  }

  async function calcAll(vars: LocalVars = {}): Promise<SerialObject> {
    for (const key of Object.keys(state)) {
      await calc(key, vars);
    }
    return view;
  }

  function raw(path: string): SerialValue {
    if (!hasPath(root, path)) {
      throw new Error(`Unknown path: ${path}`);
    }
    return safeGet(root, path);
  }

  async function evaluate(expr: string, vars: LocalVars = {}): Promise<SerialValue> {
    return evaluateExpr(expr, vars);
  }

  async function update(patch: UpdatePatch, vars: LocalVars = {}, opts: Partial<UpdateOptions> = {}): Promise<void> {
    const create = opts.create ?? true;
    const entries = flattenPatch(patch);
    type Pending = { path: string; rhs: SerialValue; cur: SerialValue; append: boolean };
    const pending: Pending[] = [];
    for (const [keyTpl, rhs] of entries) {
      const keyPath = await renderText(keyTpl, vars);
      const op = parseUpdatePath(keyPath);
      if (!isValidPath(op.path)) {
        throw new Error(`Invalid update path: ${op.path}`);
      }
      const targets = op.path.includes("*") ? matchPaths(state, op.path) : [op.path];
      if (targets.length === 0 && op.path.includes("*")) {
        continue;
      }
      for (const path of targets) {
        const exists = hasPath(state, path);
        if (!exists && !create) {
          throw new Error(`Unknown update path: ${path}`);
        }
        pending.push({ path, rhs, cur: exists ? await calc(path, vars) : null, append: op.append });
      }
    }
    for (const { path, rhs, cur, append } of pending) {
      const val = await evalUpdateValue(rhs, { ...vars, this: cur });
      const next = calcPatchValue(cur, val, append);
      if (create && !hasPath(state, path)) {
        ensureViewPath(state, path);
        ensureViewPath(view, path);
      }
      setViewPath(state, path, next);
      setViewPath(view, path, next);
    }
  }

  async function evalUpdateValue(rhs: SerialValue, vars: LocalVars): Promise<SerialValue> {
    if (typeof rhs !== "string") {
      return rhs;
    }
    if (isPlainString(rhs)) {
      return rhs;
    }
    const expr = readArrowExpr(rhs);
    if (expr !== null) {
      const rendered = expr.indexOf("{{") >= 0 ? await renderTemplates(expr, vars) : expr;
      return evaluateExpr(rendered, vars);
    }
    return renderText(rhs, vars);
  }

  function clear(): void {
    resetObject(state, cloneSerial(root) as SerialObject);
    resetObject(view, cloneSerial(root) as SerialObject);
  }

  function fork(next: Partial<LoadOptions> = {}): YamlchemyHandle {
    return load(source, {
      ...options,
      ...next,
      params: { ...options.params, ...(next.params ?? {}) },
      fn: { ...options.fn, ...(next.fn ?? {}) },
      io: { ...options.io, ...(next.io ?? {}) },
    });
  }

  async function calcValue(value: SerialValue, path: string, vars: LocalVars): Promise<SerialValue> {
    if (typeof value === "function") {
      return calcValue(await value(), path, vars);
    }
    if (typeof value === "string") {
      if (isPlainString(value)) {
        return value;
      }
      const expr = readArrowExpr(value);
      if (expr !== null) {
        const rendered = expr.indexOf("{{") >= 0 ? await renderTemplates(expr, vars) : expr;
        return evaluateExpr(rendered, vars);
      }
      const lone = await tryLoneDirective(value, vars);
      if (lone.hit) return lone.value;
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
      const directive = findDirectiveStart(text, loc);
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
    if (variation.parts.length > 0) {
      const choice = pickVariation(body, variation.parts, variation.kind);
      if (choice === null) return "";
      return renderTemplates(choice, vars);
    }
    return evaluateExpr(await renderTemplates(body, vars), vars);
  }

  function pickVariation(key: string, parts: string[], kind: VariationKind): string | null {
    if (kind === "random") return rng.randomElement(parts);
    const idx = cycleCounters.get(key) ?? 0;
    cycleCounters.set(key, idx + 1);
    if (kind === "cycle") return parts[idx % parts.length] ?? null;
    if (kind === "once") return idx < parts.length ? parts[idx] ?? null : null;
    return parts[Math.min(idx, parts.length - 1)] ?? null;
  }

  async function executeDirective(text: string, start: number, vars: LocalVars): Promise<{ value: SerialValue; binding: string; end: number }> {
    const token = readTemplateToken(text, start, "<<", ">>", false, false);
    if (!token) {
      throw new Error(`Unclosed directive at ${start}`);
    }
    const match = token.body.match(/^#?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?::([A-Za-z_$][\w$]*))?(?:\s+([\s\S]*))?$/);
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
    return { value, binding, end: token.end };
  }

  async function renderDirective(text: string, start: number, vars: LocalVars): Promise<{ text: string; end: number }> {
    const r = await executeDirective(text, start, vars);
    if (r.binding) {
      vars[r.binding] = r.value;
      return { text: "", end: r.end };
    }
    return { text: castToString(r.value), end: r.end };
  }

  async function tryLoneDirective(value: string, vars: LocalVars): Promise<{ hit: boolean; value: SerialValue }> {
    const trimmed = value.trim();
    if (!trimmed.startsWith("<<")) return { hit: false, value: null };
    if (findDirectiveStart(trimmed, 0) !== 0) return { hit: false, value: null };
    const token = readTemplateToken(trimmed, 0, "<<", ">>", false, false);
    if (!token || token.end !== trimmed.length) return { hit: false, value: null };
    const r = await executeDirective(trimmed, 0, vars);
    if (r.binding) return { hit: false, value: null };
    return { hit: true, value: r.value };
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
    return evaluateExprCore(ast, all, { ...baseFuncs, ...createPathFunctionMap(all) });
  }

  async function calcDependencies(ast: Expr, vars: LocalVars): Promise<void> {
    const deps = new Set<string>();
    walkExpr(ast, (node) => {
      if ("var" in node && !hasPath(vars, node.var) && hasPath(state, node.var)) {
        deps.add(node.var);
      }
      if ("op" in node && node.op === "get") {
        const path = readLiteralPath(node);
        if (path && hasPath(state, path)) {
          deps.add(path);
        }
      }
      if ("op" in node && node.op === "select") {
        const pattern = readLiteralPath(node);
        if (pattern) {
          for (const path of matchPaths(state, pattern)) {
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

export async function evaluate(expr: string, opts: Partial<LoadOptions> = {}): Promise<SerialValue> {
  return load({}, opts).evaluate(expr);
}

export async function render(template: string, opts: Partial<LoadOptions> = {}): Promise<SerialValue> {
  return load({ _v: template }, opts).calc("_v");
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
  if (typeof value === "function") {
    return value as SerialValue;
  }
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
      if (!isValidKey(key)) {
        throw new Error(`Invalid key at ${path}: ${key}`);
      }
      out[key] = toSerialValue(val, joinPath(path, key));
    }
    return out;
  }
  throw new Error(`Unsupported YAML value at ${path}`);
}

function findDirectiveStart(text: string, from: number): number {
  let loc = from;
  while (loc < text.length) {
    const idx = text.indexOf("<<", loc);
    if (idx < 0) return -1;
    const after = idx + 2;
    const ch = text.charCodeAt(after);
    if (ch === 35) return idx;
    if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 95 || ch === 36) return idx;
    loc = after;
  }
  return -1;
}

function isPlainString(value: string): boolean {
  if (value.length < 4) {
    return true;
  }
  if (value.indexOf("{{") >= 0) return false;
  if (findDirectiveStart(value, 0) >= 0) return false;
  let i = 0;
  while (i < value.length) {
    const ch = value.charCodeAt(i);
    if (ch !== 32 && ch !== 9 && ch !== 10 && ch !== 13) break;
    i += 1;
  }
  if (value.charCodeAt(i) === 45 && value.charCodeAt(i + 1) === 62) return false;
  return true;
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

function splitVariation(body: string): { parts: string[]; kind: VariationKind } {
  const marker = body[0] ?? "";
  const hasMarker = VARIATION_MARKERS.has(marker);
  const inner = hasMarker ? body.slice(1).trimStart() : body;
  const parts = splitTopLevel(inner, "|");
  if (parts.length > 1 && parts.every(looksLikeVariationPart)) {
    return { parts, kind: hasMarker ? variationKind(marker) : "sequence" };
  }
  return { parts: [], kind: "sequence" };
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

function resetObject(target: SerialObject, fresh: SerialObject): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  for (const key of Object.keys(fresh)) {
    target[key] = fresh[key];
  }
}

function flattenPatch(patch: UpdatePatch, prefix = ""): [string, SerialValue][] {
  const out: [string, SerialValue][] = [];
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (!key.endsWith("+") && isPlainObj(value as SerialValue | undefined)) {
      out.push(...flattenPatch(value as UpdatePatch, path));
      continue;
    }
    out.push([path, value as SerialValue]);
  }
  return out;
}

export function parseUpdatePath(path: string): { path: string; append: boolean } {
  if (!path.endsWith("+")) return { path, append: false };
  return { path: path.slice(0, -1), append: true };
}

export function setValueAtPath(root: SerialObject, raw: string, value: SerialValue): void {
  const op = parseUpdatePath(raw);
  if (!isValidPath(op.path)) return;
  ensureViewPath(root, op.path);
  const cur = hasPath(root, op.path) ? safeGet(root, op.path) : null;
  setViewPath(root, op.path, calcPatchValue(cur, value, op.append));
}

export function calcPatchValue(cur: SerialValue, val: SerialValue, append: boolean): SerialValue {
  if (!append) return val;
  if (cur === null) return val;
  if (isPlainObj(cur) && isPlainObj(val)) {
    const out: SerialObject = cloneSerial(cur) as SerialObject;
    overlay(out, val);
    return out;
  }
  if (Array.isArray(cur)) {
    return cur.concat(Array.isArray(val) ? val : [val]);
  }
  if (typeof cur === "string") {
    return cur + castToString(val);
  }
  return val;
}

function isValidPath(path: string): boolean {
  const parts = path.split(".").filter(Boolean);
  return parts.length > 0 && parts.every(isValidKey);
}

function ensureViewPath(root: SerialObject, path: string): void {
  const parts = path.split(".");
  let cur: SerialObject = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = cur[part];
    if (isPlainObj(next)) {
      cur = next;
      continue;
    }
    const fresh: SerialObject = {};
    cur[part] = fresh;
    cur = fresh;
  }
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
