import { AuthoredWorldSchema } from "./WorldSchemas";
import { ExprEvalFunc, buildEvalFunctions, evaluateExprCore, parseExprCore } from "./ScriptEvaluator";
import { renderHandlebarsTemplate } from "./TemplateHelpers";
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
  WorldState,
} from "./WorldTypes";
import { SerialValue } from "./CoreTypings";

const MAX_EVENTS_PER_RUN = 1000;

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
      scripts: {},
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
    scripts: {},
    handlers: {},
    anchors: {},
    transform: null,
    tags: [],
  };

  for (const base of bases) {
    merged.traits.public = { ...merged.traits.public, ...base.traits.public };
    merged.traits.private = { ...merged.traits.private, ...base.traits.private };
    merged.scripts = { ...merged.scripts, ...base.scripts };
    merged.handlers = { ...merged.handlers, ...base.handlers };
    merged.anchors = { ...merged.anchors, ...base.anchors };
    merged.tags = [...merged.tags, ...base.tags];
    merged.transform = base.transform;
  }

  merged.traits.public = { ...merged.traits.public, ...def.traits.public };
  merged.traits.private = { ...merged.traits.private, ...def.traits.private };
  merged.scripts = { ...merged.scripts, ...def.scripts };
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
  const result = evaluateRuntimeExpr(expr, createVars(world, event, event.target), createPureFunctions(world));
  return isTruthy(result);
}

function evaluateAction(world: WorldState, event: EventRecord, action: string) {
  const effects: Effect[] = [];
  const emits: EventInput[] = [];
  evaluateScript(world, event, event.target, action, effects, emits);

  return { effects, emits };
}

function evaluateScript(
  world: WorldState,
  event: EventRecord,
  self: EntityId | null,
  script: string,
  effects: Effect[],
  emits: EventInput[],
) {
  const funcs = createActionFunctions(world, event, self, effects, emits);
  const vars = createVars(world, event, self);

  for (const raw of script.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("{{") && line.endsWith("}}")) {
      evaluateRuntimeExpr(unwrapTemplateExpr(line), vars, funcs);
      continue;
    }
    evaluateRuntimeExpr(line, vars, funcs);
  }
}

function createVars(world: WorldState, event: EventRecord, self: EntityId | null) {
  const vars: Record<string, SerialValue> = {
    "$actor": event.actor,
    "$target": event.target,
    "$self": self,
    "$event": serializeEvent(event),
  };
  if (self) {
    const state = world.state[self];
    if (state) {
      for (const [key, value] of Object.entries(state.traits)) {
        vars[key] = value;
      }
    }
  }
  for (const def of Object.values(world.defs)) {
    vars[def.id] = def.id;
    for (const key of Object.keys(def.scripts)) {
      vars[`${def.id}.${key}`] = `${def.id}.${key}`;
    }
  }
  addScopedScriptRefs(vars, world, "$self", self);
  addScopedScriptRefs(vars, world, "$actor", event.actor);
  addScopedScriptRefs(vars, world, "$target", event.target);
  addValueScriptRefs(vars, world);
  return vars;
}

function createPureFunctions(world: WorldState): Record<string, ExprEvalFunc> {
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
    getScript: (entity, key) => {
      if (typeof entity !== "string" || typeof key !== "string") return null;
      return world.defs[entity]?.scripts[key] ?? null;
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
  self: EntityId | null,
  effects: Effect[],
  emits: EventInput[],
): Record<string, ExprEvalFunc> {
  const vars = createVars(world, event, self);
  return {
    ...createPureFunctions(world),
    set: (path, value) => {
      if (!self || typeof path !== "string") return null;
      effects.push({ type: "set_trait", entity: self, path, value });
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
    run: (ref, key) => {
      const script = resolveScript(world, ref, key);
      if (!script) return null;
      evaluateScript(world, event, script.entity, script.body, effects, emits);
      return null;
    },
    say: (text) => {
      if (typeof text !== "string") return null;
      const body = renderHandlebarsTemplate(text, (expr) => evaluateRuntimeExpr(expr, vars, createPureFunctions(world)));
      emits.push({
        type: "say",
        actor: self,
        target: event.actor,
        body,
        observers: [],
      });
      return null;
    },
  };
}

function normalizeVia(value: SerialValue, event: EventRecord): KnowledgeVia {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      eventId: typeof value.eventId === "string" ? value.eventId : event.id,
      actor: typeof value.actor === "string" ? value.actor : event.actor,
      note: typeof value.note === "string" ? value.note : null,
    };
  }
  return { eventId: event.id, actor: event.actor, note: null };
}

function normalizeEventInput(value: SerialValue): EventInput | null {
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

function addScopedScriptRefs(vars: Record<string, SerialValue>, world: WorldState, name: string, entity: EntityId | null) {
  if (!entity) return;
  const def = world.defs[entity];
  if (!def) return;
  for (const key of Object.keys(def.scripts)) {
    vars[`${name}.${key}`] = `${entity}.${key}`;
  }
}

function addValueScriptRefs(vars: Record<string, SerialValue>, world: WorldState) {
  for (const [name, value] of Object.entries(vars)) {
    if (typeof value !== "string") continue;
    const def = world.defs[value];
    if (!def) continue;
    for (const key of Object.keys(def.scripts)) {
      vars[`${name}.${key}`] = `${value}.${key}`;
    }
  }
}

function resolveScript(world: WorldState, ref: SerialValue, key: SerialValue): { entity: EntityId; body: string } | null {
  if (typeof ref !== "string") return null;
  const parsed = typeof key === "string" ? { entity: ref, key } : parseScriptRef(ref);
  if (!parsed) return null;
  const body = world.defs[parsed.entity]?.scripts[parsed.key];
  if (typeof body !== "string") return null;
  return { entity: parsed.entity, body };
}

function parseScriptRef(ref: string): { entity: EntityId; key: string } | null {
  const i = ref.lastIndexOf(".");
  if (i <= 0 || i >= ref.length - 1) return null;
  return { entity: ref.slice(0, i), key: ref.slice(i + 1) };
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

function evaluateRuntimeExpr(expr: string, vars: Record<string, SerialValue>, funcs: Record<string, ExprEvalFunc>): SerialValue {
  const ast = parseExprCore(expr);
  if (!ast) return null;
  return evaluateExprCore(ast, vars, buildEvalFunctions(funcs));
}

function serializeEvent(event: EventRecord): Record<string, SerialValue> {
  return {
    id: event.id,
    run: event.run,
    parent: event.parent,
    type: event.type,
    actor: event.actor,
    target: event.target,
    body: event.body,
    at: event.at,
    observers: event.observers,
  };
}

function isTruthy(value: SerialValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}
