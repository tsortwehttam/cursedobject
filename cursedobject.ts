import { BUILTIN_DIRECTIVES } from "./lib/Builtins";
import { SerialObject, SerialValue } from "./lib/CoreTypings";
import { castToString, isTruthy, isValidKey, safeGet } from "./lib/EvalCasting";
import { marshallParams, MarshalledParams } from "./lib/ParamsMarshaller";
import { createPRNG, PRNG } from "./lib/RandHelpers";
import { buildEvalFunctions, createLoadedRunner, evaluateExprCore, Expr, ExprEvalFunc, walkExpr } from "./lib/ScriptEvaluator";
import { readTemplateToken } from "./lib/TemplateHelpers";

export type LazyValue = (vars: SerialObject, handle: CursedObjectHandle) => SerialValue | Promise<SerialValue>;
export type MixedValue = SerialValue | LazyValue | MixedValue[] | MixedObject;
export type MixedObject = { [key: string]: MixedValue };

export type LoadOptions = {
  seed: string | number;
  cycle: number;
  params: Record<string, SerialValue>;
  fn: Record<string, ExprEvalFunc>;
  io: Record<string, CursedObjectIoFunc>;
};

type LocalVars = Record<string, SerialValue>;
type IfBranch = { expr: string | null; body: string; end: number };

export type UpdatePatchValue = SerialValue | UpdatePatch;
export type UpdatePatch = { [key: string]: UpdatePatchValue };
export type UpdateOptions = { create: boolean };
export type UpdateResult = { values: SerialObject; undo: UndoPatch };
export type UndoPatch = {
  version: 1;
  from: number;
  to: number;
  paths: Record<string, SerialValue>;
  unset: string[];
};

export type CursedObjectIoFunc = (params: MarshalledParams, handle: CursedObjectHandle) => Promise<SerialValue> | SerialValue;

export type CursedObjectHandle = {
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
  raw(path: string): MixedValue;
  resolve: {
    (value: MixedValue): Promise<SerialValue>;
    (value: MixedValue, vars: Record<string, SerialValue>): Promise<SerialValue>;
  };
  peek: {
    (paths: string[]): Promise<SerialObject>;
    (paths: string[], vars: Record<string, SerialValue>): Promise<SerialObject>;
  };
  update: {
    (patch: UpdatePatch): Promise<UpdateResult>;
    (patch: UpdatePatch, vars: Record<string, SerialValue>): Promise<UpdateResult>;
    (patch: UpdatePatch, vars: Record<string, SerialValue>, opts: Partial<UpdateOptions>): Promise<UpdateResult>;
  };
  restore(undo: UndoPatch): void;
  clear(): void;
  fork: {
    (): CursedObjectHandle;
    (opts: Partial<LoadOptions>): CursedObjectHandle;
  };
  rng: PRNG;
  cycle(): number;
};

const DEFAULT_OPTIONS: LoadOptions = {
  seed: 1,
  cycle: 0,
  params: {},
  fn: {},
  io: {},
};

const UNDO_PATCH_VERSION = 1;

export function load(source: MixedObject, opts: Partial<LoadOptions> = {}): CursedObjectHandle {
  const options: LoadOptions = { ...DEFAULT_OPTIONS, ...opts };
  const root = toMixedObject(source, "$");
  const rng = createPRNG(options.seed, options.cycle);
  const state: MixedObject = cloneMixed(root) as MixedObject;
  const view: MixedObject = cloneMixed(root) as MixedObject;
  const active = new Set<string>();
  const funcs = createBaseFunctionMap(options.fn);
  const runner = createLoadedRunner({}, funcs);
  const baseFuncs = buildEvalFunctions(funcs);
  const astCache = new Map<string, Expr | null>();
  const cycleCounters = new Map<string, number>();
  let rev = 0;

  function bumpCounter(key: string): number {
    const idx = cycleCounters.get(key) ?? 0;
    cycleCounters.set(key, idx + 1);
    return idx;
  }

  function parseCached(expr: string): Expr | null {
    if (astCache.has(expr)) {
      return astCache.get(expr) ?? null;
    }
    const ast = runner.parse(expr);
    astCache.set(expr, ast);
    return ast;
  }

  function mergedVars(vars: LocalVars): SerialObject {
    const out: SerialObject = { ...(view as SerialObject) };
    overlay(out, options.params);
    overlay(out, vars);
    return out;
  }

  const handle: CursedObjectHandle = {
    has,
    calc,
    calcAll,
    evaluate,
    raw,
    resolve,
    peek,
    update,
    restore,
    clear,
    fork,
    rng,
    cycle: () => rng.getCycle(),
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
    const value = await calcValue(mixedGet(state, path), path, vars);
    active.delete(path);
    setViewPath(view, path, value);
    return value;
  }

  async function calcAll(vars: LocalVars = {}): Promise<SerialObject> {
    for (const key of Object.keys(state)) {
      await calc(key, vars);
    }
    return view as SerialObject;
  }

  function raw(path: string): MixedValue {
    if (!hasPath(root, path)) {
      throw new Error(`Unknown path: ${path}`);
    }
    return mixedGet(root, path);
  }

  async function evaluate(expr: string, vars: LocalVars = {}): Promise<SerialValue> {
    return evaluateExpr(expr, vars);
  }

  async function resolve(value: MixedValue, vars: LocalVars = {}): Promise<SerialValue> {
    return calcValue(value, "$resolve", vars);
  }

  async function peek(paths: string[], vars: LocalVars = {}): Promise<SerialObject> {
    const out: SerialObject = {};
    for (const path of paths) {
      if (!hasPath(state, path)) {
        out[path] = null;
        continue;
      }
      out[path] = await calc(path, vars);
    }
    return out;
  }

  async function update(patch: UpdatePatch, vars: LocalVars = {}, opts: Partial<UpdateOptions> = {}): Promise<UpdateResult> {
    const create = opts.create ?? true;
    const entries = flattenPatch(patch);
    const from = rev;
    type Pending = {
      path: string;
      rhs: SerialValue;
      cur: SerialValue;
      append: boolean;
      undoPath: string;
      undoExists: boolean;
      undoValue: SerialValue;
    };
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
        const cur = exists ? await calc(path, vars) : null;
        const undo = exists ? { path, exists: true } : findUndoTarget(state, path);
        pending.push({
          path,
          rhs,
          cur,
          append: op.append,
          undoPath: undo.path,
          undoExists: undo.exists,
          undoValue: undo.exists ? await calc(undo.path, vars) : null,
        });
      }
    }
    const resolved: SerialObject = {};
    const paths: Record<string, SerialValue> = {};
    const unset = new Set<string>();
    for (const { path, rhs, cur, append, undoPath, undoExists, undoValue } of pending) {
      if (!undoExists) {
        unset.add(undoPath);
      } else if (!Object.prototype.hasOwnProperty.call(paths, undoPath)) {
        paths[undoPath] = cloneSerial(undoValue);
      }
      const val = await evalUpdateValue(rhs, { ...vars, this: cur });
      const next = calcPatchValue(cur, val, append);
      if (create && !hasPath(state, path)) {
        ensureViewPath(state, path);
        ensureViewPath(view, path);
      }
      setViewPath(state, path, next);
      setViewPath(view, path, next);
      resolved[path] = next;
    }
    rev += 1;
    return {
      values: resolved,
      undo: {
        version: UNDO_PATCH_VERSION,
        from,
        to: rev,
        paths,
        unset: [...unset],
      },
    };
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
      const rendered = needsRender(expr) ? await renderText(expr, vars) : expr;
      return evaluateExpr(rendered, vars);
    }
    const lone = await tryLoneDirective(rhs, vars);
    if (lone.hit) return lone.value;
    return renderText(rhs, vars);
  }

  function clear(): void {
    resetObject(state, cloneMixed(root) as MixedObject);
    resetObject(view, cloneMixed(root) as MixedObject);
    rev += 1;
  }

  function restore(undo: UndoPatch): void {
    if (undo.version !== UNDO_PATCH_VERSION) {
      throw new Error(`Unsupported undo patch version: ${undo.version}`);
    }
    if (rev !== undo.to) {
      throw new Error(`Cannot restore undo patch from revision ${undo.from}; current revision is ${rev}`);
    }
    for (const path of undo.unset) {
      deletePath(state, path);
      deletePath(view, path);
    }
    for (const path of Object.keys(undo.paths)) {
      const val = cloneSerial(undo.paths[path]!);
      ensureViewPath(state, path);
      ensureViewPath(view, path);
      setViewPath(state, path, val);
      setViewPath(view, path, cloneSerial(val));
    }
    rev = undo.from;
  }

  function fork(next: Partial<LoadOptions> = {}): CursedObjectHandle {
    return load(source, {
      ...options,
      ...next,
      params: { ...options.params, ...(next.params ?? {}) },
      fn: { ...options.fn, ...(next.fn ?? {}) },
      io: { ...options.io, ...(next.io ?? {}) },
    });
  }

  async function calcValue(value: MixedValue, path: string, vars: LocalVars): Promise<SerialValue> {
    if (typeof value === "function") {
      return calcValue(await value(vars, handle), path, vars);
    }
    if (typeof value === "string") {
      if (isPlainString(value)) {
        return value;
      }
      const expr = readArrowExpr(value);
      if (expr !== null) {
        const rendered = needsRender(expr) ? await renderText(expr, vars) : expr;
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
    return evaluateExpr(await renderTemplates(body, vars), vars);
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
    const builtin = BUILTIN_DIRECTIVES[name];
    if (builtin) {
      const value = await builtin(args, { rng, counter: bumpCounter, key: token.body.trim() });
      return { value, binding, end: token.end };
    }
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

export function safeMixed(v: unknown): MixedValue {
  if (typeof v === "function") return v as MixedValue;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "symbol") return String(v);
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(safeMixed);
  if (typeof v === "object") {
    const out: Record<string, MixedValue> = {};
    for (const k of Object.keys(v as object)) out[k] = safeMixed((v as Record<string, unknown>)[k]);
    return out;
  }
  return null;
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

function toMixedObject(value: unknown, path: string): MixedObject {
  const mixed = toMixedValue(value, path);
  if (mixed === null || typeof mixed !== "object" || Array.isArray(mixed)) {
    throw new Error("CursedObject root must be an object");
  }
  return mixed;
}

function toMixedValue(value: unknown, path: string): MixedValue {
  if (typeof value === "function") {
    return value as LazyValue;
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
    const out: MixedValue[] = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(toMixedValue(value[i], joinPath(path, String(i))));
    }
    return out;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: MixedObject = {};
    for (const [key, val] of Object.entries(value)) {
      if (!isValidKey(key)) {
        throw new Error(`Invalid key at ${path}: ${key}`);
      }
      out[key] = toMixedValue(val, joinPath(path, key));
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

function needsRender(text: string): boolean {
  return text.indexOf("{{") >= 0 || findDirectiveStart(text, 0) >= 0;
}

function resetObject(target: MixedObject, fresh: MixedObject): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  for (const key of Object.keys(fresh)) {
    target[key] = fresh[key]!;
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

function cloneSerial(value: SerialValue): SerialValue {
  return cloneMixed(value) as SerialValue;
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
    const out: SerialObject = cloneMixed(cur) as SerialObject;
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

function ensureViewPath(root: MixedObject, path: string): void {
  const parts = path.split(".");
  let cur: MixedObject = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    const next = cur[part];
    if (isMixedObj(next)) {
      cur = next;
      continue;
    }
    const fresh: MixedObject = {};
    cur[part] = fresh;
    cur = fresh;
  }
}

function setViewPath(root: MixedObject, path: string, value: MixedValue): void {
  const parts = path.split(".");
  let cur: MixedValue = root;
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

function findUndoTarget(root: MixedObject, path: string): { path: string; exists: boolean } {
  const parts = path.split(".");
  let cur: MixedValue = root;
  const prefix: string[] = [];
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") {
      return { path: prefix.join("."), exists: true };
    }
    prefix.push(part);
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        return { path: prefix.join("."), exists: false };
      }
      cur = cur[idx]!;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, part)) {
      return { path: prefix.join("."), exists: false };
    }
    cur = cur[part]!;
  }
  return { path, exists: true };
}

function deletePath(root: MixedObject, path: string): void {
  const parts = path.split(".");
  let cur: MixedValue = root;
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
    cur.splice(idx, 1);
    return;
  }
  delete cur[last];
}

function overlay(target: SerialObject, source: Record<string, SerialValue>): void {
  for (const key of Object.keys(source)) {
    const a = target[key];
    const b = source[key];
    if (isPlainObj(a) && isPlainObj(b)) {
      const merged: SerialObject = { ...(a as SerialObject) };
      overlay(merged, b as Record<string, SerialValue>);
      target[key] = merged;
      continue;
    }
    target[key] = b!;
  }
}

function isPlainObj(value: SerialValue | undefined): value is SerialObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function isMixedObj(value: MixedValue | undefined): value is MixedObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function cloneMixed(value: MixedValue): MixedValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const out: MixedValue[] = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(cloneMixed(value[i] ?? null));
    }
    return out;
  }
  const out: MixedObject = {};
  for (const key of Object.keys(value)) {
    out[key] = cloneMixed(value[key] ?? null);
  }
  return out;
}

function hasPath(root: MixedObject, path: string): boolean {
  if (path.trim() === "") {
    return true;
  }
  const parts = path.split(".");
  let cur: MixedValue = root;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") {
      return false;
    }
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        return false;
      }
      cur = cur[idx]!;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, part)) {
      return false;
    }
    cur = cur[part]!;
  }
  return true;
}

function mixedGet(root: MixedObject, path: string): MixedValue {
  if (path.trim() === "") {
    return root;
  }
  const parts = path.split(".");
  let cur: MixedValue = root;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return null;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return null;
      cur = cur[idx] ?? null;
      continue;
    }
    cur = cur[part] ?? null;
  }
  return cur;
}

function matchPaths(root: MixedObject, pattern: string): string[] {
  if (pattern.trim() === "") {
    return [];
  }
  const out: string[] = [];
  walkPath(root, pattern.split("."), [], out);
  return out;
}

function walkPath(value: MixedValue, parts: string[], path: string[], out: string[]): void {
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
        walkPath(value[i]!, rest, [...path, String(i)], out);
      }
      return;
    }
    for (const key of Object.keys(value)) {
      walkPath(value[key]!, rest, [...path, key], out);
    }
    return;
  }
  if (Array.isArray(value)) {
    const idx = Number(part);
    if (!Number.isInteger(idx) || idx < 0 || idx >= value.length) {
      return;
    }
    walkPath(value[idx]!, rest, [...path, part], out);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(value, part)) {
    return;
  }
  walkPath(value[part]!, rest, [...path, part], out);
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
