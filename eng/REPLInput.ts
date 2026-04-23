import type { SerialValue } from "../lib/CoreTypings";

export type ParsedREPLInput =
  | { kind: "empty" }
  | { kind: "quit" }
  | { kind: "meta"; command: string }
  | { kind: "event"; slots: SerialValue[]; obs: string[] };

const TARGETS: Record<string, string> = {
  apartment: "Apartment",
  bar: "BarCart",
  cart: "BarCart",
  couch: "Couch",
  coucharea: "Couch",
  door: "Door",
  drink: "Drink",
  grace: "Grace",
  painting: "Painting",
  photo: "ItalyPhoto",
  picture: "ItalyPhoto",
  room: "Room",
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
  look: "lookat",
  move: "move",
  pickup: "pickup",
  push: "push",
  slap: "slap",
  touch: "touch",
  use: "use",
};

export function parseREPLInput(raw: string): ParsedREPLInput {
  const line = raw.trim();
  if (!line) return { kind: "empty" };
  const lower = line.toLowerCase();
  if (lower === "quit" || lower === "exit" || lower === "/quit" || lower === "/exit") {
    return { kind: "quit" };
  }
  if (line[0] !== "/") return say(line);

  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const command = cmd.toLowerCase();
  const body = rest.join(" ").trim();
  if (command === "state" || command === "log" || command === "events" || command === "help") {
    return { kind: "meta", command };
  }
  if (command === "say") {
    const [target, ...words] = rest;
    return say(words.join(" ").trim(), resolveTarget(target));
  }

  const verb = ACTION_VERBS[command];
  if (!verb) return { kind: "event", slots: ["Player", "unknown", command, body], obs: ["Grace", "Trip"] };
  if (command === "move") return { kind: "event", slots: ["Player", verb, resolveTarget(body || "Apartment")], obs: ["Grace", "Trip"] };
  if (command === "give") {
    const [thing, target] = parseGive(body);
    return { kind: "event", slots: ["Player", verb, resolveTarget(target), resolveTarget(thing)], obs: ["Grace", "Trip"] };
  }
  return { kind: "event", slots: ["Player", verb, resolveTarget(body || command)], obs: ["Grace", "Trip"] };
}

function say(text: string, target = "Room"): ParsedREPLInput {
  return { kind: "event", slots: ["Player", "sayto", target, text], obs: ["Grace", "Trip"] };
}

function parseGive(body: string): [thing: string, target: string] {
  const match = body.match(/^(.+?)\s+(?:to\s+)?(\S+)$/);
  if (!match) return [body || "Drink", "Trip"];
  return [match[1], match[2]];
}

function resolveTarget(text: string | undefined): string {
  const key = (text ?? "").replace(/\s+/g, "").toLowerCase();
  return TARGETS[key] ?? (text && text.length > 0 ? text : "Room");
}
