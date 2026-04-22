import { SerialValue } from "./CoreTypings";

// Generic graph walkers over entity relations.
// Zero knowledge of specific relation names. Author picks: "location", "loc", "place",
// "parent", "heldBy", "contains", etc. Pass the property name as `relation`.
//
// Relation values may be:
//   - a scalar entity id (string)            — single outbound edge
//   - an array of entity ids (string[])       — multiple outbound edges
//   - null / undefined / missing             — no edges
// Anything else is ignored.

export type EntityMap = Record<string, Record<string, SerialValue>>;

// Forward edges: ids that `id[relation]` points to. Scalar → 1-element array; array → many.
export function follow(entities: EntityMap, id: string, relation: string): string[] {
  const v = entities[id]?.[relation];
  return normalizeIds(v);
}

// Reverse edges: all entities X where `X[relation]` contains `id`.
export function neighbors(entities: EntityMap, id: string, relation: string): string[] {
  const out: string[] = [];
  for (const otherId of Object.keys(entities)) {
    if (otherId === id) continue;
    const v = entities[otherId]?.[relation];
    if (normalizeIds(v).includes(id)) out.push(otherId);
  }
  return out;
}

export type Direction = "forward" | "reverse" | "both";

export type ReachableOpts = {
  direction?: Direction; // default "both"
  depth?: number;        // hop cap; default Infinity; 0 = self only
  includeSelf?: boolean; // default true
};

// BFS over the relation in the requested direction(s). Cycle-safe. Depth-bounded.
export function reachable(
  entities: EntityMap,
  id: string,
  relation: string,
  opts: ReachableOpts = {},
): Set<string> {
  const { direction = "both", depth = Infinity, includeSelf = true } = opts;
  const visited = new Set<string>([id]);
  const queue: [string, number][] = [[id, 0]];
  while (queue.length) {
    const [cur, d] = queue.shift()!;
    if (d >= depth) continue;
    const next: string[] = [];
    if (direction === "forward" || direction === "both") next.push(...follow(entities, cur, relation));
    if (direction === "reverse" || direction === "both") next.push(...neighbors(entities, cur, relation));
    for (const n of next) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([n, d + 1]);
      }
    }
  }
  if (!includeSelf) visited.delete(id);
  return visited;
}

// Forward-only chain: [id, id.relation, id.relation.relation, ...]. Stops at missing edge, cycle, or `max`.
// Convention: single-target forward edge. If `id[relation]` is an array, only the first id is followed.
export function chain(
  entities: EntityMap,
  id: string,
  relation: string,
  max: number = Infinity,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur != null && !seen.has(cur) && path.length < max) {
    path.push(cur);
    seen.add(cur);
    cur = follow(entities, cur, relation)[0];
  }
  return path;
}

// Convenience: co-located by a chosen relation. All entities whose forward-relation target
// matches the observer's forward-relation target (i.e. share a parent/container).
export function siblings(entities: EntityMap, id: string, relation: string): string[] {
  const parent = follow(entities, id, relation)[0];
  if (!parent) return [];
  return neighbors(entities, parent, relation).filter((x) => x !== id);
}

// ---------------- internal ----------------

function normalizeIds(v: SerialValue | undefined): string[] {
  if (v == null) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}
