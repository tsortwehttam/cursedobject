import assert from "node:assert/strict";
import { collectEntityContext, parseWithClause, splitParams } from "../eng/adapters/Adapter";
import type { FacAdapter } from "../eng/adapters/Adapter";
import { Facsimile, type World } from "../eng/Engine";
import { parse } from "../eng/Parser";
import { createTerminalAdapter } from "../eng/adapters/TerminalAdapter";

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

async function testPrint() {
  const lines: string[] = [];
  const adapter = createTerminalAdapter({ write: (text) => lines.push(text), style: () => "gray" });
  const method = adapter.methods.narrate;
  assert.ok(method);
  await method({
    world: { entities: {}, events: [] },
    env: {},
    kind: "narrate",
    rawText: "Trip: hello",
    interpolate: (text) => text,
    evalExpr: async () => null,
  });
  assert.deepEqual(lines, ["\u001b[90mTrip: hello\u001b[0m\n"]);
}

async function testEventListener() {
  const seen: string[] = [];
  const program = parse(`
    Player inspect {
      Scene.count incr;
    }
  `);
  const world: World = { entities: { Player: {}, Scene: {} }, events: [] };
  const adapter: FacAdapter = {
    methods: {},
    events: [
      async ({ event }) => {
        seen.push(event.slots.map(String).join(" "));
      },
    ],
  };
  const engine = new Facsimile(world, adapter, program);
  await engine.emit(engine.mkEvent(["Player", "inspect"]));
  assert.deepEqual(seen, ["Player inspect", "Scene.count incr"]);
}

const program = parse(`
  Player inspect {
    Scene.visible = <<probe with public.*, clothing.* where location == Player.location>>;
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
  events: [],
  methods: {
    probe: async (ctx) => collectEntityContext(splitParams(ctx.rawText), ctx),
  },
};

const engine = new Facsimile(world, adapter, program);

async function run() {
  await testPrint();
  await testEventListener();
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
