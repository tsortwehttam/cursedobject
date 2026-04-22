import assert from "node:assert/strict";
import { deepGet, deepSet } from "../lib/PathHelpers";

// deepGet
const obj = { a: { b: { c: 42, d: "x" } }, n: null, arr: [1, 2] };
assert.equal(deepGet(obj, ["a", "b", "c"]), 42);
assert.equal(deepGet(obj, ["a", "b", "d"]), "x");
assert.equal(deepGet(obj, ["missing"]), null);
assert.equal(deepGet(obj, ["a", "b", "missing"]), null);
assert.equal(deepGet(obj, ["n", "anything"]), null);
assert.equal(deepGet(obj, []), null);
assert.equal(deepGet(obj, ["arr", "0"]), 1);

// deepSet: creates intermediate objects
const o1: Record<string, unknown> = {};
deepSet(o1, ["a", "b", "c"], 7);
assert.deepEqual(o1, { a: { b: { c: 7 } } });

// deepSet: overwrites existing leaf
const o2: Record<string, unknown> = { a: { b: 1 } };
deepSet(o2, ["a", "b"], 2);
assert.deepEqual(o2, { a: { b: 2 } });

// deepSet: overwrites non-object midway with a new object container
const o3: Record<string, unknown> = { a: 5 };
deepSet(o3, ["a", "b"], 9);
assert.deepEqual(o3, { a: { b: 9 } });

// deepSet: no-op on empty segs
const o4: Record<string, unknown> = { keep: true };
deepSet(o4, [], "noop");
assert.deepEqual(o4, { keep: true });

// deepSet: replaces array midway
const o5: Record<string, unknown> = { a: [1, 2] };
deepSet(o5, ["a", "x"], true);
assert.deepEqual(o5, { a: { x: true } });

console.log("path-helpers.test.ts OK");
