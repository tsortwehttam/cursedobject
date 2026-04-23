import assert from "node:assert/strict";
import { parseClauses, firstClause, clausesOf } from "../eng/Clauses";

const TAGS = new Set(["as", "on", "context", "with", "recent", "system"]);

// Tagged clause
{
  const cs = parseClauses(["as Trip"], TAGS);
  assert.deepEqual(cs, [{ tag: "as", payload: "Trip" }]);
}

// Multi-word payload
{
  const cs = parseClauses(["on * sayto Trip ..."], TAGS);
  assert.deepEqual(cs, [{ tag: "on", payload: "* sayto Trip ..." }]);
}

// Untagged — unknown leading token
{
  const cs = parseClauses(["You are Trip, a man in his 30s"], TAGS);
  assert.deepEqual(cs, [{ tag: null, payload: "You are Trip, a man in his 30s" }]);
}

// Mixed, realistic chat call
{
  const cs = parseClauses(
    ["as Trip", "on * sayto Trip ...", "You are Trip, a charismatic host"],
    TAGS,
  );
  assert.equal(cs.length, 3);
  assert.equal(firstClause(cs, "as")?.payload, "Trip");
  assert.equal(firstClause(cs, "on")?.payload, "* sayto Trip ...");
  assert.equal(clausesOf(cs, null).length, 1);
}

// Empty parts skipped
{
  const cs = parseClauses(["as Trip", "   ", "on * sayto Trip ..."], TAGS);
  assert.equal(cs.length, 2);
}

// Tag-only clause → empty payload
{
  const cs = parseClauses(["as"], TAGS);
  assert.deepEqual(cs, [{ tag: "as", payload: "" }]);
}

// Entity context clause
{
  const cs = parseClauses(["with public.*, clothing.* where location == \"LivingRoom\""], TAGS);
  assert.deepEqual(cs, [{ tag: "with", payload: "public.*, clothing.* where location == \"LivingRoom\"" }]);
}

// Known tag must match whole leading word — `ask` ≠ `as`
{
  const cs = parseClauses(["asked Trip a question"], TAGS);
  assert.deepEqual(cs, [{ tag: null, payload: "asked Trip a question" }]);
}

console.log("clauses.test.ts OK");
