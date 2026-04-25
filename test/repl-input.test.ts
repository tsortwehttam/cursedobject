import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMockAdapter } from "../eng/adapters/MockAdapter";
import { Facsimile, type World } from "../eng/Engine";
import { parse } from "../eng/Parser";
import { story } from "../fic/facade/adapter";

const src = readFileSync(new URL("../fic/facade/facade.fac", import.meta.url), "utf8");
const program = parse(src);
const adapter = createMockAdapter((kind, parts) => {
  if (kind === "chat") return "[chat reply]";
  if (kind === "enum") return parts[1]?.split("|")[0] ?? "neutral";
  if (kind === "bool") return false;
  return null;
});

const world: World = {
  entities: Object.fromEntries(["Apartment", "BarCart", "Door", "Grace", "ItalyPhoto", "Painting", "Player", "Scene", "Trip"].map((id) => [id, {}])),
  events: [],
};
const engine = new Facsimile(world, adapter, program, { params: { playerName: "Ada" } });
const parseInput = story.parseInput!;

async function run() {
  await engine.boot();

  assert.deepEqual(await parseInput("hello Grace", engine), {
    kind: "event",
    slots: ["Player", "sayto", "Hallway", "hello Grace"],
    obs: [],
  });

  assert.deepEqual(await parseInput("/say grace I missed you", engine), {
    kind: "event",
    slots: ["Player", "sayto", "Grace", "I missed you"],
    obs: [],
  });

  assert.deepEqual(await parseInput("/look painting", engine), {
    kind: "event",
    slots: ["Player", "lookat", "Painting"],
    obs: [],
  });

  assert.deepEqual(await parseInput("/listen", engine), {
    kind: "event",
    slots: ["Player", "listen", "Door"],
    obs: [],
  });

  await engine.emit(engine.mkEvent(["Player", "knock", "Door"]));

  assert.deepEqual(await parseInput("hello Grace", engine), {
    kind: "event",
    slots: ["Player", "sayto", "Apartment", "hello Grace"],
    obs: ["Grace", "Trip"],
  });

  assert.deepEqual(await parseInput("/give drink to trip", engine), {
    kind: "event",
    slots: ["Player", "giveto", "Trip", "drink"],
    obs: ["Grace", "Trip"],
  });

  assert.deepEqual(await parseInput("/events", engine), { kind: "meta", command: "events" });
  assert.deepEqual(await parseInput("/actions", engine), { kind: "meta", command: "actions" });
  assert.deepEqual(await parseInput("/quit", engine), { kind: "quit" });
}

run()
  .then(() => console.log("repl-input.test.ts OK"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
