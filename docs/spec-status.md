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

## Detailed References

- core model: [data-model.md](./data-model.md)
- high-level product/spec: [../README.md](../README.md)

## Open Questions

- Inheritance and `super: true` semantics: handler body merging vs chaining, trait override order under multi-inheritance, diamond resolution.
- Handler precondition vocabulary: fixed set (`accepts`, `within`, `after`) vs open-ended `when:` predicate reading committed state.
- Event refusal when preconditions fail: silent drop, `refused` event, or error effect?
- Cascade and reentrancy for ordinary events: cascade depth limit, termination guarantees, shape of the event log across cascades.
- Ongoing operations and their observation surface: a `<<#navigate>>` block starts a long-running op. How does `{{...}}` see "am I navigating?" or "how far along?" Is there an engine-managed `ongoing` map on `EntityState`, or do authors model this with traits?
- Effect ordering and conflict: when multiple effects write to the same trait in one commit, what wins — stable insertion order, author-declared priority, last-write-wins?
- Time, ticks, and scheduling: is there an engine clock adapter? A tick event? Where does `EventRecord.at` come from, and how do delayed or scheduled actions get expressed?
- Do we need staged or streaming commits for long-running events, or is atomic commit-on-settle enough for v1? (Narrower now that ongoing ops are kicked off via `<<...>>` and tracked in committed state, but still open.)
- Save/load format, including how in-flight events are handled across a restore.
- Failure modes for script evaluation and adapter calls: retry, skip, or emit a failure event?
