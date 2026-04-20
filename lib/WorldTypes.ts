import { JsonSchema, SerialValue } from "./CoreTypings";

export type EntityId = string;
export type EntityType = string;
export type TraitPath = string;
export type TraitValue = SerialValue;
export type HandlerName = string;
export type AnchorName = string;
export type EventId = string;
export type RunId = string;
export type OpId = string;
export type ScheduledId = string;

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Quat = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type TransformDef = {
  position: Vec3 | null;
  rotation: Quat | null;
};

export type TransformState = TransformDef;

export type HandlerDef = {
  when: string | null;
  super: boolean;
  action: string;
};

export type AnchorDef = {
  accepts: string[];
  capacity: number;
  offset: Vec3 | null;
  rotation: Quat | null;
};

export type EntityDefInput = {
  type: EntityType | null;
  inherits: EntityType[];
  traits: {
    public: Record<TraitPath, TraitValue>;
    private: Record<TraitPath, TraitValue>;
  };
  handlers: Record<HandlerName, HandlerDef>;
  anchors: Record<AnchorName, AnchorDef>;
  transform: TransformDef | null;
  tags: string[];
};

export type AuthoredWorld = Record<EntityId, EntityDefInput>;

export type EntityDef = EntityDefInput & {
  id: EntityId;
  type: EntityType;
};

export type AnchorState = {
  children: EntityId[];
};

export type OpStatus = "running" | "done" | "failed" | "cancelled";

export type OpState = {
  id: OpId;
  kind: string;
  status: OpStatus;
  target: EntityId | null;
  progress: number;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  error: string | null;
};

export type EntityState = {
  id: EntityId;
  traits: Record<TraitPath, TraitValue>;
  transform: TransformState | null;
  anchorState: Record<AnchorName, AnchorState>;
  status: Record<string, TraitValue>;
  ops: Record<OpId, OpState>;
};

export type KnowledgeVia = {
  eventId: EventId | null;
  actor: EntityId | null;
  note: string | null;
};

export type KnowledgeRecord = {
  id: string;
  holder: EntityId;
  subject: EntityId;
  path: TraitPath;
  value: TraitValue;
  via: KnowledgeVia;
  confidence: number;
  observedAt: number;
  lastConfirmedAt: number | null;
};

export type KnowledgeIndex = Record<string, KnowledgeRecord>;

export type EventInput = {
  type: string;
  actor: EntityId | null;
  target: EntityId | null;
  body: SerialValue;
  observers: EntityId[] | null;
};

export type EventRecord = EventInput & {
  id: EventId;
  run: RunId;
  parent: EventId | null;
  at: number;
};

export type RunStatus = "running" | "done" | "failed";

export type RunState = {
  id: RunId;
  status: RunStatus;
  root: EventId;
  queue: EventInput[];
  processed: EventId[];
  error: string | null;
};

export type ScheduledEvent = {
  id: ScheduledId;
  dueAt: number;
  event: EventInput;
  parent: EventId | null;
};

export type WorldState = {
  revision: number;
  clock: number;
  defs: Record<EntityId, EntityDef>;
  state: Record<EntityId, EntityState>;
  knowledge: KnowledgeIndex;
  events: EventRecord[];
  scheduled: ScheduledEvent[];
  runs: Record<RunId, RunState>;
};

export type WorldSnapshot = {
  revision: number;
  clock: number;
  defs: Record<EntityId, EntityDef>;
  state: Record<EntityId, EntityState>;
  knowledge: KnowledgeIndex;
  events: EventRecord[];
  scheduled: ScheduledEvent[];
};

export type AIRequest = {
  kind: "text" | "number" | "bool" | "json" | "enum" | "image_url";
  prompt: string;
  schema: JsonSchema | null;
  options: string[] | null;
  scope: {
    actor: EntityId | null;
    target: EntityId | null;
    visibleEntities: EntityId[];
    knownEntities: EntityId[];
    recentEventIds: EventId[];
  };
  cache: {
    key: string | null;
    ttlMs: number | null;
  };
  apply: {
    kind: "set_trait" | "emit_event" | "return_text";
    entity: EntityId | null;
    path: TraitPath | null;
  }[];
};

export type NavRequest =
  | { kind: "canSee"; observer: EntityId; subject: EntityId }
  | { kind: "pathTo"; from: EntityId; to: EntityId }
  | { kind: "navigate"; entity: EntityId; to: EntityId }
  | { kind: "cancel"; handle: string };

export type Effect =
  | { type: "set_trait"; entity: EntityId; path: TraitPath; value: TraitValue }
  | { type: "learn"; holder: EntityId; subject: EntityId; path: TraitPath; value: TraitValue; via: KnowledgeVia }
  | { type: "attach"; parent: EntityId; anchor: AnchorName; child: EntityId }
  | { type: "detach"; parent: EntityId; anchor: AnchorName; child: EntityId }
  | { type: "move"; entity: EntityId; to: string }
  | { type: "start_op"; entity: EntityId; op: OpState }
  | { type: "update_op"; entity: EntityId; op: OpId; patch: Partial<OpState> }
  | { type: "cancel_op"; entity: EntityId; op: OpId }
  | { type: "schedule_event"; event: EventInput; delay: number }
  | { type: "ai"; request: AIRequest }
  | { type: "nav"; request: NavRequest };

export type HandlerResult = {
  ok: boolean;
  effects: Effect[];
  emits: EventInput[];
};

export type ApplyError = {
  code: "cascade_limit" | "script_error" | "adapter_error" | "validation_error";
  message: string;
  event: EventId | null;
};

export type ApplyResult =
  | {
      ok: true;
      run: RunState;
      committed: EventRecord[];
      world: WorldState;
    }
  | {
      ok: false;
      run: RunState;
      committed: EventRecord[];
      error: ApplyError;
      world: WorldState;
    };

export type Query = {
  where: QueryFilter[];
  sort: QuerySort[];
  limit: number | null;
  select: QuerySelect;
};

export type QueryFilter =
  | { op: "type"; value: string }
  | { op: "tag"; value: string }
  | { op: "trait_eq"; path: TraitPath; value: TraitValue }
  | { op: "trait_in"; path: TraitPath; value: TraitValue[] }
  | { op: "visible_to"; observer: EntityId }
  | { op: "known_by"; holder: EntityId; path: TraitPath | null }
  | { op: "within"; entity: EntityId; distance: number }
  | { op: "handler_available"; actor: EntityId; name: HandlerName | null }
  | { op: "attached_to"; parent: EntityId; anchor: AnchorName | null };

export type QuerySort =
  | { op: "distance_to"; entity: EntityId; dir: "asc" | "desc" }
  | { op: "trait"; path: TraitPath; dir: "asc" | "desc" };

export type QuerySelect =
  | { kind: "entities" }
  | { kind: "ids" }
  | { kind: "traits"; paths: TraitPath[] };
