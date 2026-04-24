import assert from "node:assert/strict";
import { parse } from "../eng/Parser";

// Single-quote strings
{
  const program = parse(`Trip spawn { Trip.mood = 'cheerful'; }`);
  assert.equal(program.length, 1);
  const stmt = program[0].body![0];
  assert.equal((stmt.slots[2] as any).v, "cheerful");
}

// Mixed quotes in one program
{
  const program = parse(`
    A spawn { A.x = "double"; A.y = 'single'; }
  `);
  const stmts = program[0].body!;
  assert.equal((stmts[0].slots[2] as any).v, "double");
  assert.equal((stmts[1].slots[2] as any).v, "single");
}

// Embedded-quote inside single-quoted string
{
  const program = parse(`X spawn { X.s = 'he said "hi"'; }`);
  assert.equal((program[0].body![0].slots[2] as any).v, `he said "hi"`);
}

// Newline as stmt terminator (no semicolons)
{
  const program = parse(`
    Trip spawn {
      Trip.mood = "cheerful"
      Trip.drinks = 0
      Trip.tension = 0
    }
  `);
  assert.equal(program.length, 1);
  assert.equal(program[0].body!.length, 3);
  assert.equal((program[0].body![0].slots[2] as any).v, "cheerful");
  assert.equal((program[0].body![2].slots[0] as any).segs[1].v, "tension");
}

// Mixed newlines and semicolons
{
  const program = parse(`
    A spawn { A.x = 1; A.y = 2
      A.z = 3 }
  `);
  assert.equal(program[0].body!.length, 3);
}

// Stmt before closing } with no terminator at all
{
  const program = parse(`A spawn { A.x = 1 }`);
  assert.equal(program[0].body!.length, 1);
}

// Blank lines in block
{
  const program = parse(`
    A spawn {

      A.x = 1

      A.y = 2

    }
  `);
  assert.equal(program[0].body!.length, 2);
}

// Top-level leaf handler without ; (EOF terminator)
{
  const program = parse(`ping`);
  assert.equal(program.length, 1);
  assert.equal((program[0].slots[0] as any).segs[0].v, "ping");
}

// Slot list does NOT cross newlines — two stmts, not one
{
  const program = parse(`
    A spawn {
      Trip sayto Grace "hi"
      Grace sayto Trip "hello"
    }
  `);
  assert.equal(program[0].body!.length, 2);
  const s0 = program[0].body![0];
  const s1 = program[0].body![1];
  assert.equal(s0.slots.length, 4);
  assert.equal(s1.slots.length, 4);
  assert.equal((s0.slots[0] as any).segs[0].v, "Trip");
  assert.equal((s1.slots[0] as any).segs[0].v, "Grace");
}

// Block brace on next line still works (Body uses multi-line whitespace)
{
  const program = parse(`
    Trip spawn
    {
      Trip.x = 1
    }
  `);
  assert.equal(program.length, 1);
  assert.equal(program[0].body!.length, 1);
}

// Multi-line io payload with unquoted prose across lines
{
  const src = `
Trip spawn {
  <<chat
    as Trip ;
    on * sayto Trip ;
    You are Trip, a 30-something host.
    You live in a polished apartment with Grace.
    Backstory: moved to the city after college.
  >>;
}
`;
  const program = parse(src);
  assert.equal(program.length, 1);
  const stmt = program[0].body![0];
  const io = stmt.slots[0];
  assert.equal((io as any).t, "io");
  assert.equal((io as any).kind, "chat");

  // Raw payload preserves multi-line prose verbatim.
  const raw = (io as any).raw as string;
  assert.match(raw, /as Trip ;/);
  assert.match(raw, /on \* sayto Trip ;/);
  assert.match(raw, /Backstory: moved to the city after college\./);
  assert.match(raw, /\n/, "raw should span lines");

  // splitParams yields three trimmed clauses, no quoting needed.
  const { splitParams } = require("../eng/Adapter");
  const parts = splitParams(raw);
  assert.equal(parts.length, 3, `expected 3 clauses, got ${parts.length}: ${JSON.stringify(parts)}`);
  assert.equal(parts[0], "as Trip");
  assert.equal(parts[1], "on * sayto Trip");
  assert.match(parts[2], /^You are Trip/);
  assert.match(parts[2], /moved to the city after college\.$/);
}

// with blocks prefix mutation paths, including nested paths
{
  const program = parse(`
    Trip spawn {
      with Trip {
        name = "Trip"
        with public {
          mood = "brittle"
        }
      }
    }
  `);
  const body = program[0].body!;
  assert.equal(body.length, 2);
  assert.deepEqual((body[0].slots[0] as any).segs.map((s: any) => s.v), ["Trip", "name"]);
  assert.deepEqual((body[1].slots[0] as any).segs.map((s: any) => s.v), ["Trip", "public", "mood"]);
}

// top-level entity blocks become spawn handlers with an implicit with-prefix
{
  const program = parse(`
    Trip {
      name = "Trip"
      with public {
        mood = "brittle"
      }
    }
  `);
  assert.equal(program.length, 1);
  assert.deepEqual(program[0].slots.map((slot: any) => slot.segs?.[0]?.v), ["Trip", "spawn"]);
  const body = program[0].body!;
  assert.deepEqual((body[0].slots[0] as any).segs.map((s: any) => s.v), ["Trip", "name"]);
  assert.deepEqual((body[1].slots[0] as any).segs.map((s: any) => s.v), ["Trip", "public", "mood"]);
}

console.log("grammar-relax.test.ts OK");
