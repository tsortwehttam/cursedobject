import type { SerialValue } from "../lib/CoreTypings";
import type { EntityData, Facsimile } from "./Engine";
import { queryActions } from "./Query";

const OBS = ["Grace", "Trip"];
const COMMANDS: Record<string, string> = {
  drop: "drop",
  giveto: "give",
  hit: "hit",
  hug: "hug",
  kiss: "kiss",
  knock: "knock",
  listen: "listen",
  lookat: "look",
  pickup: "pick up",
  push: "push",
  slap: "slap",
  touch: "touch",
  use: "use",
};
const HIDDEN = new Set(["unknown", "sayto"]);

export async function listREPLActions(engine: Facsimile): Promise<string[]> {
  const player = engine.world.entities.Player ?? {};
  const here = typeof player.location === "string" ? player.location : null;
  const held = typeof player.holding === "string" && player.holding !== "nothing" ? player.holding : null;
  const targets = listTargets(engine, here);
  const lines = new Set<string>();

  for (const target of targets) {
    const matches = await queryActions(engine, { actor: "Player", target, value: null, obs: OBS });
    for (const match of matches) {
      const line = formatAction(match.verb, target, engine.world.entities[target] ?? {}, held);
      if (line) lines.add(line);
    }
  }

  if (held) lines.add(`/drop ${labelFor(held, engine.world.entities[held] ?? {})}`);
  return [...lines].sort();
}

function listTargets(engine: Facsimile, location: string | null): string[] {
  const out: string[] = [];
  for (const [id, ent] of Object.entries(engine.world.entities)) {
    if (id === "Player" || id === "Scene") continue;
    if (!location || ent.location === location) out.push(id);
  }
  return out;
}

function formatAction(verb: string, target: string, ent: EntityData, held: string | null): string | null {
  if (HIDDEN.has(verb)) return null;
  const command = COMMANDS[verb];
  if (!command) return null;
  if (verb === "pickup" && isPerson(target)) return null;
  if (verb === "drop") return null;
  if (verb === "giveto") return held && isPerson(target) ? `/give ${labelFor(held, {})} to ${labelFor(target, ent)}` : null;
  if ((verb === "hit" || verb === "slap" || verb === "push") && !isPerson(target)) return null;
  if ((verb === "hug" || verb === "kiss") && !isPerson(target)) return null;
  if (verb === "use" && isPerson(target)) return null;
  if (verb === "listen" && target !== "Door" && target !== "Room") return null;
  if (verb === "knock" && target !== "Door") return null;
  return `/${command} ${labelFor(target, ent)}`;
}

function labelFor(id: string, ent: EntityData): string {
  const pub = ent.public;
  if (pub && typeof pub === "object" && !Array.isArray(pub)) {
    const name = (pub as Record<string, SerialValue>).name;
    if (typeof name === "string") return name.toLowerCase();
  }
  return id.toLowerCase();
}

function isPerson(id: string): boolean {
  return id === "Grace" || id === "Trip";
}
