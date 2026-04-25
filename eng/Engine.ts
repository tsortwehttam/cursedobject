import { SerialValue } from "../lib/CoreTypings";
import type { FacNode, FacProgram, RefSeg, Slot } from "./AST";
import { renderHandlebarsTemplate } from "../lib/TemplateHelpers";
import { createPRNG } from "../lib/RandHelpers";
import { createLoadedRunner } from "../lib/ScriptEvaluator";
import { deepGet, deepSet } from "../lib/PathHelpers";
import { parseRegexLiteral } from "../lib/RegexHelpers";
import type { FacAdapter, IOCtx } from "./adapters/Adapter";
import { parseVariation } from "./Parsing";

export type EntityData = Record<string, SerialValue>;
export type World = {
  entities: Record<string, EntityData>;
  events: FacEvent[];
};

export type FacEvent = {
  slots: SerialValue[];
  obs: string[];
  ts: number;
};

export type Env = Record<string, SerialValue>;

export type EngineLog = { kind: "event" | "mut" | "io" | "note"; msg: string }[];

export type EngineOptions = {
  maxDepth?: number; // default 32; caps recursive emit depth
  seed?: string | number; // PRNG seed for interpolation variation / script funcs
  params?: Record<string, SerialValue>;
};

type ResolvedEngineOptions = {
  maxDepth: number;
  seed: string | number;
  params: Record<string, SerialValue>;
};

const DEFAULT_MAX_DEPTH = 32;

export class Facsimile {
  world: World;
  adapter: FacAdapter;
  program: FacProgram;
  opts: ResolvedEngineOptions;
  private ts = 0;
  private rng;
  log: EngineLog = [];
  private computed: Map<string, string> = new Map();
  private readingComputed: Set<string> = new Set();

  constructor(world: World, adapter: FacAdapter, program: FacProgram, opts: EngineOptions = {}) {
    this.world = world;
    this.adapter = adapter;
    this.program = program;
    this.opts = {
      maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
      seed: opts.seed ?? "facsimile",
      params: opts.params ?? {},
    };
    this.rng = createPRNG(this.opts.seed, 0);
    this.collectComputed(program);
  }

  private collectComputed(nodes: FacNode[]) {
    for (const node of nodes) this.collectFrom(node);
  }

  private collectFrom(node: FacNode) {
    const first = node.slots[0];
    const second = node.slots[1];
    if (first?.t === "ref" && second?.t === "cond" && second.kind === "define") {
      if (first.segs.some((s) => s.wild)) {
        throw new Error(`computed path must not have wildcards: ${first.segs.map((s) => s.v).join(".")}`);
      }
      const key = first.segs.map((s) => s.v).join(".");
      const prior = this.computed.get(key);
      if (prior !== undefined && prior !== second.raw) {
        throw new Error(`computed ${key} redefined`);
      }
      this.computed.set(key, second.raw);
    }
    for (const child of node.body ?? []) this.collectFrom(child);
  }

  async boot() {
    // Fire `game boot` + `<entity> spawn` events for all defined entities.
    await this.emit(this.mkEvent(["game", "boot"]));
    for (const id of Object.keys(this.world.entities)) {
      await this.emit(this.mkEvent([id, "spawn"]));
    }
  }

  mkEvent(slots: SerialValue[], obs: string[] = []): FacEvent {
    return { slots, obs, ts: ++this.ts };
  }

  async emit(event: FacEvent, depth = 0): Promise<void> {
    if (depth > this.opts.maxDepth) {
      this.log.push({ kind: "note", msg: `max-depth exceeded (${this.opts.maxDepth})` });
      return;
    }
    this.world.events.push(event);
    this.log.push({ kind: "event", msg: event.slots.map(String).join(" ") });
    for (const listen of this.adapter.events) {
      await listen({ world: this.world, event });
    }

    for (const handler of this.program) {
      const env = matchHandler(handler, event);
      if (!env) continue;
      // Inject observation env as $obs + actor/verb/target/value conveniences.
      env["$obs"] = event.obs;
      if (typeof event.slots[0] !== "undefined") env["$actor"] = event.slots[0];
      if (typeof event.slots[1] !== "undefined") env["$verb"] = event.slots[1];
      if (typeof event.slots[2] !== "undefined") env["$target"] = event.slots[2];
      if (typeof event.slots[3] !== "undefined") env["$value"] = event.slots[3];
      if (handler.cond && !(await this.evalCond(handler.cond, env))) continue;
      if (handler.body) {
        await this.runBody(handler.body, env, event, depth);
      }
    }
  }

  private async runBody(body: FacNode[], env: Env, event: FacEvent, depth: number) {
    for (const stmt of body) {
      await this.runStmt(stmt, env, event, depth);
    }
  }

  private async runStmt(stmt: FacNode, env: Env, event: FacEvent, depth: number): Promise<void> {
    const first = stmt.slots[0];
    // Control flow
    if (first && first.t === "cond") {
      if (first.kind === "if") return this.runIf(stmt, env, event, depth);
      if (first.kind === "switch") return this.runSwitch(stmt, env, event, depth);
      return;
    }
    // Computed prop definition — registered statically, no runtime effect.
    if (stmt.slots.length === 2 && stmt.slots[1].t === "cond" && stmt.slots[1].kind === "define") {
      return;
    }

    // Resolve slot values to concrete SerialValues (expand wildcards, run io, interpolate strings).
    const resolved: SerialValue[] = [];
    for (const s of stmt.slots) {
      const v = await this.resolveSlot(s, env);
      resolved.push(v);
    }

    // Pure io stmt: single io slot was captured as result; nothing else to do.
    if (stmt.slots.length === 1 && stmt.slots[0].t === "io") {
      this.log.push({ kind: "io", msg: `stmt io → ${String(resolved[0])}` });
      return;
    }

    // Mut kernel: `<path> set|incr|decr [n]`
    if (
      stmt.slots.length >= 2 &&
      stmt.slots[0].t === "ref" &&
      stmt.slots[1].t === "ref" &&
      !stmt.slots[1].segs[0].wild
    ) {
      const pathSegs = expandRef(stmt.slots[0] as Extract<Slot, { t: "ref" }>, env);
      const verb = stmt.slots[1].segs[0].v;
      if (verb === "set" && stmt.slots.length === 3) {
        const value = this.resolveMutationValue(stmt.slots[2], env, resolved[2]);
        this.mutate(pathSegs, value);
        this.log.push({ kind: "mut", msg: `${pathSegs.join(".")} = ${JSON.stringify(value)}` });
        // Emit as 2-slot property-change event so authors can react with `<path> set { ... }`.
        await this.emit(this.mkEvent([pathSegs.join("."), "set"]), depth + 1);
        return;
      }
      if (verb === "incr" || verb === "decr") {
        const n = stmt.slots.length === 3
          ? Number(this.resolveMutationValue(stmt.slots[2], env, resolved[2]) ?? 1)
          : 1;
        const cur = Number(this.readPath(pathSegs) ?? 0);
        const next = verb === "incr" ? cur + n : cur - n;
        this.mutate(pathSegs, next);
        this.log.push({ kind: "mut", msg: `${pathSegs.join(".")} ${verb} → ${next}` });
        // Emit 2-slot mut event (path + verb) so `$x.foo incr { ... }` handlers match.
        await this.emit(this.mkEvent([pathSegs.join("."), verb]), depth + 1);
        return;
      }
      if (COUNTER_VERBS.has(verb)) {
        const args = this.resolveMutArgs(stmt.slots.slice(2), env, resolved.slice(2));
        const cur = Number(this.readPath(pathSegs) ?? 0);
        const next = applyCounterVerb(verb, cur, args);
        this.mutate(pathSegs, next);
        this.log.push({ kind: "mut", msg: `${pathSegs.join(".")} ${verb} → ${next}` });
        await this.emit(this.mkEvent([pathSegs.join("."), verb]), depth + 1);
        return;
      }
      if (ARRAY_VERBS.has(verb) || SET_VERBS.has(verb)) {
        const args = this.resolveMutArgs(stmt.slots.slice(2), env, resolved.slice(2));
        const curRaw = this.readPath(pathSegs);
        const cur = Array.isArray(curRaw) ? curRaw.slice() : [];
        const next = SET_VERBS.has(verb) ? applySetVerb(verb, cur, args) : applyArrayVerb(verb, cur, args);
        this.mutate(pathSegs, next);
        this.log.push({ kind: "mut", msg: `${pathSegs.join(".")} ${verb} → ${JSON.stringify(next)}` });
        await this.emit(this.mkEvent([pathSegs.join("."), verb]), depth + 1);
        return;
      }
    }

    // Otherwise: emit as sub-event.
    await this.emit(this.mkEvent(resolved, event.obs), depth + 1);
  }

  private resolveMutationValue(slot: Slot, env: Env, value: SerialValue): SerialValue {
    if (slot.t !== "ref") return value;
    const segs = expandRef(slot, env);
    const found = deepGet(this.withBaseEnv(env), segs);
    return found ?? value;
  }

  private resolveMutArgs(slots: Slot[], env: Env, resolved: SerialValue[]): SerialValue[] {
    return slots.map((s, i) => this.resolveMutationValue(s, env, resolved[i]));
  }

  private async runIf(stmt: FacNode, env: Env, event: FacEvent, depth: number) {
    for (const branch of stmt.body ?? []) {
      const head = branch.slots[0];
      if (head.t !== "cond") continue;
      if (head.kind === "cond") {
        if (await this.evalCond(head.raw, env)) {
          await this.runBody(branch.body ?? [], env, event, depth);
          return;
        }
      } else if (head.kind === "default") {
        await this.runBody(branch.body ?? [], env, event, depth);
        return;
      }
    }
  }

  private async runSwitch(stmt: FacNode, env: Env, event: FacEvent, depth: number) {
    const head = stmt.slots[0];
    if (head.t !== "cond") return;
    const subject = String(await this.evalExpr(head.raw, env) ?? "");
    for (const br of stmt.body ?? []) {
      const mk = br.slots[0];
      if (mk.t !== "cond") continue;
      if (mk.kind === "default") {
        await this.runBody(br.body ?? [], env, event, depth);
        return;
      }
      if (mk.kind === "case") {
        const rx = parseRegexLiteral(mk.raw);
        const hit = rx ? new RegExp(rx.body, rx.flags).test(subject) : mk.raw.trim() === subject;
        if (hit) {
          await this.runBody(br.body ?? [], env, event, depth);
          return;
        }
      }
    }
  }

  private async resolveSlot(s: Slot, env: Env): Promise<SerialValue> {
    if (s.t === "num") return s.v;
    if (s.t === "str") return this.interpolate(s.v, env);
    if (s.t === "json") return s.v;
    if (s.t === "regex") return `/${s.v}/${s.flags}`;
    if (s.t === "ref") return expandRef(s, env).join(".");
    if (s.t === "cond") return s.raw;
    if (s.t === "io") {
      const method = this.adapter.methods[s.kind];
      if (!method) throw new Error(`no adapter method for io kind "${s.kind}"`);
      env.params = this.opts.params;
      const ctx: IOCtx = {
        world: this.world,
        env,
        kind: s.kind,
        rawText: s.raw,
        interpolate: (text: string) => this.interpolate(text, env),
        evalExpr: (expr: string, extra: Env | null) => this.evalExpr(expr, extra ? { ...env, ...extra } : env),
      };
      const result = await method(ctx);
      this.log.push({ kind: "io", msg: `<<${s.kind} ...>> → ${JSON.stringify(result)}` });
      return result;
    }
    return null;
  }

  interpolate(text: string, env: Env): string {
    return renderHandlebarsTemplate(text, (expr) => {
      const variation = parseVariation(expr);
      if (variation) return variation[Math.floor(Math.random() * variation.length)] ?? "";
      return this.evalExprSync(expr, env);
    });
  }

  private evalExprSync(expr: string, env: Env): SerialValue {
    const vars = this.withBaseEnv(env);
    const runner = createLoadedRunner(this.rng, vars, {
      has: (arr, v) => Array.isArray(arr) && (arr as SerialValue[]).includes(v),
    });
    return runner.evaluate(this.resolveWildPaths(expr, vars));
  }

  // Rewrite `$wild.x.y` → `EntityName.x.y` when $wild is bound to a string naming an entity.
  // Lets authors write `$target.kind == "character"` naturally in conds and interpolations.
  private resolveWildPaths(expr: string, vars: Env): string {
    return expr.replace(/\$(\w+)(?=\.)/g, (match, name) => {
      const v = vars["$" + name];
      if (typeof v === "string" && Object.prototype.hasOwnProperty.call(this.world.entities, v)) {
        return v;
      }
      return match;
    });
  }

  async evalExpr(expr: string, env: Env): Promise<SerialValue> {
    return this.evalExprSync(expr, env);
  }

  async evalCond(expr: string, env: Env): Promise<boolean> {
    const v = await this.evalExpr(expr, env);
    return !!v;
  }

  private entityVars(): Record<string, SerialValue> {
    return this.world.entities as Record<string, SerialValue>;
  }

  private withBaseEnv(env: Env): Env {
    return { ...this.entitiesWithComputed(), params: this.opts.params, ...env };
  }

  private entitiesWithComputed(): Record<string, SerialValue> {
    if (this.computed.size === 0) return this.entityVars();
    const out: Record<string, SerialValue> = {};
    for (const [name, stored] of Object.entries(this.world.entities)) {
      const entityOut: Record<string, SerialValue> = { ...stored };
      for (const key of this.computed.keys()) {
        if (!key.startsWith(name + ".")) continue;
        if (this.readingComputed.has(key)) continue;
        const parts = key.split(".");
        deepSet(entityOut, parts.slice(1), this.readPath(parts));
      }
      out[name] = entityOut;
    }
    return out;
  }

  // ---------- World mutation ----------

  mutate(segs: string[], value: SerialValue) {
    if (segs.length === 0) return;
    const key = segs.join(".");
    if (this.computed.has(key)) {
      this.log.push({ kind: "note", msg: `cannot mutate computed ${key}` });
      return;
    }
    const [id] = segs;
    if (!this.world.entities[id]) this.world.entities[id] = {};
    deepSet(this.world.entities as Record<string, unknown>, segs, value);
  }

  readPath(segs: string[]): SerialValue {
    const key = segs.join(".");
    const expr = this.computed.get(key);
    if (expr !== undefined) {
      if (this.readingComputed.has(key)) {
        this.log.push({ kind: "note", msg: `computed cycle at ${key}` });
        return null;
      }
      this.readingComputed.add(key);
      const result = this.evalExprSync(expr, this.entityScopeEnv(segs[0]));
      this.readingComputed.delete(key);
      return result;
    }
    return deepGet(this.world.entities, segs);
  }

  private entityScopeEnv(entityName: string): Env {
    const entity = this.world.entities[entityName] ?? {};
    const env: Env = { ...entity };
    for (const key of this.computed.keys()) {
      if (!key.startsWith(entityName + ".")) continue;
      if (this.readingComputed.has(key)) continue;
      const parts = key.split(".");
      deepSet(env as Record<string, unknown>, parts.slice(1), this.readPath(parts));
    }
    return env;
  }
}

// ---------- Matching ----------

export function matchHandler(handler: FacNode, event: FacEvent): Env | null {
  const pats = handler.slots;
  const hasRest = pats.length > 0 && pats[pats.length - 1].t === "rest";
  const fixed = hasRest ? pats.length - 1 : pats.length;
  if (hasRest ? event.slots.length < fixed : event.slots.length !== fixed) return null;
  const env: Env = {};
  for (let i = 0; i < fixed; i++) {
    if (pats[i].t === "rest") return null; // rest must be last only
    if (!matchSlot(pats[i], event.slots[i], env)) return null;
  }
  return env;
}

export function matchSlot(p: Slot, v: SerialValue, env: Env): boolean {
  if (p.t === "str") return String(v) === p.v;
  if (p.t === "num") return Number(v) === p.v;
  if (p.t === "regex") return new RegExp(p.v, p.flags).test(String(v));
  if (p.t === "cond") return false;
  if (p.t === "io") return false;
  if (p.t === "rest") return false;
  if (p.t === "ref") {
    const vs = String(v);
    const parts = vs.split(".");
    if (parts.length !== p.segs.length) {
      if (p.segs.length === 1) {
        const seg = p.segs[0];
        if (seg.wild) {
          if (seg.v !== "_") env["$" + seg.v] = v;
          return true;
        }
        return seg.v === vs;
      }
      return false;
    }
    for (let i = 0; i < parts.length; i++) {
      const seg = p.segs[i];
      if (seg.wild) {
        if (seg.v === "_") continue;
        env["$" + seg.v] = env["$" + seg.v] ?? parts[i];
        if (String(env["$" + seg.v]) !== parts[i]) return false;
      } else if (seg.v !== parts[i]) {
        return false;
      }
    }
    return true;
  }
  return false;
}

// ---------- Mutation verb tables ----------

export type ArrayVerb =
  | "push" | "unshift" | "pop" | "shift"
  | "remove" | "removeAll" | "insert" | "removeAt" | "clear";
export type SetVerb = "add" | "delete" | "toggle" | "clear";
export type CounterVerb = "clamp" | "min" | "max";

export const ARRAY_VERBS: Set<string> = new Set<ArrayVerb>([
  "push", "unshift", "pop", "shift", "remove", "removeAll", "insert", "removeAt", "clear",
]);
export const SET_VERBS: Set<string> = new Set<SetVerb>(["add", "delete", "toggle", "clear"]);
export const COUNTER_VERBS: Set<string> = new Set<CounterVerb>(["clamp", "min", "max"]);

function eq(a: SerialValue, b: SerialValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyArrayVerb(verb: string, cur: SerialValue[], args: SerialValue[]): SerialValue[] {
  if (verb === "push") return [...cur, ...args];
  if (verb === "unshift") return [...args, ...cur];
  if (verb === "pop") return cur.slice(0, -1);
  if (verb === "shift") return cur.slice(1);
  if (verb === "clear") return [];
  if (verb === "remove") {
    const i = cur.findIndex((v) => eq(v, args[0]));
    if (i < 0) return cur;
    const next = cur.slice();
    next.splice(i, 1);
    return next;
  }
  if (verb === "removeAll") return cur.filter((v) => !eq(v, args[0]));
  if (verb === "insert") {
    const i = Math.max(0, Math.min(cur.length, Number(args[0] ?? 0)));
    const next = cur.slice();
    next.splice(i, 0, ...args.slice(1));
    return next;
  }
  if (verb === "removeAt") {
    const i = Number(args[0] ?? -1);
    if (i < 0 || i >= cur.length) return cur;
    const next = cur.slice();
    next.splice(i, 1);
    return next;
  }
  return cur;
}

export function applySetVerb(verb: string, cur: SerialValue[], args: SerialValue[]): SerialValue[] {
  if (verb === "clear") return [];
  const v = args[0];
  const has = cur.some((x) => eq(x, v));
  if (verb === "add") return has ? cur : [...cur, v];
  if (verb === "delete") return has ? cur.filter((x) => !eq(x, v)) : cur;
  if (verb === "toggle") return has ? cur.filter((x) => !eq(x, v)) : [...cur, v];
  return cur;
}

export function applyCounterVerb(verb: string, cur: number, args: SerialValue[]): number {
  if (verb === "clamp") {
    const lo = Number(args[0] ?? -Infinity);
    const hi = Number(args[1] ?? Infinity);
    return Math.max(lo, Math.min(hi, cur));
  }
  if (verb === "min") return Math.min(cur, Number(args[0] ?? cur));
  if (verb === "max") return Math.max(cur, Number(args[0] ?? cur));
  return cur;
}

function expandRef(s: Extract<Slot, { t: "ref" }>, env: Env): string[] {
  return s.segs.map((seg: RefSeg) => {
    if (seg.wild) {
      const bound = env["$" + seg.v];
      return bound != null ? String(bound) : "$" + seg.v;
    }
    return seg.v;
  });
}
