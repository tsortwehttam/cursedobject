import assert from "node:assert/strict";
import { parse } from "../eng/Parser";
import { matchAction, queryActions, queryEvents, selectEvents } from "../eng/Query";
import { Facsimile, type World } from "../eng/Engine";

const world: World = {
  entities: {},
  events: [
    { slots: ["Player", "sayto", "Trip", "hello"], obs: [], ts: 1 },
    { slots: ["Trip", "sayto", "Player", "hi"], obs: [], ts: 2 },
    { slots: ["Player", "sayto", "Grace", "nice to see you"], obs: ["Trip"], ts: 3 },
    { slots: ["Grace", "sayto", "Player", "thanks"], obs: ["Trip"], ts: 4 },
    { slots: ["Trip", "sayto", "Grace", "everything ok?"], obs: ["Player"], ts: 5 },
    { slots: ["Trip.feelings.drunkenness", "incr"], obs: [], ts: 6 },
    { slots: ["Trip.feelings.tension", "incr"], obs: [], ts: 7 },
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
  const r = selectEvents(world, "Trip.feelings.* ...");
  assert.equal(r.length, 2);
}

// Specific mut event
{
  const r = selectEvents(world, "Trip.feelings.drunkenness incr");
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

const query = {
  actor: "John",
  target: "Bill",
  value: null,
  obs: [],
};

// Partial inverse match binds actor and target wildcards and reads the literal verb.
{
  const [handler] = parse("$1 sayto $2 {}");
  const r = matchAction(handler, query);
  assert.ok(r);
  assert.equal(r.verb, "sayto");
  assert.equal(r.env["$1"], "John");
  assert.equal(r.env["$2"], "Bill");
  assert.equal(r.env["$actor"], "John");
  assert.equal(r.env["$target"], "Bill");
}

// Bind consistency rejects handlers whose repeated wildcard cannot match the query.
{
  const [handler] = parse("$1 sayto $1 {}");
  const r = matchAction(handler, query);
  assert.equal(r, null);
}

// Non-literal verbs are not exposed as action names.
{
  const [handler] = parse("$1 /sayto|waveat/ $2 {}");
  const r = matchAction(handler, query);
  assert.equal(r, null);
}

async function runActionQueryTests() {
  // queryActions evaluates handler conditions without emitting events.
  {
    const program = parse(`
      $1 sayto $2 if John.energy > 0 {}
      $1 waveat $2 if John.energy < 1 {}
      $1 lookat $2 {}
      $1 listen if has($obs, "Bill") {}
      Trip sayto Grace {}
      $1 give $2 $item if $item == "flower" {}
    `);
    const actionWorld: World = {
      entities: {
        John: { energy: 1 },
        Bill: {},
        Trip: {},
        Grace: {},
      },
      events: [],
    };
    const engine = new Facsimile(actionWorld, { methods: {}, events: [] }, program);

    const r = await queryActions(engine, query);
    assert.deepEqual(
      r.map((m) => m.verb),
      ["sayto", "lookat"],
    );
    assert.equal(actionWorld.events.length, 0);
  }

  // Query context can bind value slots and observations used by conditions.
  {
    const program = parse(`
      $1 give $2 $item if $item == "flower" {}
      $1 listen if has($obs, "Bill") {}
    `);
    const actionWorld: World = {
      entities: { John: {}, Bill: {} },
      events: [],
    };
    const engine = new Facsimile(actionWorld, { methods: {}, events: [] }, program);

    const r = await queryActions(engine, {
      actor: "John",
      target: "Bill",
      value: "flower",
      obs: ["Bill"],
    });

    assert.deepEqual(
      r.map((m) => m.verb),
      ["give"],
    );
    assert.equal(r[0].env["$item"], "flower");

    const observed = await queryActions(engine, {
      actor: "John",
      target: null,
      value: null,
      obs: ["Bill"],
    });

    assert.deepEqual(
      observed.map((m) => m.verb),
      ["listen"],
    );
  }
}

runActionQueryTests()
  .then(() => console.log("query.test.ts OK"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
