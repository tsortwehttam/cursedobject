import assert from "node:assert/strict";
import { parse } from "../eng/Parser";
import { Facsimile, type World } from "../eng/Engine";
import { createMockAdapter } from "../eng/MockAdapter";

const adapter = createMockAdapter(() => null);

async function testWildKindGuard() {
  const world: World = {
    entities: { Player: {}, Trip: { kind: "character" }, Vase: { kind: "prop" } },
    events: [],
  };
  const engine = new Facsimile(world, adapter, parse(`
    Player hit $target if $target.kind == "character" {
      $target.hit set 1;
    }
  `));
  await engine.boot();
  await engine.emit(engine.mkEvent(["Player", "hit", "Trip"]));
  await engine.emit(engine.mkEvent(["Player", "hit", "Vase"]));
  assert.equal(engine.readPath(["Trip", "hit"]), 1);
  assert.equal(engine.readPath(["Vase", "hit"]), null);
}

async function testWildInInterpolation() {
  const world: World = {
    entities: { Player: {}, Trip: { mood: "tense" } },
    events: [],
  };
  const engine = new Facsimile(world, adapter, parse(`
    Player poke $who {
      Player.note set "{{$who.mood}}";
    }
  `));
  await engine.boot();
  await engine.emit(engine.mkEvent(["Player", "poke", "Trip"]));
  assert.equal(engine.readPath(["Player", "note"]), "tense");
}

async function main() {
  await testWildKindGuard();
  await testWildInInterpolation();
  console.log("wild-path.test.ts OK");
}

main().catch((err) => { console.error(err); process.exit(1); });
