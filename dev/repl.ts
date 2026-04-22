import readline from "node:readline/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { parse } from "../eng/Parser";
import { Facsimile, type World } from "../eng/Engine";
import { createAIAdapter } from "../eng/AIAdapter";
import { createREPLAdapter } from "../eng/REPLAdapter";
import { parseShorthandEvent } from "../eng/Parsing";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: tsx dev/repl.ts <path-to-.fac> [extra-entity-ids-comma-list]");
    process.exit(1);
  }
  const extraIds = (process.argv[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const src = readFileSync(resolve(path), "utf8");
  const program = parse(src);

  const seeded = new Set<string>(extraIds);
  for (const h of program) {
    const s0 = h.slots[0];
    if (s0.t === "ref" && s0.segs.length === 1 && !s0.segs[0].wild) {
      const id = s0.segs[0].v;
      if (!["game", "device", "if"].includes(id)) seeded.add(id);
    }
  }

  const world: World = {
    entities: Object.fromEntries([...seeded].map((id) => [id, {}])),
    events: [],
  };

  // Compose adapters: stdlib AI methods + REPL methods. Plain object spread.
  const ai = createAIAdapter();
  const repl = createREPLAdapter((t) => output.write(t));
  const adapter = { methods: { ...ai.methods, ...repl.methods } };

  const engine = new Facsimile(world, adapter, program);
  await engine.boot();

  const rl = readline.createInterface({ input, output });
  output.write(`Facsimile REPL — loaded ${path}\n`);
  output.write(`Entities: ${Object.keys(world.entities).join(", ")}\n`);
  output.write(`Commands: state | log | events | quit. Event input: shorthand "actor verb target rest..." or JSON array.\n\n> `);

  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) { output.write("> "); continue; }
    if (["quit", "exit"].includes(line)) break;

    if (line === "state") { output.write(JSON.stringify(world.entities, null, 2) + "\n> "); continue; }
    if (line === "log") {
      for (const e of engine.log.slice(-20)) output.write(`  [${e.kind}] ${e.msg}\n`);
      output.write("> ");
      continue;
    }
    if (line === "events") {
      for (const e of world.events.slice(-20)) output.write(`  ${e.slots.map(String).join(" | ")}\n`);
      output.write("> ");
      continue;
    }

    try {
      const slots = parseShorthandEvent(line);
      const before = engine.log.length;
      await engine.emit(engine.mkEvent(slots));
      for (const e of engine.log.slice(before)) {
        if (e.kind === "event") output.write(`  ${e.msg}\n`);
      }
    } catch (err) {
      output.write(`error: ${(err as Error).message}\n`);
    }
    output.write("> ");
  }

  rl.close();
}

main();
