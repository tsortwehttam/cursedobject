import assert from "node:assert/strict";
import { parseRegexLiteral } from "../lib/RegexHelpers";

assert.deepEqual(parseRegexLiteral("/dog|puppy/"), { body: "dog|puppy", flags: "" });
assert.deepEqual(parseRegexLiteral("/abc/gi"), { body: "abc", flags: "gi" });
assert.deepEqual(parseRegexLiteral("  /x/  "), { body: "x", flags: "" });
assert.deepEqual(parseRegexLiteral("/a\\/b/"), { body: "a\\/b", flags: "" });
assert.equal(parseRegexLiteral("not-a-regex"), null);
assert.equal(parseRegexLiteral("/"), null);
assert.equal(parseRegexLiteral("/just-one-slash"), null);
assert.equal(parseRegexLiteral(""), null);

console.log("regex-helpers.test.ts OK");
