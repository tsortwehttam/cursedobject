# Data Model

This document captures the current concrete direction for Facsimile's core runtime model.

It is intentionally more implementation-shaped than the README. The goal is to make the current architectural decisions explicit enough that we can start building against them.

## Principles

- Keep authored definition separate from runtime state.
- Keep truth separate from visibility and per-entity knowledge.
- Keep handlers declarative.
- Keep AI as an engine-managed capability, not an escape hatch.
- Prefer a small number of generic primitives over semantic taxonomies.

## Core Types

These are conceptual shapes, not yet final TypeScript.

```ts
type EntityId = string;
type EntityType = string;
type TraitPath = string;
type TraitValue = SerialValue;
type HandlerName = string;
type AnchorName = string;
type EventId = string;
```

## Entity Model

The canonical entity model is split into authored definition and runtime state.

### `EntityDef`

`EntityDef` is the authored, inherited, mostly static shape of an entity.

```ts
type EntityDef = {
  id: EntityId;
  type: EntityType;
  inherits: EntityType[];
  traits: {
    public: Record<string, TraitValue>;
    private: Record<string, TraitValue>;
  };
  handlers: Record<HandlerName, HandlerDef>;
  anchors: Record<AnchorName, AnchorDef>;
  transform: TransformDef | null;
  tags: string[];
};
```

Notes:

- `id` is the concrete entity identifier in the world.
- `type` is the entity's primary authored kind.
- `inherits` supports prefab-like reuse and base definitions.
- `traits.public` and `traits.private` describe authored truth categories, not observer knowledge.
- `handlers` and `anchors` live primarily in the definition layer.
- `tags` are a lightweight classification mechanism for filtering and conventions.

### Inheritance

`inherits` resolves into a linearized chain (the MRO) that the engine walks to produce the effective `EntityDef`.

#### Linearization

- Depth-first, left-to-right.
- Flat deduplication: if an ancestor appears multiple times, only the last occurrence is kept.
- Self always wins over ancestors.

There is no Python-style C3 diamond enforcement in v1. If the author creates an ambiguous diamond, the rule above resolves it deterministically but without ceremony.

#### Traits

Traits address per-leaf via dotted paths (`tattoo.shape`, `beliefs.police`). Most-derived wins per leaf. Object-shaped trait values are treated as opaque leaves — there is no deep object merge. Authors who want composition split the value into paths.

#### Anchors

Anchors are replaced per name. The most-derived `AnchorDef` for a given name wins.

#### Handlers

By default, a subclass handler fully replaces the parent's handler for that name.

A subclass handler may declare `super: true`, in which case:

1. the parent's action body runs first,
2. then the subclass's action body runs.

Both bodies run against the same handler invocation and return effects that are concatenated in order (parent effects first, subclass effects second).

The engine walks the linearized chain to resolve chaining. A chain runs from base to self, including every ancestor that has `super: true` on that handler. A non-super handler anywhere in the chain terminates inheritance at that point — that ancestor is treating its own parent as fully replaced.

There is no explicit `super()` call inside action bodies. Subclass bodies always run after parent bodies. Fine-grained control ("run parent in the middle of subclass logic") is not a v1 concern.

#### Handler metadata merging

Handler metadata (`accepts`, `within`, `after`, and any future structured preconditions) is not merged under `super: true`. A subclass either redeclares metadata (overriding wholesale) or omits it (inheriting parent's metadata wholesale). This avoids the ambiguity of partial predicate merges where a missing field could mean either "inherit" or "clear."

### `EntityState`

`EntityState` is the mutable runtime shape of an entity.

```ts
type EntityState = {
  id: EntityId;
  traits: Record<TraitPath, TraitValue>;
  transform: TransformState | null;
  anchorState: Record<AnchorName, AnchorState>;
  status: Record<string, TraitValue>;
};
```

Notes:

- `traits` should be flattened and resolved for efficient runtime lookup.
- `anchorState` stores occupancy and attachment relationships.
- `status` is for transient runtime-only state like cooldowns, temporary modes, or ephemeral flags.
- `status` exists to keep long-lived authored traits from becoming a junk drawer for execution state.

### `WorldState`

```ts
type WorldState = {
  defs: Record<EntityId, EntityDef>;
  state: Record<EntityId, EntityState>;
  knowledge: KnowledgeIndex;
  events: EventRecord[];
};
```

Notes:

- `defs` and `state` are intentionally separate.
- `knowledge` is global storage of observer-owned knowledge records.
- `events` is the immutable event log.

## Traits

Traits describe world state.

They should support at least:

- `public`: generally observable facts when perception conditions are met
- `private`: facts that are true of an entity but not automatically observable

Important distinction:

- truth is what is true in the world
- visibility is what an observer can currently perceive
- knowledge is what an observer has learned and may remember

These should not be collapsed into one representation.

Traits may sometimes be structured values and may sometimes be natural-language descriptors. But even when prose is supported, canonical trait addressing should stay path-based where possible, such as:

- `hair_color`
- `tattoo.shape`
- `beliefs.police`
- `goals.convince_juror_3`

That keeps querying, knowledge records, and prompt assembly tractable.

## Knowledge Model

Knowledge is relational and observer-owned.

The engine should not model knowledge by copying source entity traits onto the observer. Instead, it should store records describing what one entity believes or knows about another entity.

### `KnowledgeRecord`

```ts
type KnowledgeRecord = {
  id: string;
  holder: EntityId;
  subject: EntityId;
  path: TraitPath;
  value: TraitValue;
  via: {
    eventId: EventId | null;
    actor: EntityId | null;
    note: string | null;
  };
  confidence: number;
  observedAt: number;
  lastConfirmedAt: number | null;
};
```

Notes:

- `holder` is the entity that knows or believes the fact.
- `subject` is the entity the fact is about.
- `path` and `value` identify the claimed fact.
- `via` stores light provenance without over-taxonomizing knowledge sources.
- `confidence` allows room for uncertainty, lies, rumor, or inference.
- `lastConfirmedAt` separates initial learning from later reconfirmation.

### Visibility vs knowledge

Visibility should not be stored in `KnowledgeRecord`.

Instead, the engine should expose separate capabilities such as:

```ts
canPerceive(observer, subject, path) -> boolean
recall(observer, subject, path) -> KnowledgeRecord | null
```

This separation matters because:

- something can stop being visible but remain known
- something can be visible but not yet noticed or learned
- a known fact can become stale or unreliable

### Knowledge operations

The minimum useful operations are:

```ts
learn(holder, subject, path, value, via) -> KnowledgeRecord
forget(holder, subject, path) -> void
recall(holder, subject, path) -> KnowledgeRecord | null
queryKnowledge(holder, filter) -> KnowledgeRecord[]
```

Higher-order theory of mind such as "Alice knows Bob knows X" should not be a v1 requirement.

## Handlers and Effects

Handlers should be declarative. They should not directly mutate world state or call adapters.

### `HandlerContext`

```ts
type HandlerContext = {
  event: EventRecord;
  actor: EntityId;
  target: EntityId | null;
  world: WorldView;
};
```

### `HandlerResult`

```ts
type HandlerResult = {
  ok: boolean;
  effects: Effect[];
  emits: EventRecord[];
};
```

### `Effect`

```ts
type Effect =
  | { type: "set_trait"; entity: EntityId; path: TraitPath; value: TraitValue }
  | { type: "learn"; holder: EntityId; subject: EntityId; path: TraitPath; value: TraitValue; via: KnowledgeRecord["via"] }
  | { type: "attach"; parent: EntityId; anchor: AnchorName; child: EntityId }
  | { type: "detach"; parent: EntityId; anchor: AnchorName; child: EntityId }
  | { type: "move"; entity: EntityId; to: string }
  | { type: "ai"; request: AIRequest }
  | { type: "nav"; request: NavRequest };
```

Notes:

- handlers return intended state transitions as effects
- the engine validates and applies them in deterministic order
- `learn` is an explicit effect, not an implicit side effect of reading traits
- adapter-backed work (AI, nav, line-of-sight, future I/O) is represented internally as engine-managed effects and resolved through the corresponding adapter

### Execution flow

The minimum useful execution flow is:

1. accept an input event
2. resolve a matching handler
3. evaluate whether the handler can run
4. produce effects and follow-up events
5. let the engine apply effects
6. append resulting events to the log

This keeps replay, testing, debugging, and async integration much cleaner than direct mutation.

### Dispatch

Dispatch is always target-side. A handler lives on the entity being acted on; the event's `target` determines whose handler runs. `Painting_1.look_at` runs when `{ type: "look_at", target: Painting_1 }` fires. `$input.keyboard/upArrow` runs when the input system emits a keyboard event. `move_to` dispatches to the destination location.

There is no separate actor-side dispatch. Actor-side concerns (actor type, actor traits, range, ordering) are expressed as handler preconditions, not as a second handler layer.

Event type names are namespaced with `/`. Examples: `keyboard/upArrow`, `perceive/look_at`, `perceive/talk_to`. `.` is reserved for trait paths.

## Runtime Processing Model

Event processing is async at the engine boundary.

The public runtime contract should treat each incoming event as an async job that may require adapter-backed resolution before its resulting state changes can be committed.

At the same time, most core engine operations should remain synchronous internally, including:

- world queries against committed state
- in-memory trait and knowledge updates
- perception checks
- deterministic script evaluation
- effect application
- event-log append on commit

### Event API shape

The default event API should be async:

```ts
applyEvent(event, world) -> Promise<ApplyResult>
```

Queries should remain immediate reads against the latest committed state:

```ts
queryWorld(query, world) -> QueryResult
```

The runtime may also expose explicit waiting APIs such as:

```ts
waitForEvent(eventId) -> Promise<void>
waitForIdle() -> Promise<void>
```

### Committed state

The engine should distinguish between in-flight event work and committed world state.

- queries read from the latest committed revision
- pending async work is not partially visible by default
- completed events advance the committed world revision
- callers may choose between reading the current committed world immediately or waiting for pending event work to settle

### Async boundary

Async resolution should happen only through engine-managed constructs such as:

- AI-backed interpolation like `<< ... >>`
- classification or generation steps
- other adapter-backed external resolution

Authors should not need to reason about sync-safe vs async-safe event handlers. If authored logic requires external resolution, the engine should suspend and resume that event internally.

### Deterministic application

Even when resolution is async, committed mutation should still happen in a controlled engine step after the necessary external work finishes.

That keeps the important invariant intact:

- event execution may suspend
- world reads remain immediate against committed state
- state commits remain centralized and inspectable

## Scripting Execution Model

Authored scripting uses two delimiter families with strict, non-overlapping roles.

### `{{...}}` — sync, pure

`{{...}}` is the logical/composition layer.

- reads committed world state and in-scope bindings
- composes values with pure operators and functions
- branches with `{{#if}}`, `{{#switch}}`, etc.
- never invokes adapter-backed work
- never suspends

The validator rejects any reference to adapter-backed directives or functions inside `{{...}}`.

### `<<...>>` — suspension, one adapter call per block

`<<...>>` is the I/O layer. Each block performs exactly one adapter-backed operation.

Grammar:

```
<<# directive [binding :] body>>
```

- `directive` names the operation, for example `text`, `number`, `bool`, `enum`, `JSON`, `image:url`, `navigate`, `pathTo`, `canSee`.
- `binding :` is optional. When present, the result is bound to the given name in the enclosing handler scope.
- `body` is parsed as positional tokens: `$var` references resolve against scope, bare identifiers are entity references, and for prose directives (`#text`, `#bool`, `#enum`, etc.) the remainder is the prompt.
- There is no expression parser inside `<<...>>`. Arithmetic, composition, and branching live in `{{...}}`.

`{{...}}` interpolation inside a prompt body is allowed. The engine resolves those pure values first, bakes the string, then dispatches the adapter call.

Examples:

```yaml
<<#navigate $actor $target>>                           # fire and forget
<<#pathTo path : $actor Bob>>                          # bind path
<<#canSee visible : $actor Bob>>                       # bind bool
<<#text describe a scary place>>                       # emit at position
<<#text desc : describe a scary place>>                # bind to desc
<<#bool ok : Is it cold here?>>                        # bind bool
<<#enum mood : happy|sad|angry : What mood is Bob in?>>
```

Without a binding:

- prose directives (`#text`, `#image:url`, etc.) emit their result at position in the rendered string
- non-prose directives are fire-and-forget; the result is discarded

### Execution

A handler action is a sequence of `{{...}}` and `<<...>>` blocks.

- `{{...}}` blocks evaluate synchronously against the current environment (committed state plus bindings accumulated so far).
- `<<...>>` blocks emit one effect, the handler suspends, the engine resolves the effect through the appropriate adapter, the result is written into scope under the declared binding (or dropped, or emitted), and the handler resumes.

The expression evaluator never suspends mid-AST. Suspension happens at block boundaries.

### Parallelism

When the engine sees multiple `<<...>>` blocks with no binding dependency between them, it is free to dispatch them in parallel and wait on the group. Authors do not reason about this.

### Collapsing AI-branching forms

AI-backed branching is not a separate construct. Authors bind a `#bool` or `#enum` result and then branch in `{{...}}`:

```yaml
<<#bool romantic : Does Jim feel romantic toward Sue?>>
{{#if romantic}}
  something
{{#end}}

<<#enum sentiment : angry|happy|neutral : {{$input}}>>
{{#switch sentiment}}
  {{#case angry}} something
  {{#case happy}} something else
{{#end}}
```

There is one way to do conditional dispatch over adapter-backed results.

## AI Resolution

AI-backed behavior should be author-facing through normal authored constructs like:

- `<< ... >>`
- `<<#JSON ... >>`
- `talk_to` behavior
- helper functions that imply AI-backed resolution

Internally, the engine may lower those into an AI effect.

```ts
type AIScope = {
  actor: EntityId | null;
  target: EntityId | null;
  visibleEntities: EntityId[];
  knownEntities: EntityId[];
  recentEventIds: EventId[];
};
```

```ts
type AIApplyRule = {
  kind: "set_trait" | "emit_event" | "return_text";
  entity: EntityId | null;
  path: TraitPath | null;
};
```

Notes:

- this is an internal engine shape, not required authoring syntax
- AI work should remain explicit and engine-managed
- the engine should be free to cache, retry, log, or replay around these requests
- the canonical AI request shape is defined in the AI interpolation contract below

## AI Interpolation Contract

AI-backed interpolation should have a small fixed author-facing surface and a strict normalized runtime contract.

### Author-facing forms

The initial supported forms should be:

- `<<prompt>>` for text
- `<<#number prompt>>` for numeric output
- `<<#bool prompt>>` for boolean classification
- `<<#JSON prompt>>` for structured object output
- `<<#enum a|b|c : prompt>>` for closed-label classification
- `<<#image:url prompt>>` for generated asset references

The engine should avoid proliferating directives until real use cases require them.

### Normalized request

```ts
type AIRequest = {
  kind: "text" | "number" | "bool" | "json" | "enum" | "image_url";
  prompt: string;
  schema: JsonSchema | null;
  options: string[] | null;
  scope: AIScope;
  cache: {
    key: string | null;
    ttlMs: number | null;
  };
  apply: AIApplyRule[];
};
```

Rules:

- `text` returns a string
- `number` must parse to a number
- `bool` must parse to a boolean
- `json` must validate against schema
- `enum` must resolve to exactly one allowed option
- `image_url` returns an asset reference rather than raw binary data
- `apply` describes how a successful result is applied back into the runtime when the request is used as part of handler execution

### Normalized response

```ts
type AIResult =
  | { ok: true; value: string | number | boolean | Record<string, SerialValue>; raw: string }
  | { ok: false; error: string; raw: string | null };
```

For image generation, the runtime may use a dedicated variant:

```ts
type AIImageResult =
  | { ok: true; url: string; raw: string | null }
  | { ok: false; error: string; raw: string | null };
```

### Contract rules

- every AI interpolation compiles to an explicit typed request
- every non-text AI result must be validated before use
- invalid structured output is a failed resolution, not a best-effort partial success
- the runtime may cache on normalized request plus scope
- `<<#JSON ...>>` without a schema should be discouraged or disallowed

## Prompt Context Assembly

Prompt context should be assembled from layered, entity-relative views rather than raw world dumps.

The runtime should compose only the information relevant to the current actor, purpose, and task.

### Layered context model

The default context model should have four layers:

1. stable base context
2. derived scene view
3. relevant knowledge and memory
4. recent interaction window

### `PromptContext`

```ts
type PromptContext = {
  base: string[];
  scene: string[];
  knowledge: string[];
  recent: string[];
};
```

### Assembly API

```ts
buildPromptContext({
  purpose,
  actor,
  target,
  world,
  recentEventIds,
}) -> PromptContext
```

### Layer definitions

#### Base context

Rarely changing identity and role information, such as:

- character identity
- persistent biography
- stable goals
- authored scenario framing
- speech style
- purpose-specific system instructions

This layer should be cached aggressively per entity and purpose.

#### Scene view

The entity-relative current world view, such as:

- current location
- visible entities
- visible traits of those entities
- current conversation partners
- nearby available handlers
- salient room state

This layer should be assembled from queries, not from raw whole-world serialization.

#### Knowledge and memory

The slice of remembered facts relevant to the current task, such as:

- what the actor knows about the current target
- remembered testimony or conversation facts
- suspicions, commitments, and unresolved goals
- recent high-confidence or emotionally salient facts

This layer should be filtered by relevance and salience rather than dumped wholesale.

#### Recent interaction

A bounded rolling window of recent conversation and events, such as:

- the last N dialogue turns
- the last N directly relevant events
- any explicitly referenced events

This layer should stay small.

### Scoping rules

- all prompt context is assembled relative to the requesting entity
- visible facts come from perception queries
- remembered facts come from knowledge records
- recent events should be filtered to what the actor experienced, perceived, or was told
- purpose-specific instructions should be layered in separately from world facts

### Caching strategy

Context should be cached by layer rather than only by the final rendered prompt.

Recommended cache keys:

- base context: `entity + purpose + stable revision`
- scene view: `entity + visibility/location revision`
- knowledge slice: `entity + purpose + knowledge revision`
- recent window: `entity + recent event tail revision`

### Salience

The runtime should rank and trim candidate facts before prompt assembly.

Even a simple salience model is useful. Early heuristics should prefer:

- facts about the current target
- facts referenced by the current event
- facts tied to active goals
- recent facts
- high-confidence facts
- emotionally charged or conflict-relevant facts

## Nav and Spatial Adapters

Navigation, pathfinding, and line-of-sight are adapter-backed capabilities. The engine does not bake in a specific spatial model. A host plugs in whatever fits its world: an entity-graph walker for room-based IF, a tile-grid A*, a 3D navmesh, a full physics raycaster.

This keeps the same authored world runnable under wildly different renderers and removes the pressure to pick "the" nav model at the engine layer.

### `NavAdapter`

```ts
type NavAdapter = {
  canSee(observer: EntityId, subject: EntityId, world: WorldView) -> Promise<boolean> | boolean;
  pathTo(from: EntityId, to: EntityId, world: WorldView) -> Promise<NavPath | null> | NavPath | null;
  navigate(entity: EntityId, to: EntityId, world: WorldView) -> Promise<NavHandle>;
  progress(handle: NavHandle, world: WorldView) -> number;
  cancel(handle: NavHandle) -> void;
};
```

- `canSee` and `pathTo` are point queries. Adapters may answer synchronously or asynchronously; the engine treats them uniformly.
- `navigate` starts an ongoing operation and returns a handle.
- `progress` reads progress in `0..1` against committed state. It is sync because the adapter is expected to commit progress updates into world state as it ticks.
- `cancel` aborts an ongoing op.

### `NavRequest`

```ts
type NavRequest =
  | { kind: "canSee"; observer: EntityId; subject: EntityId }
  | { kind: "pathTo"; from: EntityId; to: EntityId }
  | { kind: "navigate"; entity: EntityId; to: EntityId }
  | { kind: "cancel"; handle: NavHandle };
```

### Author-facing surface

Nav is reached exclusively through `<<...>>` directives:

```yaml
<<#canSee visible : $actor Bob>>
<<#pathTo path : $actor Bob>>
<<#navigate $actor Bob>>
```

Point-query results bind through the normal `binding :` mechanism. Ongoing operations are kicked off as fire-and-forget; the adapter writes status and progress into committed state, which `{{...}}` can then read synchronously.

### Determinism and replay

Adapter results for point queries should be logged alongside the event that produced them so replay can reproduce handler outcomes without rerunning the host adapter. Ongoing operations replay through their committed state trail.

## Anchors

Anchors should stay generic and narrowly scoped.

### `AnchorDef`

```ts
type AnchorDef = {
  accepts: string[];
  capacity: number;
  offset: Vec3 | null;
  rotation: Quat | null;
};
```

### `AnchorState`

```ts
type AnchorState = {
  children: EntityId[];
};
```

Notes:

- anchors are for attachment and relative positioning
- anchors should not be subdivided into semantic taxonomies unless those distinctions materially change engine behavior
- navigation is adapter-backed (see "Nav and Spatial Adapters" above), not an anchor extension

## Events

Events are immutable records of what happened.

```ts
type EventRecord = {
  id: EventId;
  type: string;
  actor: EntityId | null;
  target: EntityId | null;
  body: SerialValue;
  at: number;
  observers: EntityId[] | null;
};
```

The event log is used for:

- replay
- debugging
- recent-history queries
- AI context assembly
- deterministic testing

### `observers`

`observers` controls who is considered to have perceived the event and therefore receives the perceive fanout.

- `null` (unset): the engine derives the observer set via the perception adapter (nav/LOS plus other perception rules).
- explicit list: engine uses it as-is, skipping derivation. Useful for whispers, radios, letters, and any case where the author knows exactly who perceives.
- `[]` (empty list): the event is fully private. Nobody perceives it.

The event's `actor` is excluded from the derived observer set by default. An author can include the actor explicitly if they want the actor's own perceive handler to fire.

## Perception Fanout

After a primary event commits, the engine fans out a synthetic perceive event to each entity in `observers`.

### Type naming

The perceive event type is `perceive/<primary_type>`. If the primary event is `look_at`, each observer receives a `perceive/look_at` event. If the primary is `talk_to`, observers receive `perceive/talk_to`. This keeps dispatch uniform: observer handlers target the namespaced perceive type directly rather than a generic `perceived` with a payload switch.

### Shape

```ts
// example of a fanned-out perceive event
{
  id: "evt_...",
  type: "perceive/look_at",
  actor: "Bob",            // actor of the original event
  target: "Alice",         // the perceiver
  body: { of: "evt_..." }, // reference to the original event id
  at: ...,
  observers: []            // perceive events never re-fan
}
```

The body carries a pointer to the original event by id, not an inlined copy. Authors dereference the original from the event log if they need details.

### Rules

- perceive events do not themselves fan out further perceive events. `observers` is always `[]` on synthetic perceive events. This avoids infinite regress.
- perceive events commit as their own events, in stable order by observer id, after the primary event's commit.
- each observer's handler may emit new effects and events. Any new events it emits go through the normal pipeline, including generating their own perception fanout.

### Modality

Perception modality is flat in v1. The event type plus the perception adapter together determine what "observing" means — hearers for `talk_to`, seers for `look_at`, and so on. Structured modality (`{ see: [...], hear: [...] }`) is not a v1 concern and can be added additively if it earns its keep.

## Open Questions

The following remain unresolved and should stay in the README-level spec until answered:

- inheritance and `super: true` semantics: handler body merging vs chaining, trait override order under multi-inheritance, diamond resolution
- handler precondition vocabulary: fixed set (`accepts`, `within`, `after`) vs open-ended `when:` predicate reading committed state
- event refusal when preconditions fail: silent drop, `refused` event, or error effect?
- cascade and reentrancy for ordinary events: cascade depth limit, termination guarantees, log shape
- effect ordering when multiple effects in one commit target the same trait
- ongoing operation state: is there an engine-managed `ongoing` map on `EntityState` exposing progress and handles, or do authors model this with traits?
- time, ticks, and scheduling: clock adapter, tick events, delayed effects
- save/load format, including treatment of in-flight events
- failure modes for adapter calls and script evaluation: retry, skip, emit failure event?

## Query Model

The engine should start with a typed, object-shaped query API rather than a string DSL.

This should borrow from Prisma-style and Mongo-style query objects, but only in shape, not in breadth. The goal is a narrow structural query model that is easy to validate, optimize, and expose across runtimes.

Rich logic belongs in the scripting layer. Queries should stay declarative and limited to common lookup patterns.

### `Query`

```ts
type Query = {
  where: QueryFilter[];
  sort: QuerySort[];
  limit: number | null;
  select: QuerySelect;
};
```

### `QueryFilter`

```ts
type QueryFilter =
  | { op: "type"; value: string }
  | { op: "tag"; value: string }
  | { op: "trait_eq"; path: TraitPath; value: TraitValue }
  | { op: "trait_in"; path: TraitPath; value: TraitValue[] }
  | { op: "visible_to"; observer: EntityId }
  | { op: "known_by"; holder: EntityId; path: TraitPath | null }
  | { op: "within"; entity: EntityId; distance: number }
  | { op: "handler_available"; actor: EntityId; name: HandlerName | null }
  | { op: "attached_to"; parent: EntityId; anchor: AnchorName | null };
```

### `QuerySort`

```ts
type QuerySort =
  | { op: "distance_to"; entity: EntityId; dir: "asc" | "desc" }
  | { op: "trait"; path: TraitPath; dir: "asc" | "desc" };
```

### `QuerySelect`

```ts
type QuerySelect =
  | { kind: "entities" }
  | { kind: "ids" }
  | { kind: "traits"; paths: TraitPath[] };
```

Notes:

- filters compose with implicit `and` in v1
- v1 should not support arbitrary nested boolean logic
- if more expressive composition is needed later, it should be added sparingly
- this model should cover world, visibility, knowledge, attachment, and action-availability lookups without becoming a second programming language
