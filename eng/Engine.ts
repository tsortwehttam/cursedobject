import { SerialValue } from "../lib/CoreTypings";
import type { FacNode, FacProgram, RefSeg, Slot } from "./AST";
import { renderHandlebarsTemplate } from "../lib/TemplateHelpers";
import { createPRNG } from "../lib/RandHelpers";
import { createLoadedRunner } from "../lib/ScriptEvaluator";
import { deepGet, deepSet } from "../lib/PathHelpers";
import { parseRegexLiteral } from "../lib/RegexHelpers";
import type { FacAdapter, IOCtx } from "./Adapter";
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
};

const DEFAULT_MAX_DEPTH = 32;

export class Facsimile {
  world: World;
  adapter: FacAdapter;
  program: FacProgram;
  opts: Required<EngineOptions>;
  private ts = 0;
  private rng;
  log: EngineLog = [];

  constructor(world: World, adapter: FacAdapter, program: FacProgram, opts: EngineOptions = {}) {
    this.world = world;
    this.adapter = adapter;
    this.program = program;
    this.opts = {
      maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
      seed: opts.seed ?? "facsimile",
    };
    this.rng = createPRNG(this.opts.seed, 0);
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
        this.mutate(pathSegs, resolved[2]);
        this.log.push({ kind: "mut", msg: `${pathSegs.join(".")} = ${JSON.stringify(resolved[2])}` });
        // Emit as 2-slot property-change event so authors can react with `<path> set { ... }`.
        await this.emit(this.mkEvent([pathSegs.join("."), "set"]), depth + 1);
        return;
      }
      if (verb === "incr" || verb === "decr") {
        const n = stmt.slots.length === 3 ? Number(resolved[2] ?? 1) : 1;
        const cur = Number(this.readPath(pathSegs) ?? 0);
        const next = verb === "incr" ? cur + n : cur - n;
        this.mutate(pathSegs, next);
        this.log.push({ kind: "mut", msg: `${pathSegs.join(".")} ${verb} → ${next}` });
        // Emit 2-slot mut event (path + verb) so `$x.foo incr { ... }` handlers match.
        await this.emit(this.mkEvent([pathSegs.join("."), verb]), depth + 1);
        return;
      }
    }

    // Otherwise: emit as sub-event.
    await this.emit(this.mkEvent(resolved, event.obs), depth + 1);
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
    if (s.t === "regex") return `/${s.v}/${s.flags}`;
    if (s.t === "ref") return expandRef(s, env).join(".");
    if (s.t === "cond") return s.raw;
    if (s.t === "io") {
      const method = this.adapter.methods[s.kind];
      if (!method) throw new Error(`no adapter method for io kind "${s.kind}"`);
      const ctx: IOCtx = {
        world: this.world,
        env,
        kind: s.kind,
        rawText: s.raw,
        interpolate: (text: string) => this.interpolate(text, env),
        evalExpr: (expr: string, extra: Env | null) => this.evalExpr(expr, extra ? { ...env, ...extra } : env),
      };
      const result = await method(ctx);
      this.log.push({ kind: "io", msg: `<<#${s.kind} ...>> → ${JSON.stringify(result)}` });
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
    const vars = { ...this.entityVars(), ...env };
    const runner = createLoadedRunner(this.rng, vars, {
      has: (arr, v) => Array.isArray(arr) && (arr as SerialValue[]).includes(v),
    });
    return runner.evaluate(expr);
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

  // ---------- World mutation ----------

  mutate(segs: string[], value: SerialValue) {
    if (segs.length === 0) return;
    const [id] = segs;
    if (!this.world.entities[id]) this.world.entities[id] = {};
    deepSet(this.world.entities as Record<string, unknown>, segs, value);
  }

  readPath(segs: string[]): SerialValue {
    return deepGet(this.world.entities, segs);
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

function expandRef(s: Extract<Slot, { t: "ref" }>, env: Env): string[] {
  return s.segs.map((seg: RefSeg) => {
    if (seg.wild) {
      const bound = env["$" + seg.v];
      return bound != null ? String(bound) : "$" + seg.v;
    }
    return seg.v;
  });
}
