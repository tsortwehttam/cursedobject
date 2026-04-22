import assert from "node:assert/strict";
import { queryEvents, selectEvents } from "../eng/Query";
import type { World } from "../eng/Engine";

const world: World = {
  entities: {},
  events: [
    { slots: ["Player", "sayto", "Trip", "hello"], obs: [], ts: 1 },
    { slots: ["Trip", "sayto", "Player", "hi"], obs: [], ts: 2 },
    { slots: ["Player", "sayto", "Grace", "nice to see you"], obs: ["Trip"], ts: 3 },
    { slots: ["Grace", "sayto", "Player", "thanks"], obs: ["Trip"], ts: 4 },
    { slots: ["Trip", "sayto", "Grace", "everything ok?"], obs: ["Player"], ts: 5 },
    { slots: ["Trip.drinks", "incr"], obs: [], ts: 6 },
    { slots: ["Trip.tension", "incr"], obs: [], ts: 7 },
  ],
};

// Literal target match
{
  const r = selectEvents(world, "* sayto Trip *");
  assert.equal(r.length, 1);
  assert.equal(r[0].ts, 1);
}

// Permissive: shorter pattern matches longer events (auto-rest)
{
  const r = selectEvents(world, "* sayto Trip");
  assert.equal(r.length, 1);
  assert.equal(r[0].ts, 1);
}
{
  const r = selectEvents(world, "* sayto");
  // Matches all 5 sayto events regardless of target/value.
  assert.equal(r.length, 5);
}

// Trailing rest — matches variable arity (3+ slots starting with * sayto Trip)
{
  const r = selectEvents(world, "* sayto Trip ...");
  assert.equal(r.length, 1);
  assert.equal(r[0].ts, 1);
}

// Wildcard bind
{
  const r = queryEvents(world, "$who sayto Trip $msg");
  assert.equal(r.length, 1);
  assert.equal(r[0].env["$who"], "Player");
  assert.equal(r[0].env["$msg"], "hello");
}

// 2-slot mut events via rest
{
  const r = selectEvents(world, "Trip.* ...");
  assert.equal(r.length, 2);
}

// Specific mut event
{
  const r = selectEvents(world, "Trip.drinks incr");
  assert.equal(r.length, 1);
  assert.equal(r[0].ts, 6);
}

// Regex value match
{
  const r = selectEvents(world, "* sayto * /thank/");
  assert.equal(r.length, 1);
  assert.equal(r[0].slots[0], "Grace");
}

// No matches
{
  const r = selectEvents(world, "* lookat *");
  assert.equal(r.length, 0);
}

// Bind consistency — same wild name must resolve same across slots
{
  const r = queryEvents(world, "$x sayto $x ...");
  assert.equal(r.length, 0, "no event has actor == target");
}

// Bind repetition that DOES match
{
  const world2: World = {
    entities: {},
    events: [{ slots: ["Trip", "sayto", "Trip", "monologue"], obs: [], ts: 1 }],
  };
  const r = queryEvents(world2, "$x sayto $x $m");
  assert.equal(r.length, 1);
  assert.equal(r[0].env["$x"], "Trip");
}

console.log("query.test.ts OK");
