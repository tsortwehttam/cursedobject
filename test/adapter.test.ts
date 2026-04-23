import assert from "node:assert/strict";
import { collectEntityContext, parseWithClause, splitParams } from "../eng/Adapter";
import type { FacAdapter } from "../eng/Adapter";
import { Facsimile, type World } from "../eng/Engine";
import { parse } from "../eng/Parser";

{
  const clause = parseWithClause('with public.*, clothing.* where location == "LivingRoom"');
  assert.deepEqual(clause, {
    patterns: ["public.*", "clothing.*"],
    cond: 'location == "LivingRoom"',
  });
}

{
  const clause = parseWithClause("with public.*");
  assert.deepEqual(clause, {
    patterns: ["public.*"],
    cond: null,
  });
}

const program = parse(`
  Player inspect {
    Scene.visible = <<#probe with public.*, clothing.* where location == LivingRoom>>;
  }
`);

const world: World = {
  entities: {
    LivingRoom: {},
    Player: { location: "LivingRoom" },
    John: {
      location: "LivingRoom",
      public: { name: "John", mood: "curious" },
      clothing: { shirt: "blue" },
      hidden: { secret: "ignore" },
    },
    Bill: {
      location: "Kitchen",
      public: { name: "Bill" },
      clothing: { hat: "cap" },
    },
    Lamp: {
      location: "LivingRoom",
      public: { name: "lamp", state: "on" },
    },
    Scene: {},
  },
  events: [],
};

const adapter: FacAdapter = {
  methods: {
    probe: async (ctx) => collectEntityContext(splitParams(ctx.rawText), ctx),
  },
};

const engine = new Facsimile(world, adapter, program);

async function run() {
  await engine.emit(engine.mkEvent(["Player", "inspect"]));
  assert.deepEqual(world.entities.Scene.visible, {
    entities: {
      John: {
        public: { name: "John", mood: "curious" },
        clothing: { shirt: "blue" },
      },
      Lamp: {
        public: { name: "lamp", state: "on" },
      },
    },
  });
  assert.equal(world.events.length, 2);
}

run()
  .then(() => console.log("adapter.test.ts OK"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
