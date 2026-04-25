import type { SerialValue } from "../../lib/CoreTypings";
import { type EventMethod, type FacAdapter } from "../../eng/adapters/Adapter";
import { labelFor, type FacStoryAdapter, type ParsedREPLInput, type StoryIO } from "../../eng/adapters/StoryAdapter";
import type { EntityData, Facsimile } from "../../eng/Engine";
import { queryActions } from "../../eng/Query";

const META = new Set(["state", "log", "events", "help", "actions"]);
const HIDDEN = new Set(["unknown", "sayto"]);
const VERBS: Record<string, string> = {
  give: "giveto",
  look: "lookat",
  pick: "pickup",
};
const DISPLAY: Record<string, string> = {
  giveto: "give",
  lookat: "look",
  pickup: "pick up",
};
const COLORS: Record<string, string> = {
  Grace: "magenta",
  Trip: "cyan",
};

export const story: FacStoryAdapter = {
  ids: [],
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

  const onSayto: EventMethod = async ({ event }) => {
    const [speaker, verb, target, body] = event.slots;
    if (verb !== "sayto" || body == null) return;
    const suffix = target && target !== "Player" ? ` (to ${target})` : "";
    const text = `${String(speaker ?? "Someone")}${suffix}: ${String(body)}`;
    line(colorize(text, COLORS[String(speaker ?? "")] ?? null));
  };

  return { methods: {}, events: [onSayto] };
}

async function parseInput(raw: string, engine: Facsimile): Promise<ParsedREPLInput> {
  const line = raw.trim();
  if (!line) return { kind: "empty" };
  const lower = line.toLowerCase();
  if (["quit", "exit", "/quit", "/exit"].includes(lower)) return { kind: "quit" };
  if (line[0] !== "/") return sayInput(engine, line, currentLocation(engine));

  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const command = cmd.toLowerCase();
  const body = rest.join(" ").trim();
  if (META.has(command)) return { kind: "meta", command };
  if (command === "say") {
    const [target, ...words] = rest;
    return sayInput(engine, words.join(" ").trim(), resolveTarget(engine, target, currentLocation(engine)));
  }

  const verb = VERBS[command] ?? command;
  if (verb === "move") return actionInput(engine, verb, resolveTarget(engine, body, "Apartment"));
  if (verb === "listen") return actionInput(engine, verb, await resolveActionTarget(engine, verb, body));
  if (verb === "giveto") {
    const [thing, target] = parseGive(body, heldItem(engine));
    return actionInput(engine, verb, resolveTarget(engine, target, null), resolveTarget(engine, thing, null));
  }
  return actionInput(engine, verb, await resolveActionTarget(engine, verb, body || command));
}

async function listActions(engine: Facsimile): Promise<string[]> {
  const held = heldItem(engine);
  const lines = new Set<string>();

  for (const target of visibleTargets(engine)) {
    const matches = await queryActions(engine, { actor: "Player", target, value: null, obs: observers(engine) });
    for (const match of matches) {
      const line = formatAction(engine, match.verb, target, held);
      if (line) lines.add(line);
    }
  }

  if (held) lines.add(`/drop ${labelFor(held, engine.world.entities[held] ?? {})}`);
  return [...lines].sort();
}

function sayInput(engine: Facsimile, text: string, target: string): ParsedREPLInput {
  return { kind: "event", slots: ["Player", "sayto", target, text], obs: observers(engine) };
}

function actionInput(engine: Facsimile, verb: string, target: string, value: string | null = null): ParsedREPLInput {
  const slots = value === null ? ["Player", verb, target] : ["Player", verb, target, value];
  return { kind: "event", slots, obs: observers(engine) };
}

async function resolveActionTarget(engine: Facsimile, verb: string, body: string): Promise<string> {
  if (body.length > 0 && body !== verb) return resolveTarget(engine, body, null);
  const targets = visibleTargets(engine);
  for (const target of targets) {
    const matches = await queryActions(engine, { actor: "Player", target, value: null, obs: observers(engine) });
    if (matches.some((match) => match.verb === verb)) return target;
  }
  return currentLocation(engine);
}

function resolveTarget(engine: Facsimile, text: string | undefined, fallback: string | null): string {
  const key = normalize(text ?? "");
  if (!key) return fallback ?? "";
  for (const [id, ent] of Object.entries(engine.world.entities)) {
    if (targetKeys(id, ent).some((item) => normalize(item) === key)) return id;
  }
  return text ?? fallback ?? "";
}

function visibleTargets(engine: Facsimile): string[] {
  const here = currentLocation(engine);
  return Object.entries(engine.world.entities)
    .filter(([id, ent]) => id !== "Player" && id !== "Scene" && ent.location === here)
    .map(([id]) => id);
}

function observers(engine: Facsimile): string[] {
  const here = currentLocation(engine);
  return Object.entries(engine.world.entities)
    .filter(([id, ent]) => id !== "Player" && ent.kind === "character" && ent.location === here)
    .map(([id]) => id);
}

function currentLocation(engine: Facsimile): string {
  const loc = engine.world.entities.Player?.location;
  return typeof loc === "string" ? loc : "Apartment";
}

function heldItem(engine: Facsimile): string | null {
  const held = engine.world.entities.Player?.holding;
  return typeof held === "string" && held !== "nothing" ? held : null;
}

function formatAction(engine: Facsimile, verb: string, target: string, held: string | null): string | null {
  if (HIDDEN.has(verb)) return null;
  const ent = engine.world.entities[target] ?? {};
  if (verb === "pickup" && isPerson(ent)) return null;
  if (verb === "drop") return null;
  if (verb === "giveto") {
    return held && isPerson(ent) ? `/give ${labelFor(held, {})} to ${labelFor(target, ent)}` : null;
  }
  if (["hit", "slap", "push", "hug", "kiss"].includes(verb) && !isPerson(ent)) return null;
  if (verb === "use" && isPerson(ent)) return null;
  return `/${DISPLAY[verb] ?? verb} ${labelFor(target, ent)}`;
}

function parseGive(body: string, held: string | null): [thing: string, target: string] {
  const match = body.match(/^(.+?)\s+(?:to\s+)?(\S+)$/);
  if (!match) return [body || held || "", ""];
  return [match[1], match[2]];
}

function targetKeys(id: string, ent: EntityData): string[] {
  const keys = [id];
  const pub = ent.public;
  if (!pub || typeof pub !== "object" || Array.isArray(pub)) return keys;
  const rec = pub as Record<string, SerialValue>;
  if (typeof rec.name === "string") keys.push(rec.name);
  if (typeof rec.aliases === "string") keys.push(...rec.aliases.split("|"));
  if (Array.isArray(rec.aliases)) {
    for (const alias of rec.aliases) {
      if (typeof alias === "string") keys.push(alias);
    }
  }
  return keys;
}

function isPerson(ent: EntityData): boolean {
  return ent.kind === "character";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
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
