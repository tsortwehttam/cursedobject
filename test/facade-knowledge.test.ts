import assert from "node:assert/strict";
import { facadeWorld } from "../lib/FacadeWorld";
import { applyEvent, createWorld, getRunText } from "../lib/WorldRuntime";
import { EventInput } from "../lib/WorldTypes";

let time = 0;
const clock = {
  now: () => {
    time += 1;
    return time;
  },
};

const world = createWorld(facadeWorld, clock);

function run(event: EventInput): string {
  const result = applyEvent(event, world, clock);
  assert.equal(result.ok, true);
  return getRunText(result).join("\n");
}

function talkGrace(type: string, body: string): string {
  return run({
    type,
    actor: "Player",
    target: "Grace",
    body,
    observers: ["Trip"],
  });
}

assert.match(talkGrace("talk_1", "How are you?"), /disappear into the decor/);

const casual = talkGrace("talk_2", "What happened?");

assert.doesNotMatch(casual, /had an affair/);
assert.equal(Object.prototype.hasOwnProperty.call(world.knowledge, "Player:Grace:secret.affair"), false);
assert.equal(Object.prototype.hasOwnProperty.call(world.knowledge, "Trip:Grace:secret.affair"), false);

const confession = talkGrace("confess_affair", "Did something happen when you were married?");

assert.match(confession, /had an affair/);
assert.equal(world.knowledge["Player:Grace:secret.affair"]?.value, "Grace had an affair when she and Trip were first married.");
assert.equal(world.knowledge["Trip:Grace:secret.affair"]?.value, "Grace had an affair when she and Trip were first married.");
