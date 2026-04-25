import type { SerialValue } from "../../lib/CoreTypings";
import { splitParams, type FacAdapter, type IOCtx, type IOMethod } from "../../eng/adapters/Adapter";
import { labelFor, type FacStoryAdapter, type ParsedREPLInput, type StoryIO } from "../../eng/adapters/StoryAdapter";
import type { EntityData, Facsimile } from "../../eng/Engine";
import { queryActions } from "../../eng/Query";

const IDS = [
  "Apartment",
  "BarCart",
  "Couch",
  "Door",
  "Grace",
  "ItalyPhoto",
  "Painting",
  "Player",
  "Room",
  "Scene",
  "Sculpture",
  "Stereo",
  "Trip",
  "Vase",
  "WeddingPhoto",
];

const OBS = ["Grace", "Trip"];

const TARGETS: Record<string, string> = {
  apartment: "Apartment",
  bar: "BarCart",
  cart: "BarCart",
  couch: "Couch",
  coucharea: "Couch",
  conversation: "Apartment",
  door: "Door",
  drink: "Drink",
  grace: "Grace",
  painting: "Painting",
  photo: "ItalyPhoto",
  picture: "ItalyPhoto",
  room: "Apartment",
  sculpture: "Sculpture",
  stereo: "Stereo",
  trip: "Trip",
  vase: "Vase",
  wedding: "WeddingPhoto",
};

const ACTION_VERBS: Record<string, string> = {
  drop: "drop",
  give: "giveto",
  hit: "hit",
  hug: "hug",
  kiss: "kiss",
  knock: "knock",
  listen: "listen",
  look: "lookat",
  move: "move",
  pickup: "pickup",
  push: "push",
  slap: "slap",
  touch: "touch",
  use: "use",
};

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
const PEOPLE = new Set(["Grace", "Trip"]);
const COLORS: Record<string, string> = {
  Grace: "magenta",
  Trip: "cyan",
};

export const story: FacStoryAdapter = {
  ids: IDS,
  params: async (io) => {
    const answer = (await io.ask("What is your name? ")).trim();
    return { playerName: answer.length > 0 ? answer : "Player" };
  },
  parseInput,
  listActions,
  createAdapter: createFacadeAdapter,
  style: (kind) => kind === "narrate" ? "gray" : null,
  intro: "Facade REPL. Type dialogue directly. Use /actions to list available actions.",
};

export default story;

function createFacadeAdapter(io: StoryIO): FacAdapter {
  const line = (text: string) => io.write(text.endsWith("\n") ? text : `${text}\n`);

  const say: IOMethod = async (ctx: IOCtx): Promise<SerialValue> => {
    const [speaker, target, body] = splitParams(ctx.rawText).map(ctx.interpolate);
    const suffix = target && target !== "Player" ? ` (to ${target})` : "";
    const text = `${speaker ?? "Someone"}${suffix}: ${body ?? ""}`;
    line(colorize(text, COLORS[speaker ?? ""] ?? null));
    return body ?? "";
  };

  return { methods: { say } };
}

function parseInput(raw: string): ParsedREPLInput {
  const line = raw.trim();
  if (!line) return { kind: "empty" };
  const lower = line.toLowerCase();
  if (lower === "quit" || lower === "exit" || lower === "/quit" || lower === "/exit") {
    return { kind: "quit" };
  }
  if (line[0] !== "/") return sayInput(line);

  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const command = cmd.toLowerCase();
  const body = rest.join(" ").trim();
  if (["state", "log", "events", "help", "actions"].includes(command)) {
    return { kind: "meta", command };
  }
  if (command === "say") {
    const [target, ...words] = rest;
    return sayInput(words.join(" ").trim(), resolveTarget(target));
  }

  const verb = ACTION_VERBS[command];
  if (!verb) return { kind: "event", slots: ["Player", "unknown", command, body], obs: OBS };
  if (command === "move") return { kind: "event", slots: ["Player", verb, resolveTarget(body || "Apartment")], obs: OBS };
  if (command === "listen") return { kind: "event", slots: ["Player", verb, resolveTarget(body || "Door")], obs: OBS };
  if (command === "give") {
    const [thing, target] = parseGive(body);
    return { kind: "event", slots: ["Player", verb, resolveTarget(target), resolveTarget(thing)], obs: OBS };
  }
  return { kind: "event", slots: ["Player", verb, resolveTarget(body || command)], obs: OBS };
}

async function listActions(engine: Facsimile): Promise<string[]> {
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

function sayInput(text: string, target = "Apartment"): ParsedREPLInput {
  return { kind: "event", slots: ["Player", "sayto", target, text], obs: OBS };
}

function parseGive(body: string): [thing: string, target: string] {
  const match = body.match(/^(.+?)\s+(?:to\s+)?(\S+)$/);
  if (!match) return [body || "Drink", "Trip"];
  return [match[1], match[2]];
}

function resolveTarget(text: string | undefined): string {
  const key = (text ?? "").replace(/\s+/g, "").toLowerCase();
  return TARGETS[key] ?? (text && text.length > 0 ? text : "Apartment");
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
  if (verb === "pickup" && PEOPLE.has(target)) return null;
  if (verb === "drop") return null;
  if (verb === "giveto") return held && PEOPLE.has(target) ? `/give ${labelFor(held, {})} to ${labelFor(target, ent)}` : null;
  if ((verb === "hit" || verb === "slap" || verb === "push") && !PEOPLE.has(target)) return null;
  if ((verb === "hug" || verb === "kiss") && !PEOPLE.has(target)) return null;
  if (verb === "use" && PEOPLE.has(target)) return null;
  if (verb === "listen" && target !== "Door" && target !== "Apartment") return null;
  if (verb === "knock" && target !== "Door") return null;
  return `/${command} ${labelFor(target, ent)}`;
}

function colorize(text: string, color: string | null): string {
  if (!color) return text;
  const code = ANSI[color];
  if (!code) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const ANSI: Record<string, string> = {
  cyan: "36",
  gray: "90",
  magenta: "35",
};
