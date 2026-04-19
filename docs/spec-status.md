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

## Detailed References

- core model: [data-model.md](./data-model.md)
- high-level product/spec: [../README.md](../README.md)

## Open Questions

- Should navigation be represented through anchors, or as a separate but entity-backed graph layer?
- What is the smallest viable nav model that still supports authored spaces?
- Do we need staged or streaming commits for long-running events, or is atomic commit-on-settle enough for v1?
