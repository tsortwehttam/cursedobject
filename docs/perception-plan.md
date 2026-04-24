# Perception & Scene Context Plan

Goal: let AI-voiced entities see what they can plausibly perceive (nearby entities, their observable traits) without leaking private state.

## Model

- **Relation graph** (author-defined): any property like `.location`, `.loc`, `.heldBy`, `.parent` is an edge. Engine walks generically. No hardcoded relation name.
- **Perceivability convention**: `entity.public` subtree = externally visible. Everything else is private.
- **Observer rule**: observer sees own full entity; others filtered to `.public`.

## Components

| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | `lib/Relations.ts` | `follow` / `neighbors` / `reachable` / `chain` / `siblings` over any relation prop | done |
| 2 | `lib/Perceivability.ts` | `publicProjection(entity)` — returns `entity.public ?? {}` | todo |
| 3 | `eng/Adapter.ts` | `collectScene(world, observerId, { relation, depth })` — observer full + others public-only | todo |
| 4 | `eng/AIAdapter.ts` | `scene` clause tag in `<<chat>>` (and variants: `scene via <rel>`, `scene via <rel> depth <n>`) | todo |
| 5 | tests | relations ✓ ; perceivability ; scene-adapter ; chat-scene integration | 1/4 |

## Invocation target

```
<<chat
  as Bob ;
  scene ;                   // defaults: via location, depth 2
  on * sayto Bob ;
  Respond as Bob.
>>
```

Override: `scene via loc depth 3`.

## Semantics of `scene`

1. Resolve observer's full self → included verbatim.
2. BFS `reachable(observerId, relation, { direction: "both", depth })` over chosen relation.
3. For each other id in that set: include `publicProjection(entity)` keyed by id.
4. Merge into prompt's state/context block.

## Out of scope (v0)

- Asymmetric perception (disguise, faction, sensor type).
- Multi-relation scene (single relation per invocation).
- Distinct earshot vs line-of-sight.
- Per-property perceivability tags beyond `.public` subtree.

Extension hooks reserved:
- `publicProjectionFor(viewerId, targetId, world)` — replace flat projection.
- `collectScene` accepts a filter fn.

## Order of implementation

1. ✅ `lib/Relations.ts` + tests
2. `lib/Perceivability.ts` + tests
3. `eng/Adapter.ts` → `collectScene` + tests
4. `eng/AIAdapter.ts` → `scene` clause wired into `<<chat>>` + integration test
