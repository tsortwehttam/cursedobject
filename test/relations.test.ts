import assert from "node:assert/strict";
import { chain, follow, neighbors, reachable, siblings, type EntityMap } from "../lib/Relations";

// Scene:
//   LivingRoom   ── contains ── Trip, Bob, Drawer
//   Drawer       ── contains ── Spatula
//   Kitchen      ── contains ── Pan
//   Trip ── heldBy → ─── (nothing)
//   Pan  ── heldBy → Bob  (cross relation)
const ents: EntityMap = {
  LivingRoom: { public: { desc: "warm room" } },
  Kitchen:    { public: { desc: "bright kitchen" } },
  Drawer:     { location: "LivingRoom", public: { label: "drawer" } },
  Trip:       { location: "LivingRoom", public: { hair: "blond" }, secrets: { affair: "Maya" } },
  Bob:        { location: "LivingRoom", public: { manner: "curious" } },
  Spatula:    { location: "Drawer", public: { kind: "wooden" } },
  Pan:        { location: "Kitchen", heldBy: "Bob" },
  Cycle1:     { loc: "Cycle2" },
  Cycle2:     { loc: "Cycle1" },
  Multi:      { tags: ["red", "blue"] }, // non-string-only array should still not crash
  Refs:       { parents: ["Trip", "Bob"] },
};

// ---- follow ----
assert.deepEqual(follow(ents, "Trip", "location"), ["LivingRoom"]);
assert.deepEqual(follow(ents, "LivingRoom", "location"), []);
assert.deepEqual(follow(ents, "does-not-exist", "location"), []);
assert.deepEqual(follow(ents, "Refs", "parents"), ["Trip", "Bob"]);
// Non-string values filtered
assert.deepEqual(follow(ents, "Multi", "tags"), ["red", "blue"]); // strings

// ---- neighbors ----
assert.deepEqual(
  neighbors(ents, "LivingRoom", "location").sort(),
  ["Bob", "Drawer", "Trip"],
);
assert.deepEqual(neighbors(ents, "Drawer", "location"), ["Spatula"]);
assert.deepEqual(neighbors(ents, "Nowhere", "location"), []);
// Array-valued relation: Trip and Bob are neighbors of Refs
assert.deepEqual(neighbors(ents, "Trip", "parents"), ["Refs"]);

// ---- reachable: forward only ----
{
  const r = reachable(ents, "Spatula", "location", { direction: "forward" });
  assert.deepEqual([...r].sort(), ["Drawer", "LivingRoom", "Spatula"]);
}

// ---- reachable: reverse only (who's inside LivingRoom, recursively) ----
{
  const r = reachable(ents, "LivingRoom", "location", { direction: "reverse" });
  assert.deepEqual([...r].sort(), ["Bob", "Drawer", "LivingRoom", "Spatula", "Trip"]);
}

// ---- reachable: both directions from Bob, covers room + siblings + nested items ----
{
  const r = reachable(ents, "Bob", "location", { direction: "both" });
  // Bob → LivingRoom (forward), LivingRoom ← Trip/Bob/Drawer (reverse), Drawer ← Spatula
  assert.deepEqual([...r].sort(), ["Bob", "Drawer", "LivingRoom", "Spatula", "Trip"]);
}

// ---- reachable: depth bound ----
{
  const r = reachable(ents, "Bob", "location", { direction: "both", depth: 1 });
  // depth 1 from Bob: LivingRoom (forward 1) + reverse of Bob (nothing)
  assert.deepEqual([...r].sort(), ["Bob", "LivingRoom"]);
}
{
  const r = reachable(ents, "Bob", "location", { direction: "both", depth: 2 });
  // depth 2: add reverse of LivingRoom (Trip, Bob, Drawer) but Bob already seen
  assert.deepEqual([...r].sort(), ["Bob", "Drawer", "LivingRoom", "Trip"]);
}

// ---- reachable: cycle-safe ----
{
  const r = reachable(ents, "Cycle1", "loc", { direction: "both" });
  assert.deepEqual([...r].sort(), ["Cycle1", "Cycle2"]);
}

// ---- reachable: includeSelf=false ----
{
  const r = reachable(ents, "Spatula", "location", { direction: "forward", includeSelf: false });
  assert.deepEqual([...r].sort(), ["Drawer", "LivingRoom"]);
}

// ---- reachable: relation name is arbitrary ----
{
  const r = reachable(ents, "Pan", "heldBy", { direction: "forward" });
  assert.deepEqual([...r].sort(), ["Bob", "Pan"]);
}

// ---- chain ----
assert.deepEqual(chain(ents, "Spatula", "location"), ["Spatula", "Drawer", "LivingRoom"]);
assert.deepEqual(chain(ents, "LivingRoom", "location"), ["LivingRoom"]);
assert.deepEqual(chain(ents, "Cycle1", "loc"), ["Cycle1", "Cycle2"]); // cycle-safe
assert.deepEqual(chain(ents, "Spatula", "location", 2), ["Spatula", "Drawer"]);

// ---- siblings ----
assert.deepEqual(siblings(ents, "Trip", "location").sort(), ["Bob", "Drawer"]);
assert.deepEqual(siblings(ents, "Spatula", "location"), []); // only sibling would be self
assert.deepEqual(siblings(ents, "LivingRoom", "location"), []); // no parent

// ---- relation name reuse with different names works the same way ----
const alias: EntityMap = {
  A: { loc: "Home" },
  B: { loc: "Home" },
  Home: {},
};
assert.deepEqual(siblings(alias, "A", "loc"), ["B"]);

console.log("relations.test.ts OK");
