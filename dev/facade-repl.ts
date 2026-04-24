import readline from "node:readline/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createAIAdapter } from "../eng/AIAdapter";
import { Facsimile, type World } from "../eng/Engine";
import { parse } from "../eng/Parser";
import { listREPLActions } from "../eng/REPLActions";
import { parseREPLInput } from "../eng/REPLInput";
import { createREPLAdapter } from "../eng/REPLAdapter";

const SCRIPT = resolve("game/facade.fac");
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

async function main() {
  const src = readFileSync(SCRIPT, "utf8");
  const program = parse(src);
  const rl = readline.createInterface({ input, output });
  const playerName = await ask(rl, "What is your name? ");
  const world: World = {
    entities: Object.fromEntries(IDS.map((id) => [id, {}])),
    events: [],
  };
  const ai = createAIAdapter();
  const repl = createREPLAdapter((text) => output.write(text));
  const engine = new Facsimile(world, { methods: { ...ai.methods, ...repl.methods } }, program, {
    params: { playerName },
  });

  await engine.boot();
  output.write("\nFacade REPL. Type dialogue directly. Use /actions to list available actions.\n\n> ");

  for await (const raw of rl) {
    const parsed = parseREPLInput(raw);
    if (parsed.kind === "empty") {
      output.write("> ");
      continue;
    }
    if (parsed.kind === "quit") break;
    if (parsed.kind === "meta") {
      await printMeta(parsed.command, engine);
      output.write("> ");
      continue;
    }
    const before = engine.log.length;
    await engine.emit(engine.mkEvent(parsed.slots, parsed.obs));
    const visible = engine.log.slice(before).filter((e) => e.kind === "note");
    for (const e of visible) output.write(`${e.msg}\n`);
    output.write("> ");
  }

  rl.close();
}

async function ask(rl: readline.Interface, prompt: string): Promise<string> {
  const answer = (await rl.question(prompt)).trim();
  return answer.length > 0 ? answer : "Player";
}

async function printMeta(command: string, engine: Facsimile) {
  if (command === "help") {
    output.write("Dialogue: type anything. Meta: /actions, /state, /events, /log, /quit\n");
    return;
  }
  if (command === "actions") {
    const lines = await listREPLActions(engine);
    output.write(lines.length ? `${lines.join("\n")}\n` : "No obvious actions.\n");
    return;
  }
  if (command === "state") {
    output.write(JSON.stringify(engine.world.entities, null, 2) + "\n");
    return;
  }
  if (command === "events") {
    for (const e of engine.world.events.slice(-30)) output.write(`${e.slots.map(String).join(" | ")}\n`);
    return;
  }
  if (command === "log") {
    for (const e of engine.log.slice(-40)) output.write(`[${e.kind}] ${e.msg}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
