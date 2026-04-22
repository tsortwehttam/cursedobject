import type { Env, FacEvent, World } from "./Engine";
import { matchHandler } from "./Engine";
import { parsePattern } from "./Parser";

export type QueryMatch = { event: FacEvent; env: Env };

// Parse a slot-pattern string and return all world.events that match, along with wildcard bindings.
// Pattern grammar mirrors handler heads: literals, $wild, *, regex, numbers, and trailing `...` for rest.
export function queryEvents(world: World, pattern: string): QueryMatch[] {
  const node = parsePattern(pattern);
  // Query patterns are permissive: if the author didn't end with `...`, treat it as a prefix match.
  const last = node.slots[node.slots.length - 1];
  if (!last || last.t !== "rest") {
    node.slots = [...node.slots, { t: "rest" }];
  }
  const out: QueryMatch[] = [];
  for (const event of world.events) {
    const env = matchHandler(node, event);
    if (env) out.push({ event, env });
  }
  return out;
}

// Same as queryEvents but returns only the events (no bindings).
export function selectEvents(world: World, pattern: string): FacEvent[] {
  return queryEvents(world, pattern).map((m) => m.event);
}
