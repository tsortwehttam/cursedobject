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

## Detailed References

- core model: [data-model.md](./data-model.md)
- high-level product/spec: [../README.md](../README.md)

## Open Questions

- Handler dispatch and the observer model: when an event fires, whose handlers run — the target's, the actor's, both? How do bystanders who perceive an event react? Is there a distinct observer-handler concept, or does everything go through the same dispatch with perception as a predicate?
- Inheritance and `super: true` semantics: handler body merging vs chaining, trait override order under multi-inheritance, diamond resolution.
- Ongoing operations and their observation surface: a `<<#navigate>>` block starts a long-running op. How does `{{...}}` see "am I navigating?" or "how far along?" Is there an engine-managed `ongoing` map on `EntityState`, or do authors model this with traits?
- Effect ordering and conflict: when multiple effects write to the same trait in one commit, what wins — stable insertion order, author-declared priority, last-write-wins?
- Time, ticks, and scheduling: is there an engine clock adapter? A tick event? Where does `EventRecord.at` come from, and how do delayed or scheduled actions get expressed?
- Do we need staged or streaming commits for long-running events, or is atomic commit-on-settle enough for v1? (Narrower now that ongoing ops are kicked off via `<<...>>` and tracked in committed state, but still open.)
- Save/load format, including how in-flight events are handled across a restore.
- Failure modes for script evaluation and adapter calls: retry, skip, or emit a failure event?
