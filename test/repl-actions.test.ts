import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMockAdapter } from "../eng/MockAdapter";
import { Facsimile, type World } from "../eng/Engine";
import { parse } from "../eng/Parser";
import { listREPLActions } from "../eng/REPLActions";

const src = readFileSync(new URL("../game/facade.fac", import.meta.url), "utf8");
const program = parse(src);
const adapter = createMockAdapter((kind, parts) => {
  if (kind === "chat") return "[chat reply]";
  if (kind === "enum") return parts[1]?.split("|")[0] ?? "neutral";
  if (kind === "bool") return false;
  return null;
});

const ids = [
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

const world: World = {
  entities: Object.fromEntries(ids.map((id) => [id, {}])),
  events: [],
};
const engine = new Facsimile(world, adapter, program);

async function run() {
  await engine.boot();
  const hall = await listREPLActions(engine);
  assert.ok(hall.includes("/listen front door"));
  assert.ok(hall.includes("/knock front door"));
  assert.ok(hall.includes("/look front door"));
  assert.ok(!hall.some((line) => line.includes("Room beat")));

  await engine.emit(engine.mkEvent(["Player", "knock", "Door"], ["Grace", "Trip"]));
  const apt = await listREPLActions(engine);
  assert.ok(apt.includes("/look abstract painting"));
  assert.ok(apt.includes("/use bar cart"));
  assert.ok(apt.includes("/hug grace"));
}

run()
  .then(() => console.log("repl-actions.test.ts OK"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
