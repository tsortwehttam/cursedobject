import assert from "node:assert/strict";
import { facadeWorld } from "../lib/FacadeWorld";
import { applyEvent, createWorld, getRunText } from "../lib/WorldRuntime";

let time = 0;
const clock = {
  now: () => {
    time += 1;
    return time;
  },
};

const world = createWorld(facadeWorld, clock);

const look = applyEvent(
  {
    type: "look_at",
    actor: "Player",
    target: "Apartment",
    body: null,
    observers: ["Grace", "Trip"],
  },
  world,
  clock,
);

assert.equal(look.ok, true);
assert.match(getRunText(look).join("\n"), /Trip and Grace's apartment/);

const talk = applyEvent(
  {
    type: "talk_1",
    actor: "Player",
    target: "Grace",
    body: "Are you okay?",
    observers: ["Trip"],
  },
  world,
  clock,
);

assert.equal(talk.ok, true);
assert.match(getRunText(talk).join("\n"), /disappear into the decor/);

const secondTalk = applyEvent(
  {
    type: "talk_2",
    actor: "Player",
    target: "Grace",
    body: "What happened?",
    observers: ["Trip"],
  },
  world,
  clock,
);

assert.equal(secondTalk.ok, true);
assert.doesNotMatch(getRunText(secondTalk).join("\n"), /had an affair/);
assert.equal(Object.prototype.hasOwnProperty.call(world.knowledge, "Player:Grace:secret.affair"), false);

const confession = applyEvent(
  {
    type: "confess_affair",
    actor: "Player",
    target: "Grace",
    body: "Did something happen when you were married?",
    observers: ["Trip"],
  },
  world,
  clock,
);

assert.equal(confession.ok, true);
assert.match(getRunText(confession).join("\n"), /had an affair/);
assert.equal(world.knowledge["Player:Grace:secret.affair"]?.value, "Grace had an affair when she and Trip were first married.");

const use = applyEvent(
  {
    type: "serve_drink_1",
    actor: "Player",
    target: "BarCart",
    body: null,
    observers: ["Grace", "Trip"],
  },
  world,
  clock,
);

assert.equal(use.ok, true);
assert.match(getRunText(use).join("\n"), /Just one/);

applyEvent(
  {
    type: "serve_drink_2",
    actor: "Player",
    target: "BarCart",
    body: null,
    observers: ["Grace", "Trip"],
  },
  world,
  clock,
);

const drunk = applyEvent(
  {
    type: "serve_drink_3",
    actor: "Player",
    target: "BarCart",
    body: null,
    observers: ["Grace", "Trip"],
  },
  world,
  clock,
);

assert.equal(drunk.ok, true);
assert.match(getRunText(drunk).join("\n"), /I'm gay/);
assert.equal(world.state.Trip?.traits.drinks, 3);
assert.equal(world.knowledge["Player:Trip:secret.sexuality"]?.value, "gay");

const full = applyEvent(
  {
    type: "serve_drink_full",
    actor: "Player",
    target: "BarCart",
    body: null,
    observers: ["Grace", "Trip"],
  },
  world,
  clock,
);

assert.match(getRunText(full).join("\n"), /fully drunk/);
assert.equal(world.state.Trip?.traits.drinks, 3);
