import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "../eng/Parser";
import { Facsimile, type World } from "../eng/Engine";
import { createMockAdapter } from "../eng/MockAdapter";

const src = readFileSync(new URL("../game/facade.fac", import.meta.url), "utf8");
const program = parse(src);

// Mock AI: deterministic canned responses per io kind.
const adapter = createMockAdapter((kind, parts) => {
  if (kind === "chat") return `[${kind} reply]`;
  if (kind === "bool") {
    // parts[0] = binding name. Detect affection from the prompt text.
    const joined = parts.slice(1).join(" ").toLowerCase();
    return /love|miss|beautiful|gorgeous|adore/.test(joined);
  }
  if (kind === "enum") {
    const joined = parts.slice(2).join(" ").toLowerCase();
    if (/love|miss|beautiful|warm|thanks|nice/.test(joined)) return "warm";
    if (/hate|ugly|stupid|shut/.test(joined)) return "hostile";
    return "neutral";
  }
  if (kind === "match") return false;
  if (kind === "number") return 0;
  return null;
});

const world: World = {
  entities: { Trip: {}, Grace: {}, Player: {}, Scene: {} },
  events: [],
};
const engine = new Facsimile(world, adapter, program);

async function testParams() {
  const paramProgram = parse(`
    Player {
      name = params.playerName;
      public.name = "{{params.playerName}}";
    }
  `);
  const paramWorld: World = { entities: { Player: {} }, events: [] };
  const paramEngine = new Facsimile(paramWorld, adapter, paramProgram, {
    params: { playerName: "Ada" },
  });
  await paramEngine.boot();
  assert.equal(paramWorld.entities.Player?.name, "Ada");
  const pub = paramWorld.entities.Player?.public;
  assert.ok(pub && typeof pub === "object" && !Array.isArray(pub));
  assert.equal(pub.name, "Ada");
}

async function run() {
await testParams();
await engine.boot();

// Verify spawn handlers set traits.
assert.equal(world.entities.Trip?.name, "Trip");
assert.equal(world.entities.Grace?.name, "Grace");
assert.equal(engine.readPath(["Trip", "feelings", "drunkenness"]), 0);

// Round 1: Player greets Trip warmly.
await engine.emit(engine.mkEvent(["Player", "sayto", "Trip", "Hey Trip, thanks for having me"]));

// Trip should have emitted a reply event to Player.
const tripReplies = world.events.filter(
  (e) => e.slots[0] === "Trip" && e.slots[1] === "sayto" && e.slots[2] === "Player",
);
assert.ok(tripReplies.length >= 1, "Trip should respond");
assert.equal(tripReplies[0].slots[3], "[chat reply]");

// Round 2: Player says something affectionate to Grace while Trip present.
await engine.emit(engine.mkEvent(["Player", "sayto", "Grace", "You look beautiful tonight, Grace"], ["Trip"]));

// Warmth classifier should bump Grace.feelings.affection (from 3 -> 4).
assert.equal(engine.readPath(["Grace", "feelings", "affection"]), 4, "Grace affection should rise on warm tone");

// Affection detector should bump Trip.feelings.jealousy (from 0 -> 1) since Trip observes.
assert.equal(engine.readPath(["Trip", "feelings", "jealousy"]), 1, "Trip jealousy should rise when Player flatters Grace in Trip's presence");
assert.equal(engine.readPath(["Trip", "feelings", "tension"]), 1, "Trip tension should also rise");

// Round 3: Player is hostile → Grace affection down.
const beforeAff = Number(engine.readPath(["Grace", "feelings", "affection"]) ?? 0);
await engine.emit(engine.mkEvent(["Player", "sayto", "Grace", "You are stupid"]));
assert.equal(Number(engine.readPath(["Grace", "feelings", "affection"])), beforeAff - 1);

// Round 4: Trip drinks (verb "incr" on Trip.feelings.drunkenness) -> tension rises via property-change handler.
const tensionBefore = Number(engine.readPath(["Trip", "feelings", "tension"]) ?? 0);
await engine.emit(engine.mkEvent(["Trip.feelings.drunkenness", "incr"]));
assert.equal(Number(engine.readPath(["Trip", "feelings", "tension"])), tensionBefore + 1);

console.log(`engine.test.ts OK — emitted ${world.events.length} events`);
}

run().catch((err) => { console.error(err); process.exit(1); });
