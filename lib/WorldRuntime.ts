import { AuthoredWorldSchema } from "./WorldSchemas";
import {
  ApplyError,
  ApplyResult,
  AuthoredWorld,
  Effect,
  EntityDef,
  EntityId,
  EntityState,
  EventId,
  EventInput,
  EventRecord,
  HandlerDef,
  KnowledgeRecord,
  KnowledgeVia,
  RunId,
  RunState,
  TraitValue,
  WorldState,
} from "./WorldTypes";

const MAX_EVENTS_PER_RUN = 1000;

type RuntimeFunc = (...args: TraitValue[]) => TraitValue;
type QueuedEvent = {
  event: EventInput;
  parent: EventId | null;
};

export type RuntimeOptions = {
  now: () => number;
};

export function createWorld(input: AuthoredWorld, options: RuntimeOptions): WorldState {
  const authored = AuthoredWorldSchema.parse(input);
  const defs = resolveDefs(authored);
  return {
    revision: 0,
    clock: options.now(),
    defs,
    state: createEntityState(defs),
    knowledge: {},
    events: [],
    scheduled: [],
    runs: {},
  };
}

export function applyEvent(input: EventInput, world: WorldState, options: RuntimeOptions): ApplyResult {
  const runId = createRunId(world);
  const root = createEventId(world);
  const run: RunState = {
    id: runId,
    status: "running",
    root,
    queue: [input],
    processed: [],
    error: null,
  };
  world.runs[run.id] = run;

  const committed: EventRecord[] = [];
  const queue: QueuedEvent[] = [{ event: input, parent: null }];

  while (queue.length > 0) {
    if (run.processed.length >= MAX_EVENTS_PER_RUN) {
      return failRun(world, run, committed, {
        code: "cascade_limit",
        message: `event run exceeded ${MAX_EVENTS_PER_RUN} events`,
        event: null,
      });
    }

    const next = queue.shift();
    run.queue.shift();
    if (!next) break;

    const id = run.processed.length === 0 ? root : createEventId(world);
    const result = processEvent(next.event, id, next.parent, run.id, world, options);
    if (!result.ok) {
      return failRun(world, run, committed, result.error);
    }

    committed.push(result.event);
    run.processed.push(result.event.id);

    for (const fanout of createPerceiveEvents(result.event)) {
      queue.push({ event: fanout, parent: result.event.id });
      run.queue.push(fanout);
    }
    for (const event of result.emits) {
      queue.push({ event, parent: result.event.id });
      run.queue.push(event);
    }
  }

  run.status = "done";
  return { ok: true, run, committed, world };
}

export function getEventText(event: EventRecord): string | null {
  if (event.type === "say" && typeof event.body === "string") return event.body;
  if (event.body && typeof event.body === "object" && !Array.isArray(event.body) && typeof event.body.text === "string") {
    return event.body.text;
  }
  return null;
}

export function getRunText(result: ApplyResult): string[] {
  return result.committed.map(getEventText).filter((text): text is string => text !== null && text.length > 0);
}

type ProcessResult =
  | { ok: true; event: EventRecord; emits: EventInput[] }
  | { ok: false; error: ApplyError };

function processEvent(
  input: EventInput,
  id: EventId,
  parent: EventId | null,
  run: RunId,
  world: WorldState,
  options: RuntimeOptions,
): ProcessResult {
  const event: EventRecord = {
    id,
    run,
    parent,
    type: input.type,
    actor: input.actor,
    target: input.target,
    body: input.body,
    at: options.now(),
    observers: input.observers,
  };

  const handler = findHandler(world, event);
  if (!handler) {
    commitEvent(world, event, options);
    return { ok: true, event, emits: [] };
  }

  if (!canRunHandler(world, event, handler)) {
    commitEvent(world, event, options);
    return { ok: true, event, emits: [] };
  }

  const result = evaluateAction(world, event, handler.action);
  for (const effect of result.effects) {
    applyEffect(world, effect, event, options);
  }
  commitEvent(world, event, options);
  return { ok: true, event, emits: result.emits };
}

function failRun(world: WorldState, run: RunState, committed: EventRecord[], error: ApplyError): ApplyResult {
  run.status = "failed";
  run.error = error.message;
  return { ok: false, run, committed, error, world };
}

function resolveDefs(world: AuthoredWorld): Record<EntityId, EntityDef> {
  const out: Record<EntityId, EntityDef> = {};
  for (const id of Object.keys(world)) {
    out[id] = resolveDef(id, world, []);
  }
  return out;
}

function resolveDef(id: EntityId, world: AuthoredWorld, stack: EntityId[]): EntityDef {
  const def = world[id];
  if (!def) {
    return {
      id,
      type: id,
      inherits: [],
      traits: { public: {}, private: {} },
      handlers: {},
      anchors: {},
      transform: null,
      tags: [],
    };
  }

  const bases = stack.includes(id) ? [] : def.inherits.map((parent) => resolveDef(parent, world, [...stack, id]));
  const merged: EntityDef = {
    id,
    type: def.type ?? id,
    inherits: def.inherits,
    traits: { public: {}, private: {} },
    handlers: {},
    anchors: {},
    transform: null,
    tags: [],
  };

  for (const base of bases) {
    merged.traits.public = { ...merged.traits.public, ...base.traits.public };
    merged.traits.private = { ...merged.traits.private, ...base.traits.private };
    merged.handlers = { ...merged.handlers, ...base.handlers };
    merged.anchors = { ...merged.anchors, ...base.anchors };
    merged.tags = [...merged.tags, ...base.tags];
    merged.transform = base.transform;
  }

  merged.traits.public = { ...merged.traits.public, ...def.traits.public };
  merged.traits.private = { ...merged.traits.private, ...def.traits.private };
  merged.handlers = { ...merged.handlers, ...def.handlers };
  merged.anchors = { ...merged.anchors, ...def.anchors };
  merged.transform = def.transform ?? merged.transform;
  merged.tags = Array.from(new Set([...merged.tags, ...def.tags]));
  return merged;
}

function createEntityState(defs: Record<EntityId, EntityDef>): Record<EntityId, EntityState> {
  const out: Record<EntityId, EntityState> = {};
  for (const def of Object.values(defs)) {
    const anchorState: EntityState["anchorState"] = {};
    for (const name of Object.keys(def.anchors)) {
      anchorState[name] = { children: [] };
    }
    out[def.id] = {
      id: def.id,
      traits: { ...def.traits.public, ...def.traits.private },
      transform: def.transform,
      anchorState,
      status: {},
      ops: {},
    };
  }
  return out;
}

function findHandler(world: WorldState, event: EventRecord): HandlerDef | null {
  if (!event.target) return null;
  const def = world.defs[event.target];
  return def?.handlers[event.type] ?? null;
}

function canRunHandler(world: WorldState, event: EventRecord, handler: HandlerDef): boolean {
  if (!handler.when) return true;
  const expr = unwrapTemplateExpr(handler.when);
  const result = evaluateRuntimeExpr(expr, createVars(world, event), createPureFunctions(world));
  return isTruthy(result);
}

function evaluateAction(world: WorldState, event: EventRecord, action: string) {
  const effects: Effect[] = [];
  const emits: EventInput[] = [];
  const funcs = createActionFunctions(world, event, effects, emits);
  const vars = createVars(world, event);

  for (const raw of action.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("{{") && line.endsWith("}}")) {
      continue;
    }
    evaluateRuntimeExpr(line, vars, funcs);
  }

  return { effects, emits };
}

function createVars(world: WorldState, event: EventRecord) {
  const self = event.target;
  const vars: Record<string, TraitValue> = {
    "$actor": event.actor,
    "$target": event.target,
    "$self": self,
    "$event": event,
  };
  if (self) {
    const state = world.state[self];
    if (state) {
      for (const [key, value] of Object.entries(state.traits)) {
        vars[key] = value;
      }
    }
  }
  return vars;
}

function createPureFunctions(world: WorldState): Record<string, RuntimeFunc> {
  return {
    hasType: (entity, type) => {
      if (typeof entity !== "string" || typeof type !== "string") return false;
      return world.defs[entity]?.type === type || Boolean(world.defs[entity]?.inherits.includes(type));
    },
    hasTag: (entity, tag) => {
      if (typeof entity !== "string" || typeof tag !== "string") return false;
      return Boolean(world.defs[entity]?.tags.includes(tag));
    },
    getTrait: (entity, path) => {
      if (typeof entity !== "string" || typeof path !== "string") return null;
      return world.state[entity]?.traits[path] ?? null;
    },
    hasTrait: (entity, path) => {
      if (typeof entity !== "string" || typeof path !== "string") return false;
      return Object.prototype.hasOwnProperty.call(world.state[entity]?.traits ?? {}, path);
    },
    within: () => false,
    now: () => world.clock,
  };
}

function createActionFunctions(
  world: WorldState,
  event: EventRecord,
  effects: Effect[],
  emits: EventInput[],
): Record<string, RuntimeFunc> {
  return {
    ...createPureFunctions(world),
    set: (path, value) => {
      if (!event.target || typeof path !== "string") return null;
      effects.push({ type: "set_trait", entity: event.target, path, value });
      return null;
    },
    setTrait: (entity, path, value) => {
      if (typeof entity !== "string" || typeof path !== "string") return null;
      effects.push({ type: "set_trait", entity, path, value });
      return null;
    },
    learn: (holder, subject, path, value, via) => {
      if (typeof holder !== "string" || typeof subject !== "string" || typeof path !== "string") return null;
      effects.push({ type: "learn", holder, subject, path, value, via: normalizeVia(via, event) });
      return null;
    },
    convey: (subject, paths, holder) => {
      if (typeof subject !== "string" || typeof holder !== "string") return null;
      const list = Array.isArray(paths) ? paths : [paths];
      for (const path of list) {
        if (typeof path !== "string") continue;
        const value = world.state[subject]?.traits[path] ?? null;
        effects.push({ type: "learn", holder, subject, path, value, via: normalizeVia(null, event) });
      }
      return null;
    },
    emit: (value) => {
      const eventInput = normalizeEventInput(value);
      if (eventInput) emits.push(eventInput);
      return null;
    },
    say: (text) => {
      if (typeof text !== "string") return null;
      emits.push({
        type: "say",
        actor: event.target,
        target: event.actor,
        body: text,
        observers: [],
      });
      return null;
    },
  };
}

function normalizeVia(value: TraitValue, event: EventRecord): KnowledgeVia {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      eventId: typeof value.eventId === "string" ? value.eventId : event.id,
      actor: typeof value.actor === "string" ? value.actor : event.actor,
      note: typeof value.note === "string" ? value.note : null,
    };
  }
  return { eventId: event.id, actor: event.actor, note: null };
}

function normalizeEventInput(value: TraitValue): EventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.type !== "string") return null;
  return {
    type: value.type,
    actor: typeof value.actor === "string" ? value.actor : null,
    target: typeof value.target === "string" ? value.target : null,
    body: value.body ?? null,
    observers: Array.isArray(value.observers) ? value.observers.filter((id): id is string => typeof id === "string") : null,
  };
}

function applyEffect(world: WorldState, effect: Effect, event: EventRecord, options: RuntimeOptions) {
  if (effect.type === "set_trait") {
    const state = world.state[effect.entity];
    if (state) state.traits[effect.path] = effect.value;
    return;
  }
  if (effect.type === "learn") {
    const id = createKnowledgeId(effect.holder, effect.subject, effect.path);
    const existing = world.knowledge[id];
    const now = options.now();
    const record: KnowledgeRecord = {
      id,
      holder: effect.holder,
      subject: effect.subject,
      path: effect.path,
      value: effect.value,
      via: effect.via,
      confidence: existing?.confidence ?? 1,
      observedAt: existing?.observedAt ?? now,
      lastConfirmedAt: existing ? now : null,
    };
    world.knowledge[id] = record;
    return;
  }
  if (effect.type === "schedule_event") {
    world.scheduled.push({
      id: `sched_${world.scheduled.length + 1}`,
      dueAt: options.now() + effect.delay,
      event: effect.event,
      parent: event.id,
    });
  }
}

function commitEvent(world: WorldState, event: EventRecord, options: RuntimeOptions) {
  world.clock = options.now();
  event.at = world.clock;
  world.events.push(event);
  world.revision += 1;
}

function createPerceiveEvents(event: EventRecord): EventInput[] {
  if (event.type.startsWith("perceive/")) return [];
  if (!event.observers || event.observers.length === 0) return [];
  return [...event.observers].sort().map((observer) => ({
    type: `perceive/${event.type}`,
    actor: event.actor,
    target: observer,
    body: { of: event.id },
    observers: [],
  }));
}

function createRunId(world: WorldState): RunId {
  return `run_${Object.keys(world.runs).length + 1}`;
}

function createEventId(world: WorldState): EventId {
  return `evt_${world.events.length + 1}`;
}

function createKnowledgeId(holder: EntityId, subject: EntityId, path: string) {
  return `${holder}:${subject}:${path}`;
}

function unwrapTemplateExpr(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    return trimmed.slice(2, -2).trim();
  }
  return trimmed;
}

function evaluateRuntimeExpr(expr: string, vars: Record<string, TraitValue>, funcs: Record<string, RuntimeFunc>): TraitValue {
  const parts = splitTopLevel(expr, "&&");
  if (parts.length > 1) {
    for (const part of parts) {
      if (!isTruthy(evaluateRuntimeExpr(part, vars, funcs))) return false;
    }
    return true;
  }

  const call = parseCall(expr.trim());
  if (call) {
    const fn = funcs[call.name];
    if (!fn) return null;
    return fn(...call.args.map((arg) => parseValue(arg, vars, funcs)));
  }

  return parseValue(expr, vars, funcs);
}

function parseCall(expr: string): { name: string; args: string[] } | null {
  const open = expr.indexOf("(");
  if (open < 1 || !expr.endsWith(")")) return null;
  const name = expr.slice(0, open).trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const body = expr.slice(open + 1, -1);
  return { name, args: splitArgs(body) };
}

function parseValue(expr: string, vars: Record<string, TraitValue>, funcs: Record<string, RuntimeFunc>): TraitValue {
  const value = expr.trim();
  if (!value) return null;
  if (value === "null" || value === "undefined") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (isQuoted(value)) return value.slice(1, -1);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitArgs(value.slice(1, -1)).map((part) => parseValue(part, vars, funcs));
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    return parseObject(value.slice(1, -1), vars, funcs);
  }
  if (value.startsWith("$")) {
    return getVar(vars, value);
  }
  if (parseCall(value)) return evaluateRuntimeExpr(value, vars, funcs);
  return value;
}

function parseObject(
  body: string,
  vars: Record<string, TraitValue>,
  funcs: Record<string, RuntimeFunc>,
): Record<string, TraitValue> {
  const out: Record<string, TraitValue> = {};
  for (const entry of splitArgs(body)) {
    const parts = splitTopLevel(entry, ":");
    if (parts.length < 2) continue;
    const key = parts[0]?.trim() ?? "";
    if (!key) continue;
    out[stripQuotes(key)] = parseValue(parts.slice(1).join(":").trim(), vars, funcs);
  }
  return out;
}

function splitArgs(body: string): string[] {
  return splitTopLevel(body, ",").map((part) => part.trim()).filter(Boolean);
}

function splitTopLevel(body: string, delim: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escape = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] ?? "";
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) {
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
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
    if (depth === 0 && body.startsWith(delim, i)) {
      out.push(body.slice(start, i));
      i += delim.length - 1;
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

function getVar(vars: Record<string, TraitValue>, path: string): TraitValue {
  const parts = path.split(".");
  let current: TraitValue = vars[parts[0] ?? ""] ?? null;
  for (const part of parts.slice(1)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = current[part] ?? null;
  }
  return current;
}

function isQuoted(value: string): boolean {
  return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
}

function stripQuotes(value: string): string {
  return isQuoted(value) ? value.slice(1, -1) : value;
}

function isTruthy(value: TraitValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}
