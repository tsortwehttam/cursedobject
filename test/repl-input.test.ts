import assert from "node:assert/strict";
import { parseREPLInput } from "../eng/REPLInput";

assert.deepEqual(parseREPLInput("hello Grace"), {
  kind: "event",
  slots: ["Player", "sayto", "Room", "hello Grace"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseREPLInput("/say grace I missed you"), {
  kind: "event",
  slots: ["Player", "sayto", "Grace", "I missed you"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseREPLInput("/look painting"), {
  kind: "event",
  slots: ["Player", "lookat", "Painting"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseREPLInput("/give drink to trip"), {
  kind: "event",
  slots: ["Player", "giveto", "Trip", "Drink"],
  obs: ["Grace", "Trip"],
});

assert.deepEqual(parseREPLInput("/events"), { kind: "meta", command: "events" });
assert.deepEqual(parseREPLInput("/quit"), { kind: "quit" });

console.log("repl-input.test.ts OK");
