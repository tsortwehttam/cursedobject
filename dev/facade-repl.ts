import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { facadeAliases, facadeWorld } from "../lib/FacadeWorld";
import { applyEvent, createWorld, getRunText } from "../lib/WorldRuntime";
import { EventInput, WorldState } from "../lib/WorldTypes";

let time = 0;
const clock = {
  now: () => {
    time += 1;
    return time;
  },
};

const world = createWorld(facadeWorld, clock);

async function main() {
  const rl = readline.createInterface({ input, output });
  printIntro();
  printLines(run(event("look_at", "Apartment")));

  output.write("> ");
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    if (["quit", "exit"].includes(line.toLowerCase())) {
      break;
    }
    printLines(handle(line, world));
    output.write("> ");
  }

  rl.close();
}

function handle(line: string, world: WorldState): string[] {
  const lower = line.toLowerCase();
  if (["help", "?"].includes(lower)) return help();
  if (["look", "l"].includes(lower)) return run(event("look_at", "Apartment"));
  if (lower === "inventory" || lower === "i") return ["You are carrying nothing."];
  if (lower === "events") return world.events.slice(-8).map((e) => `${e.id} ${e.type} ${e.actor ?? "-"} -> ${e.target ?? "-"}`);
  if (lower === "knowledge") return Object.values(world.knowledge).map((k) => `${k.holder} knows ${k.subject}.${k.path} = ${k.value}`);
  if (lower === "drink") return runUse("BarCart");
  const knowledge = matchVerb(lower, ["knowledge ", "knows "]);
  if (knowledge) return showKnowledge(resolveTarget(knowledge), world);

  const look = matchVerb(lower, ["look at ", "look ", "x ", "examine "]);
  if (look) return run(event("look_at", resolveTarget(look)));

  const use = matchVerb(lower, ["use ", "sit on ", "drink ", "give drink to ", "pour drink for ", "pick up "]);
  if (use) return runUse(resolveTarget(use));

  const talk = matchVerb(lower, ["talk to ", "ask ", "tell "]);
  if (talk) {
    const { target, body } = parseTalk(talk);
    return run({
      type: getTalkType(target),
      actor: "Player",
      target,
      body,
      observers: ["Grace", "Trip"].filter((id) => id !== target),
    });
  }

  return [`I don't know how to do that. Try "look", "look painting", "talk to grace", or "use bar".`];
}

function runUse(target: string): string[] {
  if (target === "Trip" || target === "BarCart") {
    return run(event(getDrinkType(), "BarCart"));
  }
  return run(event("use", target));
}

function getTalkType(target: string): string {
  if (target === "Grace" && shouldConfessAffair(target)) return "confess_affair";
  const talks = Number(world.state[target]?.traits.talks ?? 0);
  if (target === "Trip") return `talk_${Math.min(talks + 1, 3)}`;
  if (target === "Grace") return `talk_${Math.min(talks + 1, 3)}`;
  return "talk_to";
}

function shouldConfessAffair(target: string): boolean {
  if (target !== "Grace") return false;
  if (world.state.Grace?.traits.affair_revealed === true) return false;
  const prompt = String(world.state.Player?.status.last_talk ?? "").toLowerCase();
  const trust = Number(world.state.Grace?.traits.trust ?? 0);
  const isDirect = ["affair", "cheat", "cheated", "married", "marriage", "wedding"].some((word) => prompt.includes(word));
  return isDirect && trust >= 2;
}

function getDrinkType(): string {
  const drinks = Number(world.state.Trip?.traits.drinks ?? 0);
  if (drinks >= 3) return "serve_drink_full";
  return `serve_drink_${drinks + 1}`;
}

function showKnowledge(holder: string, world: WorldState): string[] {
  if (!world.defs[holder]) return [`I don't know who that is.`];
  const records = Object.values(world.knowledge).filter((k) => k.holder === holder);
  if (records.length === 0) return [`${holder} does not know anything explicit yet.`];
  return records.map((k) => `${k.holder} knows ${k.subject}.${k.path} = ${k.value}`);
}

function run(input: EventInput): string[] {
  if (!input.target || !world.defs[input.target]) return [`You don't see that here.`];
  const result = applyEvent(input, world, clock);
  if (!result.ok) return [`Event failed: ${result.error.message}`];
  const text = getRunText(result);
  return text.length ? text : ["Nothing obvious happens."];
}

function event(type: string, target: string): EventInput {
  return {
    type,
    actor: "Player",
    target,
    body: null,
    observers: ["Grace", "Trip"].filter((id) => id !== target),
  };
}

function resolveTarget(text: string): string {
  return facadeAliases[text.trim().toLowerCase()] ?? text.trim();
}

function parseTalk(text: string): { target: string; body: string } {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const target = resolveTarget(parts[0] ?? "");
  const body = parts.slice(1).join(" ") || null;
  if (world.state.Player) {
    world.state.Player.status.last_talk = body ?? "";
  }
  return { target, body: body ?? "" };
}

function matchVerb(line: string, verbs: string[]): string | null {
  for (const verb of verbs) {
    if (line.startsWith(verb)) return line.slice(verb.length).trim();
  }
  return null;
}

function printIntro() {
  output.write("Facade REPL\n");
  output.write('Try: look, look painting, talk to grace, drink, knowledge player, events, quit\n\n');
}

function printLines(lines: string[]) {
  for (const line of lines) output.write(`${line}\n`);
}

function help(): string[] {
  return [
    "Commands:",
    "look",
    "look <thing>",
    "use <thing>",
    "talk to <person> <text>",
    "drink",
    "give drink to trip",
    "events",
    "knowledge <person>",
    "quit",
  ];
}

main();
