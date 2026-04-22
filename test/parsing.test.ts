import assert from "node:assert/strict";
import {
  parseContextClause,
  parseShorthandEvent,
  parseVariation,
} from "../eng/Parsing";

// parseVariation
assert.deepEqual(parseVariation("tall|very tall|super tall"), ["tall", "very tall", "super tall"]);
assert.deepEqual(parseVariation("a|b"), ["a", "b"]);
assert.equal(parseVariation("a"), null); // no pipe
assert.equal(parseVariation("foo || bar"), null); // logical-or operator
assert.equal(parseVariation("foo(a|b)"), null); // function call
assert.equal(parseVariation("x < y | z"), null); // comparator present

// parseContextClause
assert.equal(parseContextClause("context Trip.*"), "Trip.*");
assert.equal(parseContextClause("context  Grace.body.height"), "Grace.body.height");
assert.equal(parseContextClause("Trip.*"), null);
assert.equal(parseContextClause("context"), null);

// parseShorthandEvent
assert.deepEqual(parseShorthandEvent('["Player","sayto","Trip","hi"]'), ["Player", "sayto", "Trip", "hi"]);
assert.deepEqual(parseShorthandEvent("Player sayto Trip Hello Trip"), ["Player", "sayto", "Trip", "Hello Trip"]);
assert.deepEqual(parseShorthandEvent('Player sayto Trip "quoted text"'), ["Player", "sayto", "Trip", "quoted text"]);
assert.deepEqual(parseShorthandEvent("Trip.drinks incr"), ["Trip.drinks", "incr"]);
assert.deepEqual(parseShorthandEvent("Player sayto Grace"), ["Player", "sayto", "Grace"]);
assert.throws(() => parseShorthandEvent("only-one-token"));

console.log("parsing.test.ts OK");
