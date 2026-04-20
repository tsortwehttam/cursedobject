import assert from "node:assert/strict";
import { applyEvent, createWorld, getRunText } from "../lib/WorldRuntime";
import { AuthoredWorld } from "../lib/WorldTypes";

let time = 999;
const clock = {
  now: () => {
    time += 1;
    return time;
  },
};

const authored: AuthoredWorld = {
  Person: {
    type: null,
    inherits: [],
    traits: {
      public: {
        can_see: true,
      },
      private: {},
    },
    scripts: {},
    handlers: {},
    anchors: {},
    transform: null,
    tags: [],
  },
  Alice: {
    type: null,
    inherits: ["Person"],
    traits: { public: {}, private: {} },
    scripts: {},
    handlers: {},
    anchors: {},
    transform: null,
    tags: [],
  },
  Bob: {
    type: null,
    inherits: ["Person"],
    traits: {
      public: {
        hair_color: "blue",
        otherEntity: "Bob",
      },
      private: {},
    },
    scripts: {
      announce: 'say("I am {{ $self }}.")',
    },
    handlers: {
      look_at: {
        when: "{{ hasType($actor, 'Person') && getTrait($actor, 'can_see') }}",
        super: false,
        action: 'convey($self, "hair_color", $actor)',
      },
      test_script_ref: {
        when: null,
        super: false,
        action: "run(otherEntity.announce)",
      },
    },
    anchors: {},
    transform: null,
    tags: [],
  },
  Carol: {
    type: null,
    inherits: ["Person"],
    traits: { public: {}, private: {} },
    scripts: {},
    handlers: {
      "perceive/look_at": {
        when: null,
        super: false,
        action:
          'learn($self, $event.actor, "looked_at", $event.body.of, { eventId: $event.id, actor: $event.actor, note: null })',
      },
    },
    anchors: {},
    transform: null,
    tags: [],
  },
  Dave: {
    type: null,
    inherits: ["Person"],
    traits: { public: {}, private: {} },
    scripts: {},
    handlers: {},
    anchors: {},
    transform: null,
    tags: [],
  },
};

const world = createWorld(authored, clock);

const result = applyEvent(
  {
    type: "look_at",
    actor: "Alice",
    target: "Bob",
    body: null,
    observers: ["Carol", "Dave"],
  },
  world,
  clock,
);

assert.equal(result.ok, true);
assert.deepEqual(result.run.processed, ["evt_1", "evt_2", "evt_3"]);
assert.equal(world.revision, 3);
assert.deepEqual(
  world.events.map((event) => event.type),
  ["look_at", "perceive/look_at", "perceive/look_at"],
);
assert.deepEqual(
  world.events.map((event) => event.parent),
  [null, "evt_1", "evt_1"],
);
assert.equal(world.knowledge["Alice:Bob:hair_color"]?.value, "blue");
assert.equal(world.knowledge["Carol:Alice:looked_at"]?.value, "evt_1");

const scriptResult = applyEvent(
  {
    type: "test_script_ref",
    actor: "Alice",
    target: "Bob",
    body: null,
    observers: [],
  },
  world,
  clock,
);

assert.equal(scriptResult.ok, true);
assert.deepEqual(getRunText(scriptResult), ["I am Bob."]);
