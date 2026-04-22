import assert from "node:assert/strict";
import { resolveWildcardPath, wildcardMatchesToMap } from "../lib/WildcardPath";

const world = {
  Trip: {
    hair: "blond",
    body: { height: 180, weight: 75 },
    drinks: 2,
  },
  Grace: {
    hair: "brown",
    body: { height: 165 },
    affection: 3,
  },
  Scene: { round: 4 },
};

// Exact path
{
  const r = resolveWildcardPath(world, "Trip.hair");
  assert.deepEqual(r, [{ path: ["Trip", "hair"], value: "blond" }]);
}

// Whole-entity
{
  const r = resolveWildcardPath(world, "Trip");
  assert.equal(r.length, 1);
  assert.equal(r[0].path.join("."), "Trip");
  assert.equal((r[0].value as any).hair, "blond");
}

// Trailing *
{
  const r = resolveWildcardPath(world, "Trip.*");
  const keys = r.map((m) => m.path.slice(1).join("."));
  assert.deepEqual(keys.sort(), ["body", "drinks", "hair"]);
}

// Nested trailing *
{
  const r = resolveWildcardPath(world, "Trip.body.*");
  const map = wildcardMatchesToMap(r);
  assert.deepEqual(map, { "Trip.body.height": 180, "Trip.body.weight": 75 });
}

// Leading * (match any top-level)
{
  const r = resolveWildcardPath(world, "*.hair");
  const map = wildcardMatchesToMap(r);
  assert.deepEqual(map, { "Trip.hair": "blond", "Grace.hair": "brown" });
}

// Mid-path *
{
  const r = resolveWildcardPath(world, "*.body.height");
  const map = wildcardMatchesToMap(r);
  assert.deepEqual(map, { "Trip.body.height": 180, "Grace.body.height": 165 });
}

// Missing path → empty
{
  const r = resolveWildcardPath(world, "Trip.does_not_exist");
  assert.deepEqual(r, []);
}

// Missing mid-path → empty
{
  const r = resolveWildcardPath(world, "Player.body.height");
  assert.deepEqual(r, []);
}

// * against non-object → empty
{
  const r = resolveWildcardPath(world, "Trip.hair.*");
  assert.deepEqual(r, []);
}

// flat map helper ordering
{
  const r = resolveWildcardPath({ a: 1, b: 2 }, "*");
  assert.deepEqual(wildcardMatchesToMap(r), { a: 1, b: 2 });
}

console.log("wildcard.test.ts OK");
