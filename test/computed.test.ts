import assert from "node:assert/strict";
import { parse } from "../eng/Parser";
import { Facsimile, type World } from "../eng/Engine";
import { createMockAdapter } from "../eng/MockAdapter";

const adapter = createMockAdapter(() => null);

async function run(src: string, world: World) {
  const engine = new Facsimile(world, adapter, parse(src));
  await engine.boot();
  return engine;
}

async function testBasic() {
  const world: World = { entities: { Trip: {} }, events: [] };
  const engine = await run(`
    Trip {
      drinks = 3;
      wineOz := drinks * 8;
    }
  `, world);
  assert.equal(engine.readPath(["Trip", "wineOz"]), 24);
  // Not stored:
  assert.equal(world.entities.Trip?.wineOz, undefined);
}

async function testChain() {
  const world: World = { entities: { Trip: {} }, events: [] };
  const engine = await run(`
    Trip {
      bodyWeightLb = 180;
      abv = 0.12;
      drinks = 4;
      wineOz := drinks * 8;
      totalAlcoholOz := wineOz * abv;
      bac := (totalAlcoholOz * 5.14) / (bodyWeightLb * 0.68) - 0.015;
    }
  `, world);
  assert.equal(engine.readPath(["Trip", "wineOz"]), 32);
  assert.equal(engine.readPath(["Trip", "totalAlcoholOz"]), 3.84);
  const bac = Number(engine.readPath(["Trip", "bac"]));
  const expected = (3.84 * 5.14) / (180 * 0.68) - 0.015;
  assert.ok(Math.abs(bac - expected) < 1e-9, `bac ${bac} vs ${expected}`);
}

async function testReactsToMutation() {
  const world: World = { entities: { Trip: {} }, events: [] };
  const engine = await run(`
    Trip {
      drinks = 1;
      wineOz := drinks * 8;
    }
  `, world);
  assert.equal(engine.readPath(["Trip", "wineOz"]), 8);
  engine.mutate(["Trip", "drinks"], 3);
  assert.equal(engine.readPath(["Trip", "drinks"]), 3);
  assert.equal(engine.readPath(["Trip", "wineOz"]), 24);
}

async function testMutateRejected() {
  const world: World = { entities: { Trip: {} }, events: [] };
  const engine = await run(`
    Trip {
      drinks = 2;
      wineOz := drinks * 8;
    }
  `, world);
  engine.mutate(["Trip", "wineOz"], 999);
  assert.equal(engine.readPath(["Trip", "wineOz"]), 16);
  assert.equal(world.entities.Trip?.wineOz, undefined);
  assert.ok(engine.log.some((l) => l.kind === "note" && l.msg.includes("cannot mutate computed")));
}

async function testHandlerCondUsesComputed() {
  const world: World = { entities: { Trip: {}, Scene: {} }, events: [] };
  const engine = await run(`
    Trip {
      drinks = 5;
      wineOz := drinks * 8;
    }
    Trip drink {
      Trip.drinks incr;
    }
    Trip.drinks incr if Trip.wineOz > 30 {
      Scene.tipsy set 1;
    }
  `, world);
  assert.equal(engine.readPath(["Trip", "wineOz"]), 40);
  await engine.emit(engine.mkEvent(["Trip", "drink"]));
  assert.equal(engine.readPath(["Scene", "tipsy"]), 1);
}

async function testCycleNoExplosion() {
  const world: World = { entities: { X: {} }, events: [] };
  const engine = await run(`
    X {
      a := b + 1;
      b := a + 1;
    }
  `, world);
  // Cycle resolves without hang — in-progress computed props are skipped in env.
  const v = engine.readPath(["X", "a"]);
  assert.ok(Number.isFinite(Number(v)));
}

async function testRedefineRejected() {
  const world: World = { entities: { X: {} }, events: [] };
  const program = parse(`
    X {
      foo := 1;
      foo := 2;
    }
  `);
  assert.throws(() => new Facsimile(world, adapter, program), /redefined/);
}

async function main() {
  await testBasic();
  await testChain();
  await testReactsToMutation();
  await testMutateRejected();
  await testHandlerCondUsesComputed();
  await testCycleNoExplosion();
  await testRedefineRejected();
  console.log("computed.test.ts OK");
}

main().catch((err) => { console.error(err); process.exit(1); });
