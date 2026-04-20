# Spec Status

This file summarizes what has been agreed so far and what remains open.

It is the shortest current snapshot of the Facsimile spec.

## Agreed

- The engine centers on a small set of primitives: entities, traits, handlers, anchors, and events.
- Entity data should be split into `EntityDef` and `EntityState`.
- Traits describe world truth categories such as `public` and `private`, but truth, visibility, and per-entity knowledge must remain separate concepts.
- Knowledge should be represented as observer-owned records, not by copying facts onto the observer's traits.
- Current visibility should be derived from world state and perception rules, not stored inside knowledge records.
- Handlers should be declarative and return effects rather than mutating world state directly.
- AI-backed resolution should be engine-managed, even when author-facing syntax stays lightweight.
- The query model should be typed and object-shaped, inspired by Prisma/Mongo-style filters, not a string DSL.
- Prompt context should be assembled from layered, entity-relative views: stable base context, scene view, relevant knowledge, and recent interaction history.
- Event processing should be async at the engine boundary.
- Queries should remain immediate reads against the latest committed world state.
- The engine should distinguish between in-flight event work and committed state revisions.
- Anchors should stay generic and focused on attachment and relative positioning.
- Navigation, pathfinding, and line-of-sight are adapter-backed capabilities, not anchor extensions. The engine defines a minimal nav/spatial interface; hosts supply the implementation (entity-graph walker, tile-grid, 3D navmesh, etc.).
- Scripting uses two delimiter families with strict roles. `{{...}}` is sync-pure: it reads committed state, composes values, branches, and must not invoke adapter-backed work. `<<...>>` is the suspension-world: each block performs exactly one adapter-backed operation.
- `<<...>>` always takes a `#directive` prefix. Its body is parsed as positional tokens, not as an expression — there is no expression parser inside `<<...>>`.
- Every `<<...>>` directive supports an optional `binding :` prefix (for example, `<<#pathTo path : $actor Bob>>`). Without a binding, prose directives emit their result at position and non-prose directives are fire-and-forget.
- Adapter-backed work lowers to declarative effects. Handlers evaluate as a sequence of `{{...}}` blocks (sync) and `<<...>>` blocks (emit one effect, suspend, resume with binding). The expression evaluator never suspends mid-AST.
- AI-backed branching (`<<#if ...>> ... <<#end>>`, `<<#switch>>`) is not a separate construct. Authors bind a `#bool` or `#enum` result, then branch in `{{...}}`.
- Handler dispatch is always target-side. A handler lives on the entity being acted on; the event's `target` determines whose handler runs. Actor-side concerns (actor type, traits, range, ordering) are expressed as handler preconditions, not as a second handler layer.
- Event type names are namespaced with `/`. `.` is reserved for trait paths. Examples: `keyboard/upArrow`, `perceive/look_at`.
- Observer reactions are modeled as synthetic perceive events. After a primary event commits, the engine emits a `perceive/<primary_type>` event to each entity in the observer set. Each observer receives its own event with its own id, committed in stable order by observer id.
- `EventRecord` carries an optional `observers` field. `null` means the engine derives the observer set via the perception adapter. An explicit list is used as-is. An empty list means the event is fully private. The actor is excluded from the derived set by default.
- Perceive events do not themselves fan out further perceive events. `observers` is always `[]` on synthetic perceive events. This prevents infinite regress.
- Perceive event bodies reference the original event by id rather than inlining it.
- Perception modality is flat in v1. The event type plus the perception adapter together define what "observing" means (hearers for `talk_to`, seers for `look_at`, etc.). Structured modality is not a v1 concern.
- Handler chaining: `super: true` on a subclass handler runs the parent's handler body first, then the subclass's. There is no explicit `super()` call in action bodies. Without `super: true`, the subclass fully replaces the parent's handler.
- What merges under inheritance: only handler action bodies. Handler metadata (`accepts`, `within`, `after`, etc.) is not merged. A subclass either redeclares metadata (overriding) or omits it (inheriting parent's wholesale).
- Trait override: traits address per-leaf via dotted paths. Most-derived wins per leaf. Object-shaped trait values are opaque leaves; there is no deep merge.
- Multi-inheritance linearization: depth-first left-to-right, flat deduplication, last occurrence wins. Self always wins over ancestors.
- Anchors under inheritance: later-in-chain wins per anchor name, same rule as handlers and traits.
- Chain through multiple ancestors: the engine walks the linearized chain and runs each `super: true` handler in order from base to self. A non-super handler in the chain terminates inheritance at that point.
- Handler preconditions in v1 are a single optional `when:` expression. It is a sync `{{...}}` expression that reads committed state only (no adapter-backed calls), and must be truthy for the handler to run. Type checks, spatial checks, ordering — everything — expresses through `when:` via pure stdlib helpers.
- Failed preconditions silently drop the handler. No `refused` event, no error effect (revisit if authors need visibility).
- Common predicate patterns (`hasType`, `hasTag`, `within`, etc.) are pure helpers in the script stdlib that read adapter-materialized committed state. Spatial predicates work because the nav adapter maintains distance/adjacency state in committed state.
- Structured predicate sugar (`accepts`, `within` as dedicated fields, `after`, etc.) is deferred. Only added once real authored content shows the same pattern enough to justify a dedicated field.
- Each external input starts an event run with a FIFO queue. Handlers cannot recursively call `applyEvent`; they can only emit follow-up events into the run.
- Each event commits atomically after adapter resolution and effect validation. A multi-event run is not atomic; prior committed events are not rolled back if a later event fails.
- Cascade order is deterministic: append perceive events sorted by observer id, then append handler-emitted follow-up events in author order.
- Event runs have a configurable maximum committed-event limit; the v1 default is `1000`.
- `EventRecord` includes `run` and `parent` fields for cascade tracing.
- Effects apply in stable insertion order. If multiple effects write the same final slot in one commit, the later effect wins. There is no v1 priority system.
- Long-running operations are engine-managed through `EntityState.ops`, not author-modeled traits. Authors read operation status and progress through pure helpers.
- V1 uses atomic commit-on-settle per event. There are no staged or streaming commits.
- The engine owns a monotonic logical clock. Hosts drive it; `EventRecord.at` is assigned at commit time.
- A `tick` is just an event. Delayed actions use `schedule_event` effects.
- V1 save/load is snapshot-based and stores committed state only. In-flight handler continuations, pending adapter calls, and active run queues are not durable.
- Runtime failures fail the current event without committing its effects. Failed `when:` evaluation is the exception and silently drops the handler.
- V1 has no author-facing fallback syntax for `<<...>>` directives. Retries and provider fallback are adapter policy.
- V1 has a fixed initial script helper surface split into pure helpers and action helpers.
- Authored YAML validates through a minimum Zod schema set before runtime construction.
- The data model includes a worked event-run trace showing dispatch, effects, perception fanout, queue order, and committed state.

## Detailed References

- core model: [data-model.md](./data-model.md)
- high-level product/spec: [../README.md](../README.md)

## Remaining Implementation Work

- Implement full handler inheritance chaining.
- Expand the script action parser beyond simple helper-call lines.
- Implement the typed query API and query-backed stdlib helpers.
- Add adapter-backed `<<...>>` directives for AI and navigation.
