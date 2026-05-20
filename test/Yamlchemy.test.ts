import assert from "node:assert/strict";
import { SerialValue } from "../lib/CoreTypings";
import { load, setValueAtPath } from "../yamlchemy";

async function main() {
  const yam = load(
    `
foo: 1
bar: bum
truthy: 1
fallback: nope
yay:
  - heave
  - ho
wow: "{{bar}}"
hooray: "{{last(yay)}}"
blah: -> 1 + 2
longer: The distance is {{manhattan(123, 456, 789, 100)}}.
choice: "{{cool|great|amazing}}"
choiceRand: "{{~cool|great|amazing}}"
choiceCycle: "{{&cool|great|amazing}}"
choiceOnce: "{{!cool|great|amazing}}"
notExpr: "{{!truthy}}"
notOrExpr: "{{!truthy || fallback}}"
inline: Hi <<#echo name Ada; title Dr>>
inline2: Hi <<echo name Ada; title Dr>>
loneObj: <<obj>>
loneArr: <<arr>>
dotted: <<react.emotions>>
dottedDeep: <<a.b.c>>
embedObj: "got: <<obj>>"
bound: |
  <<#score:result 7>>
  {{#if result > 5}}
    high {{bar}}
  {{elseif result == 5}}
    even
  {{else}}
    low
  {{/if}}
braced: '{{#if true}}{yes}{{/if}}'
meow:
  a: "{{foo + blah}}"
  b: "{{hooray}}"
people:
  - name: "{{bar}}"
    score: -> 10 + 1
  - name: Ada
    score: 7
names: -> select("people.*.name")
scores: -> select("people.*.score")
directName: "{{people.0.name}}"
firstName: "{{get('people.0.name')}}"
missingOne: -> get("people.9.name")
missingMany: -> select("people.*.missing")
dynamicName: -> people[1].name
`,
    {
      seed: 123,
      fn: {
        manhattan(x1: SerialValue, x2: SerialValue, y1: SerialValue, y2: SerialValue) {
          return Math.abs(Number(x1) - Number(y1)) + Math.abs(Number(x2) - Number(y2));
        },
      },
      io: {
        echo(params) {
          return `${params.pairs.title} ${params.pairs.name}`;
        },
        score(params) {
          return params.artifacts[0];
        },
        obj() {
          return { a: 1, b: [2, 3] };
        },
        arr() {
          return [1, 2, 3];
        },
        "react.emotions"() {
          return { joy: 1 };
        },
        "a.b.c"() {
          return "deep";
        },
      },
    },
  );

  assert.equal(await yam.calc("wow"), "bum");
  assert.equal(await yam.calc("hooray"), "ho");
  assert.equal(await yam.calc("blah"), 3);
  assert.equal(await yam.calc("longer"), "The distance is 1022.");
  assert.match(String(await yam.calc("choice")), /^(cool|great|amazing)$/);
  assert.match(String(await yam.calc("choiceRand")), /^(cool|great|amazing)$/);
  assert.match(String(await yam.calc("choiceCycle")), /^(cool|great|amazing)$/);
  assert.match(String(await yam.calc("choiceOnce")), /^(cool|great|amazing)$/);
  assert.equal(await yam.calc("notExpr"), "false");
  assert.equal(await yam.calc("notOrExpr"), "nope");
  assert.equal(await yam.calc("inline"), "Hi Dr Ada");
  assert.equal(await yam.calc("inline2"), "Hi Dr Ada");
  assert.deepEqual(await yam.calc("loneObj"), { a: 1, b: [2, 3] });
  assert.deepEqual(await yam.calc("loneArr"), [1, 2, 3]);
  assert.deepEqual(await yam.calc("dotted"), { joy: 1 });
  assert.equal(await yam.calc("dottedDeep"), "deep");
  assert.equal(await yam.calc("embedObj"), 'got: {"a":1,"b":[2,3]}');
  assert.equal(String(await yam.calc("bound")).trim(), "high bum");
  assert.equal(await yam.calc("braced"), "{yes}");
  assert.deepEqual(await yam.calc("meow"), { a: "4", b: "ho" });
  assert.deepEqual(await yam.calc("names"), ["bum", "Ada"]);
  assert.deepEqual(await yam.calc("scores"), [11, 7]);
  assert.equal(await yam.calc("directName"), "bum");
  assert.equal(await yam.calc("firstName"), "bum");
  assert.equal(await yam.calc("missingOne"), null);
  assert.deepEqual(await yam.calc("missingMany"), []);
  assert.equal(await yam.calc("dynamicName"), "Ada");
  assert.equal(await yam.evaluate("foo + blah"), 4);
  assert.equal(await yam.evaluate("people.0.name"), "bum");
  assert.equal(await yam.evaluate("people[1].name"), "Ada");
  assert.deepEqual(await yam.evaluate("select('people.*.score')"), [11, 7]);
  assert.equal(await yam.evaluate("get('people.9.name')"), null);
  assert.equal(yam.raw("bar"), "bum");
  assert.equal(yam.has("people.0.name"), true);
  assert.equal(yam.has("people.9.name"), false);

  const all = await yam.calcAll();
  assert.equal(all.bar, "bum");
  assert.deepEqual(all.meow, { a: "4", b: "ho" });

  const dynamic = load(`
people:
  - name: Grace
    score: 11
  - name: Ada
    score: 7
emotions:
  Ada:
    attraction: 0.7
score: -> people[other.index].score
attraction: -> emotions[actor.id].attraction
`);
  assert.equal(await dynamic.calc("score", { other: { index: 1 } }), 7);
  assert.equal(await dynamic.calc("attraction", { actor: { id: "Ada" } }), 0.7);
  assert.equal(await dynamic.evaluate("emotions[actor.id].attraction", { actor: { id: "Ada" } }), 0.7);
  assert.equal(await dynamic.evaluate('emotions["Ada"].attraction'), 0.7);

  const scoped = load(`
name: Ada
greeting: Hello {{ name }}
alias: "{{ get('self.name') }}"
`);
  assert.equal(await scoped.calc("greeting"), "Hello Ada");
  assert.equal(await scoped.calc("greeting", { name: "Grace" }), "Hello Grace");
  assert.equal(await scoped.evaluate("name", { name: "Grace" }), "Grace");
  assert.equal(await scoped.calc("greeting"), "Hello Ada");
  assert.equal(await scoped.calc("alias", { self: { name: "Lovelace" } }), "Lovelace");
  assert.deepEqual(await scoped.calcAll({ name: "Grace" }), { name: "Ada", greeting: "Hello Grace", alias: "" });
  assert.equal(await scoped.calc("greeting"), "Hello Ada");

  const forked = scoped.fork({ params: { name: "Katherine" } });
  assert.equal(await forked.calc("greeting"), "Hello Katherine");
  assert.equal(await scoped.calc("greeting"), "Hello Ada");

  const mut = load(
    `
relations:
  sarah:
    emotions:
      anger: 1
      arousal: 0
emotions:
  arousal: 1
`,
    {
      fn: { incr: (n: SerialValue) => Number(n) + 1 },
    },
  );
  await mut.update(
    {
      "relations.{{other}}.emotions.arousal": "-> incr(this)",
      emotions: { arousal: "-> incr(this) + 2.5" },
    },
    { other: "sarah" },
  );
  assert.equal(await mut.calc("relations.sarah.emotions.arousal"), 1);
  assert.equal(await mut.calc("emotions.arousal"), 4.5);

  await mut.update({ "relations.*.emotions.anger": "-> this + 10" });
  assert.equal(await mut.calc("relations.sarah.emotions.anger"), 11);

  await assert.rejects(() => mut.update({ nope: 1 }, {}, { create: false }), /Unknown update path/);
  await mut.update({ nested: { brand: "new" } });
  assert.equal(await mut.calc("nested.brand"), "new");
  await mut.update({
    "relations.sarah.emotions+": { trust: 0.4 },
    "emotions.tags+": ["hungry"],
    "emotions.note+": "hi",
  });
  await mut.update({
    "emotions.tags+": ["wary"],
    "emotions.note+": " there",
  });
  assert.deepEqual(await mut.calc("relations.sarah.emotions"), { anger: 11, arousal: 1, trust: 0.4 });
  assert.deepEqual(await mut.calc("emotions.tags"), ["hungry", "wary"]);
  assert.equal(await mut.calc("emotions.note"), "hi there");

  const patched = { obj: { a: 1 }, list: ["a"], text: "a" };
  setValueAtPath(patched, "obj+", { b: 2 });
  setValueAtPath(patched, "list+", ["b"]);
  setValueAtPath(patched, "text+", "b");
  assert.deepEqual(patched, { obj: { a: 1, b: 2 }, list: ["a", "b"], text: "ab" });

  mut.clear();
  assert.equal(await mut.calc("emotions.arousal"), 1);
  assert.equal(await mut.calc("relations.sarah.emotions.anger"), 1);
  assert.equal(mut.has("nested.brand"), false);

  const variations = load(`
cyc: "{{&a|b|c}}"
seq: "{{x|y|z}}"
once: "{{!p|q|r}}"
`);
  assert.equal(await variations.calc("cyc"), "a");
  assert.equal(await variations.calc("cyc"), "b");
  assert.equal(await variations.calc("cyc"), "c");
  assert.equal(await variations.calc("cyc"), "a");
  assert.equal(await variations.calc("seq"), "x");
  assert.equal(await variations.calc("seq"), "y");
  assert.equal(await variations.calc("seq"), "z");
  assert.equal(await variations.calc("seq"), "z");
  assert.equal(await variations.calc("once"), "p");
  assert.equal(await variations.calc("once"), "q");
  assert.equal(await variations.calc("once"), "r");
  assert.equal(await variations.calc("once"), "");

  const arrowTpl = load(`
pick: -> '{{&grub|mott|skarn}}'
gate: -> id == '{{&a|b|c}}'
`);
  assert.equal(await arrowTpl.calc("pick"), "grub");
  assert.equal(await arrowTpl.calc("pick"), "mott");
  assert.equal(await arrowTpl.calc("gate", { id: "a" }), true);
  assert.equal(await arrowTpl.calc("gate", { id: "b" }), true);
  assert.equal(await arrowTpl.calc("gate", { id: "x" }), false);

  assert.equal(await load("out: '{{missing}}'").calc("out"), "");
  assert.equal(await yam.evaluate("missing"), null);
  assert.equal(await yam.evaluate("missing ?? 1"), 1);
  assert.equal(await yam.evaluate("missing + 1"), 1);
  await assert.rejects(() => load("bad: '<<#missing ok>>'").calc("bad"), /Unknown io directive: missing/);
  await assert.rejects(() => load("bad: '<<missing ok>>'").calc("bad"), /Unknown io directive: missing/);
  assert.equal(await load("ok: 'a << b'").calc("ok"), "a << b");
  assert.throws(() => load({ constructor: "bad" }), /Invalid key/);

  const fns = load({
    sync: () => 42,
    asyncNum: async () => 7,
    asyncObj: async () => ({ a: 1, b: [2, 3] }),
    tpl: () => "-> 1 + 2",
    nested: { fn: async () => "deep" },
  });
  assert.equal(await fns.calc("sync"), 42);
  assert.equal(await fns.calc("asyncNum"), 7);
  assert.deepEqual(await fns.calc("asyncObj"), { a: 1, b: [2, 3] });
  assert.equal(await fns.calc("tpl"), 3);
  assert.deepEqual(await fns.calc("nested"), { fn: "deep" });

  const rngHandle = load({ a: "-> getRandInt(1,1000)" }, { seed: "abc" });
  const before = rngHandle.rng.getState();
  const first = await rngHandle.evaluate("getRandInt(1,1000)");
  const afterFirst = rngHandle.rng.getState();
  assert.ok(rngHandle.cycle() > 0, "cycle advances on rng use");
  rngHandle.rng.setState(before);
  const replay = await rngHandle.evaluate("getRandInt(1,1000)");
  assert.equal(first, replay, "setState restores rng for deterministic replay");
  assert.deepEqual(rngHandle.rng.getState(), afterFirst);

  const peekHandle = load({ a: 1, b: { c: 2 } });
  const peeked = await peekHandle.peek(["a", "b.c", "nope"]);
  assert.deepEqual(peeked, { a: 1, "b.c": 2, nope: null });

  const resolveHandle = load({ name: "Ada", count: 3 });
  const resolved = await resolveHandle.resolve({
    greeting: "Hello {{name}}",
    doubled: "-> count * 2",
    nested: ["-> count + 1", { lit: 42 }],
  });
  assert.deepEqual(resolved, {
    greeting: "Hello Ada",
    doubled: 6,
    nested: [4, { lit: 42 }],
  });

  const updHandle = load({ score: 5, tags: ["x"], info: { mood: "calm" } });
  const resolvedA = await updHandle.update({ score: "-> score + 1" });
  assert.deepEqual(resolvedA.values, { score: 6 });
  const resolvedB = await updHandle.update({ "tags+": ["y"], "info+": { fear: 0.2 } });
  assert.deepEqual(resolvedB.values, { tags: ["x", "y"], info: { mood: "calm", fear: 0.2 } });
  const resolvedC = await updHandle.update({ "missing.nested": 42 });
  assert.deepEqual(resolvedC.values, { "missing.nested": 42 });

  const undoHandle = load(
    {
      score: 1,
      pick: "{{&a|b|c}}",
      roll: 0,
    },
    { seed: "undo" },
  );
  assert.equal(await undoHandle.calc("pick"), "a");
  const rngBefore = undoHandle.rng.getState();
  const undoResult = await undoHandle.update({
    score: "-> score + 1",
    "missing.deep": "{{&a|b|c}}",
    roll: "-> getRandInt(1, 1000)",
  });
  assert.equal(undoResult.values.score, 2);
  assert.equal(undoResult.values["missing.deep"], "b");
  assert.equal(typeof undoResult.values.roll, "number");
  assert.equal(await undoHandle.calc("score"), 2);
  assert.equal(undoHandle.has("missing.deep"), true);
  assert.notDeepEqual(undoHandle.rng.getState(), rngBefore);
  undoHandle.restore(undoResult.undo);
  assert.equal(await undoHandle.calc("score"), 1);
  assert.equal(undoHandle.has("missing.deep"), false);
  assert.deepEqual(undoHandle.rng.getState(), rngBefore);
  assert.equal(await undoHandle.calc("pick"), "b");

  const parentHandle = load({ parent: 1 });
  const parentUndo = await parentHandle.update({ "parent.child": 2 });
  assert.deepEqual(await parentHandle.calc("parent"), { child: 2 });
  parentHandle.restore(parentUndo.undo);
  assert.equal(await parentHandle.calc("parent"), 1);

  const stackHandle = load({ score: 1 });
  const undoA = await stackHandle.update({ score: 2 });
  const undoB = await stackHandle.update({ score: 3 });
  assert.equal(await stackHandle.calc("score"), 3);
  stackHandle.restore(undoB.undo);
  assert.equal(await stackHandle.calc("score"), 2);
  stackHandle.restore(undoA.undo);
  assert.equal(await stackHandle.calc("score"), 1);

  const guardHandle = load({ score: 1 });
  const guardA = await guardHandle.update({ score: 2 });
  await guardHandle.update({ score: 3 });
  assert.throws(() => guardHandle.restore(guardA.undo), /Cannot restore undo patch/);
}

void main();
