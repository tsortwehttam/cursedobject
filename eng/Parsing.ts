// Facsimile-specific parsing helpers. Generic pieces live in lib/.

// Parse a variation-form interpolation body like "a|b|c" (no operators, no function calls).
// Returns null if the body is not a variation.
export function parseVariation(body: string): string[] | null {
  if (!body.includes("|")) return null;
  if (body.includes("||") || body.includes("&&")) return null;
  if (/[<>=!]/.test(body)) return null;
  if (body.includes("(")) return null;
  return body.split("|").map((p) => p.trim());
}

// Parse `context <pattern>` clause from an io-param part. Returns pattern or null.
export function parseContextClause(part: string): string | null {
  const m = part.match(/^context\s+(.+)$/);
  return m ? m[1].trim() : null;
}

// Parse REPL shorthand into a slot array. Accepts:
//   `[ "a","b","c" ]`   → JSON array
//   `actor verb target rest of sentence`  → ["actor","verb","target","rest of sentence"]
//   `path verb`          → ["path","verb"]
export function parseShorthandEvent(line: string): (string | number | boolean | null)[] {
  const t = line.trim();
  if (t.startsWith("[")) return JSON.parse(t);
  const parts = t.split(/\s+/);
  if (parts.length < 2) throw new Error("event needs at least 2 tokens");
  if (parts.length === 2) return parts;
  const [actor, verb, target, ...rest] = parts;
  const tail = rest.join(" ").replace(/^"(.*)"$/, "$1");
  return tail ? [actor, verb, target, tail] : [actor, verb, target];
}
