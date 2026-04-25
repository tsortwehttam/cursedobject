import assert from "node:assert/strict";
import { parse } from "../eng/Parser";
import {
  Facsimile,
  applyArrayVerb,
  applySetVerb,
  applyCounterVerb,
  type World,
} from "../eng/Engine";
import { createMockAdapter } from "../eng/adapters/MockAdapter";

// ---------- Pure unit tests ----------

// Array verbs
assert.deepEqual(applyArrayVerb("push", [1, 2], [3]), [1, 2, 3]);
assert.deepEqual(applyArrayVerb("push", [], [1, 2, 3]), [1, 2, 3]);
assert.deepEqual(applyArrayVerb("unshift", [2, 3], [1]), [1, 2, 3]);
assert.deepEqual(applyArrayVerb("pop", [1, 2, 3], []), [1, 2]);
assert.deepEqual(applyArrayVerb("pop", [], []), []);
assert.deepEqual(applyArrayVerb("shift", [1, 2, 3], []), [2, 3]);
assert.deepEqual(applyArrayVerb("shift", [], []), []);
assert.deepEqual(applyArrayVerb("clear", [1, 2, 3], []), []);
assert.deepEqual(applyArrayVerb("remove", [1, 2, 1], [1]), [2, 1]);
assert.deepEqual(applyArrayVerb("remove", [1, 2], [9]), [1, 2]);
assert.deepEqual(applyArrayVerb("removeAll", [1, 2, 1, 3, 1], [1]), [2, 3]);
assert.deepEqual(applyArrayVerb("insert", [1, 3], [1, 2]), [1, 2, 3]);
assert.deepEqual(applyArrayVerb("insert", [1, 2], [99, "x"]), [1, 2, "x"]);
assert.deepEqual(applyArrayVerb("insert", [1, 2], [-5, "a"]), ["a", 1, 2]);
assert.deepEqual(applyArrayVerb("removeAt", [1, 2, 3], [1]), [1, 3]);
assert.deepEqual(applyArrayVerb("removeAt", [1, 2, 3], [9]), [1, 2, 3]);

// Set verbs (dedup on add, idempotent delete, toggle flips)
assert.deepEqual(applySetVerb("add", [1, 2], [3]), [1, 2, 3]);
assert.deepEqual(applySetVerb("add", [1, 2], [2]), [1, 2]);
assert.deepEqual(applySetVerb("delete", [1, 2, 3], [2]), [1, 3]);
assert.deepEqual(applySetVerb("delete", [1, 2], [9]), [1, 2]);
assert.deepEqual(applySetVerb("toggle", [1, 2], [2]), [1]);
assert.deepEqual(applySetVerb("toggle", [1, 2], [3]), [1, 2, 3]);
assert.deepEqual(applySetVerb("clear", [1, 2], []), []);

// Counter verbs
assert.equal(applyCounterVerb("clamp", 15, [0, 10]), 10);
assert.equal(applyCounterVerb("clamp", -5, [0, 10]), 0);
assert.equal(applyCounterVerb("clamp", 5, [0, 10]), 5);
assert.equal(applyCounterVerb("min", 10, [5]), 5);
assert.equal(applyCounterVerb("min", 3, [5]), 3);
assert.equal(applyCounterVerb("max", 3, [5]), 5);
assert.equal(applyCounterVerb("max", 10, [5]), 10);

// ---------- End-to-end via engine runStmt kernel ----------

const adapter = createMockAdapter(() => null);

async function runProgram(src: string, world: World) {
  const program = parse(src);
  const engine = new Facsimile(world, adapter, program);
  await engine.boot();
  return engine;
}

async function testArrayVerbsE2E() {
  const world: World = { entities: { Trip: {} }, events: [] };
  const engine = await runProgram(`
    Trip spawn {
      Trip.inventory push "drink";
      Trip.inventory push "cigar" "coaster";
      Trip.inventory unshift "keys";
      Trip.inventory remove "cigar";
      Trip.inventory insert 1 "wallet";
    }
  `, world);
  assert.deepEqual(engine.readPath(["Trip", "inventory"]), ["keys", "wallet", "drink", "coaster"]);
}

async function testSetVerbsE2E() {
  const world: World = { entities: { Grace: {} }, events: [] };
  const engine = await runProgram(`
    Grace spawn {
      Grace.tags add "artist";
      Grace.tags add "artist";
      Grace.tags add "host";
      Grace.tags toggle "artist";
      Grace.tags toggle "defector";
    }
  `, world);
  assert.deepEqual(engine.readPath(["Grace", "tags"]), ["host", "defector"]);
}

async function testCounterVerbsE2E() {
  const world: World = { entities: { Scene: {} }, events: [] };
  const engine = await runProgram(`
    Scene spawn {
      Scene.tension incr 20;
      Scene.tension clamp 0 10;
    }
  `, world);
  assert.equal(engine.readPath(["Scene", "tension"]), 10);
}

async function testMutEventEmission() {
  // Authors should be able to react to a mut verb by pattern-matching the 2-slot event.
  const world: World = { entities: { Trip: {}, Scene: {} }, events: [] };
  const engine = await runProgram(`
    Trip spawn {
      Trip.inventory push "drink";
    }
    Trip.inventory push {
      Scene.events incr;
    }
  `, world);
  assert.equal(engine.readPath(["Scene", "events"]), 1);
  assert.ok(world.events.some((e) => e.slots[0] === "Trip.inventory" && e.slots[1] === "push"));
}

async function testRefArgResolvesToValue() {
  // `push <refpath>` should push the VALUE at that path, not the path string.
  const world: World = { entities: { Trip: { gift: "flowers" }, Grace: {} }, events: [] };
  const engine = await runProgram(`
    Grace spawn {
      Grace.received push Trip.gift;
    }
  `, world);
  assert.deepEqual(engine.readPath(["Grace", "received"]), ["flowers"]);
}

async function run() {
  await testArrayVerbsE2E();
  await testSetVerbsE2E();
  await testCounterVerbsE2E();
  await testMutEventEmission();
  await testRefArgResolvesToValue();
  console.log("mut-verbs.test.ts OK");
}

run().catch((err) => { console.error(err); process.exit(1); });
