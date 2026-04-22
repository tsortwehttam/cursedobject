import { SerialValue } from "../lib/CoreTypings";
import type { Env, World } from "./Engine";
import { parseContextClause } from "./Parsing";
import { resolveWildcardPath, wildcardMatchesToMap } from "../lib/WildcardPath";
import { marshallParams } from "../lib/ParamsMarshaller";

export type IOCtx = {
  world: World;
  env: Env;
  kind: string;
  rawText: string;
  interpolate: (text: string) => string;
  evalExpr: (expr: string) => Promise<SerialValue>;
};

export type IOMethod = (ctx: IOCtx) => Promise<SerialValue>;

export type FacAdapter = {
  methods: Record<string, IOMethod>;
};

// Split `<<# kind a ; b ; c >>` raw payload on `;`. Authors escape literal `;` as `\;`.
// Delegates to ParamsMarshaller for tokenization, so `.pairs`, `.keys`, etc. stay available
// if callers want richer structure later.
const ESC_SENTINEL = "";
export function splitParams(raw: string): string[] {
  const escaped = raw.replace(/\\;/g, ESC_SENTINEL);
  const m = marshallParams(escaped, () => null);
  return m.clauses
    .map((c) => c.split(ESC_SENTINEL).join(";").trim())
    .filter((c) => c.length > 0);
}

// Collect values from `context <path-pattern>` clauses via wildcard resolver.
export function collectContext(parts: string[], world: World): Record<string, SerialValue> {
  const out: Record<string, SerialValue> = {};
  for (const p of parts) {
    const pattern = parseContextClause(p);
    if (!pattern) continue;
    const matches = resolveWildcardPath(world.entities, pattern);
    Object.assign(out, wildcardMatchesToMap(matches));
  }
  return out;
}

// Drop context clauses, return remaining args.
export function nonContextParts(parts: string[]): string[] {
  return parts.filter((p) => parseContextClause(p) === null);
}
