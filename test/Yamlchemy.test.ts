import assert from "node:assert/strict";
import { SerialValue } from "../lib/CoreTypings";
import { load } from "../yamlchemy";

async function main() {
  const yam = load(
    `
foo: 1
bar: bum
yay:
  - heave
  - ho
wow: "{{bar}}"
hooray: "{{last(yay)}}"
blah: -> 1 + 2
longer: The distance is {{manhattan(123, 456, 789, 100)}}.
choice: "{{cool|great|amazing}}"
inline: Hi <<#echo name Ada; title Dr>>
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
      },
    },
  );

  assert.equal(await yam.calc("wow"), "bum");
  assert.equal(await yam.calc("hooray"), "ho");
  assert.equal(await yam.calc("blah"), 3);
  assert.equal(await yam.calc("longer"), "The distance is 1022.");
  assert.match(String(await yam.calc("choice")), /^(cool|great|amazing)$/);
  assert.equal(await yam.calc("inline"), "Hi Dr Ada");
  assert.equal(String(await yam.calc("bound")).trim(), "high bum");
  assert.equal(await yam.calc("braced"), "{yes}");
  assert.deepEqual(await yam.calc("meow"), { a: "4", b: "ho" });
  assert.deepEqual(await yam.calc("names"), ["bum", "Ada"]);
  assert.deepEqual(await yam.calc("scores"), [11, 7]);
  assert.equal(await yam.calc("directName"), "bum");
  assert.equal(await yam.calc("firstName"), "bum");
  assert.equal(await yam.calc("missingOne"), null);
  assert.deepEqual(await yam.calc("missingMany"), []);
  assert.equal(await yam.evaluate("foo + blah"), 4);
  assert.equal(await yam.evaluate("people.0.name"), "bum");
  assert.deepEqual(await yam.evaluate("select('people.*.score')"), [11, 7]);
  assert.equal(await yam.evaluate("get('people.9.name')"), null);
  assert.equal(yam.raw("bar"), "bum");
  assert.equal(yam.has("people.0.name"), true);
  assert.equal(yam.has("people.9.name"), false);

  const all = await yam.calcAll();
  assert.equal(all.bar, "bum");
  assert.deepEqual(all.meow, { a: "4", b: "ho" });

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

  mut.clear();
  assert.equal(await mut.calc("emotions.arousal"), 1);
  assert.equal(await mut.calc("relations.sarah.emotions.anger"), 1);
  assert.equal(mut.has("nested.brand"), false);

  await assert.rejects(() => load("bad: '{{missing}}'").calc("bad"), /Unknown variable 'missing'/);
  await assert.rejects(() => yam.evaluate("missing + 1"), /Unknown variable 'missing'/);
  await assert.rejects(() => load("bad: '<<#missing ok>>'").calc("bad"), /Unknown io directive: missing/);
  assert.throws(() => load({ constructor: "bad" }), /Invalid key/);
}

void main();
