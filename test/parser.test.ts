import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "../eng/Parser";
import type { FacNode, Slot } from "../eng/AST";

const src = readFileSync(new URL("../game/example.fac", import.meta.url), "utf8");
const program = parse(src);

assert.ok(Array.isArray(program));
assert.ok(program.length >= 10, `expected >=10 top-level handlers, got ${program.length}`);

function slotKinds(n: FacNode): string[] {
  return n.slots.map((s: Slot) => s.t + (s.t === "io" || s.t === "cond" ? `:${s.kind}` : ""));
}

// 1. Basic sayto
const h0 = program[0];
assert.deepEqual(slotKinds(h0), ["ref", "ref", "ref", "str"]);
assert.equal((h0.slots[0] as any).segs[0].v, "Trip");
assert.equal((h0.slots[3] as any).v, "Hello");
assert.ok(h0.body && h0.body.length === 1);

// 2. Wildcard ref
const wild = program[1];
assert.equal((wild.slots[0] as any).segs[0].wild, true);
assert.equal((wild.slots[0] as any).segs[0].v, "1");
// Grace.$1.dislike — mixed segs
const mutStmt = wild.body![1];
const mutPath = (mutStmt.slots[0] as any).segs;
assert.equal(mutPath.length, 3);
assert.equal(mutPath[1].wild, true);
assert.equal(mutPath[1].v, "1");

// 3. Regex slot
const rx = program[2];
assert.equal((rx.slots[3] as any).t, "regex");
assert.equal((rx.slots[3] as any).v, "dog|puppy|hound");

// 4. Handler-level cond
const condH = program.find((n) => n.cond);
assert.ok(condH, "expected at least one handler with cond");
assert.match(condH!.cond!, /\$obs has Trip/);

// 5. spawn lifecycle — ident slots only
const spawn = program.find(
  (n) => (n.slots[0] as any).segs?.[0]?.v === "Trip" && (n.slots[1] as any).segs?.[0]?.v === "spawn",
);
assert.ok(spawn, "expected spawn handler");

// 6. device with slash in ident
const dev = program.find(
  (n) =>
    (n.slots[0] as any).segs?.[0]?.v === "device" &&
    (n.slots[1] as any).segs?.[0]?.v === "keyboard/upArrow",
);
assert.ok(dev);

// 7. game boot
const game = program.find((n) => (n.slots[0] as any).segs?.[0]?.v === "game");
assert.ok(game);

// 8. io slot in value position
const ioHead = program.find((n) =>
  n.slots.some((s) => s.t === "io" && s.kind === "match"),
);
assert.ok(ioHead);
const ioSlot = ioHead!.slots.find((s) => s.t === "io")!;
assert.equal((ioSlot as any).kind, "match");
assert.match((ioSlot as any).raw, /I dislike you ; \$value/);

// 8b. $actor wildcard appearing mid-path
const actorMut = condH!.body!.find((n) => {
  const segs = (n.slots[0] as any).segs;
  return segs && segs.length === 3 && segs[1].wild && segs[1].v === "actor";
});
assert.ok(actorMut, "expected Trip.$actor.suspicion stmt");

// 8c. Function-call + arithmetic inside string interpolation — string preserved raw
const monet = program.find(
  (n) =>
    (n.slots[0] as any).segs?.[0]?.wild &&
    (n.slots[2] as any)?.segs?.[0]?.v === "MonetPainting",
);
assert.ok(monet, "expected lookat MonetPainting handler");
const monetStr = (monet!.body![0].slots[2] as any).v as string;
assert.match(monetStr, /\{\{randIntBetween\(3, 10\) \+ 1\}\}/);

// 8d. Enum io with pipe-separated values in raw
const enumH = program.find((n) =>
  n.body?.some((s) => s.slots.some((x) => x.t === "io" && x.kind === "enum")),
);
assert.ok(enumH, "expected handler containing <<enum ...>>");
const enumIO = enumH!.body!.flatMap((s) => s.slots).find((x) => x.t === "io" && (x as any).kind === "enum")!;
assert.match((enumIO as any).raw, /happy\|sad\|angry/);

// 8e. Bare single-ident statement
const pulseH = program.find((n) =>
  n.body?.some(
    (s) => s.slots.length === 1 && (s.slots[0] as any).segs?.[0]?.v === "pulse",
  ),
);
assert.ok(pulseH, "expected handler containing bare `pulse;`");

// 8f. Empty-body device handler
const emptyDev = program.find(
  (n) =>
    (n.slots[0] as any).segs?.[0]?.v === "device" &&
    (n.slots[1] as any).segs?.[0]?.v === "form/onSubmit",
);
assert.ok(emptyDev, "expected device form/onSubmit {} handler");
assert.ok(Array.isArray(emptyDev!.body) && emptyDev!.body!.length === 0);

// 8g. `=` and `:=` desugar to `set`
const graceSpawn = program.find((n) => {
  const a = (n.slots[0] as any).segs?.[0]?.v;
  const b = (n.slots[1] as any).segs?.[0]?.v;
  return a === "Grace" && b === "spawn";
});
assert.ok(graceSpawn, "expected Grace spawn handler");
const setStmts = graceSpawn!.body!.filter(
  (s) => (s.slots[1] as any)?.segs?.[0]?.v === "set",
);
assert.ok(setStmts.length >= 2, "expected both = and := to desugar to set");

// 9. Nested if/switch
const nested = program[program.length - 1];
const ifNode = nested.body!.find(
  (n) => n.slots[0].t === "cond" && (n.slots[0] as any).kind === "if",
);
assert.ok(ifNode, "expected top-level if block");
// then-branch should contain a nested if
const thenBranch = ifNode!.body![0];
assert.equal((thenBranch.slots[0] as any).kind, "cond");
const innerIf = thenBranch.body!.find(
  (n) => n.slots[0].t === "cond" && (n.slots[0] as any).kind === "if",
);
assert.ok(innerIf, "expected nested if inside then-branch");

// else-branch should contain a switch
const elseBranch = ifNode!.body![ifNode!.body!.length - 1];
assert.equal((elseBranch.slots[0] as any).kind, "default");
const sw = elseBranch.body!.find(
  (n) => n.slots[0].t === "cond" && (n.slots[0] as any).kind === "switch",
);
assert.ok(sw, "expected switch in else-branch");
// switch should have regex-case
const cases = sw!.body!;
assert.ok(cases.length >= 3);

console.log(`parser.test.ts OK — ${program.length} top-level handlers parsed`);
