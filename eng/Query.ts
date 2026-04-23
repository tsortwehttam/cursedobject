import type { FacNode, Slot } from "./AST";
import type { SerialValue } from "../lib/CoreTypings";
import { matchHandler, matchSlot, type Facsimile, type Env, type FacEvent, type World } from "./Engine";
import { parsePattern } from "./Parser";

export type QueryMatch = { event: FacEvent; env: Env };
export type ActionQuery = {
  actor: SerialValue;
  target: SerialValue | null;
  value: SerialValue | null;
  obs: string[];
};
export type ActionMatch = {
  verb: string;
  handler: FacNode;
  env: Env;
};

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

export async function queryActions(engine: Facsimile, query: ActionQuery): Promise<ActionMatch[]> {
  const out: ActionMatch[] = [];
  for (const handler of engine.program) {
    const match = matchAction(handler, query);
    if (!match) continue;
    if (handler.cond && !(await engine.evalCond(handler.cond, match.env))) continue;
    out.push(match);
  }
  return out;
}

export function matchAction(handler: FacNode, query: ActionQuery): ActionMatch | null {
  const slots = handler.slots;
  if (slots.length < 2) return null;
  const verb = readVerb(slots[1]);
  if (!verb) return null;

  const env: Env = { $obs: query.obs, $actor: query.actor, $verb: verb };
  if (!matchSlot(slots[0], query.actor, env)) return null;

  if (query.target !== null) {
    if (slots.length < 3 || !matchSlot(slots[2], query.target, env)) return null;
    env["$target"] = query.target;
  }

  if (query.value !== null) {
    if (slots.length < 4 || !matchSlot(slots[3], query.value, env)) return null;
    env["$value"] = query.value;
  }

  return { verb, handler, env };
}

function readVerb(slot: Slot): string | null {
  if (slot.t !== "ref" || slot.segs.length !== 1) return null;
  const [seg] = slot.segs;
  return seg.wild ? null : seg.v;
}
