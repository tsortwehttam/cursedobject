import assert from "node:assert/strict";
import { story } from "../fic/facade/adapter";

const parseInput = story.parseInput!;

assert.deepEqual(parseInput("hello Grace"), {
  kind: "event",
  slots: ["Player", "sayto", "Apartment", "hello Grace"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseInput("/say grace I missed you"), {
  kind: "event",
  slots: ["Player", "sayto", "Grace", "I missed you"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseInput("/look painting"), {
  kind: "event",
  slots: ["Player", "lookat", "Painting"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseInput("/listen"), {
  kind: "event",
  slots: ["Player", "listen", "Door"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseInput("/give drink to trip"), {
  kind: "event",
  slots: ["Player", "giveto", "Trip", "Drink"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseInput("/events"), { kind: "meta", command: "events" });
assert.deepEqual(parseInput("/actions"), { kind: "meta", command: "actions" });
assert.deepEqual(parseInput("/quit"), { kind: "quit" });

console.log("repl-input.test.ts OK");
