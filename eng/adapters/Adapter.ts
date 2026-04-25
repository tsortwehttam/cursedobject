import type { SerialValue } from "../../lib/CoreTypings";
import type { Env, FacEvent, World } from "../Engine";
import { deepSet } from "../../lib/PathHelpers";
import { parseContextClause } from "../Parsing";
import { resolveWildcardPath, wildcardMatchesToMap } from "../../lib/WildcardPath";
import { marshallParams } from "../../lib/ParamsMarshaller";

export type IOCtx = {
  world: World;
  env: Env;
  kind: string;
  rawText: string;
  interpolate: (text: string) => string;
  evalExpr: (expr: string, env: Env | null) => Promise<SerialValue>;
};

export type IOMethod = (ctx: IOCtx) => Promise<SerialValue>;

export type EventCtx = {
  world: World;
  event: FacEvent;
};

export type EventMethod = (ctx: EventCtx) => Promise<void>;

export type FacAdapter = {
  methods: Record<string, IOMethod>;
  events: EventMethod[];
};

export function composeAdapters(...adapters: FacAdapter[]): FacAdapter {
  return {
    methods: Object.assign({}, ...adapters.map((adapter) => adapter.methods)),
    events: adapters.flatMap((adapter) => adapter.events),
  };
}

// Split `<<kind a ; b ; c>>` raw payload on `;`. Authors escape literal `;` as `\;`.
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

export async function collectEntityContext(parts: string[], ctx: IOCtx): Promise<Record<string, SerialValue>> {
  const entities: Record<string, SerialValue> = {};
  for (const part of parts) {
    const clause = parseWithClause(part);
    if (!clause) continue;
    for (const id of Object.keys(ctx.world.entities)) {
      const ent = ctx.world.entities[id];
      const env: Env = { ...ent, $id: id };
      if (clause.cond && !(await ctx.evalExpr(clause.cond, env))) continue;
      const view = projectEntity(ent, clause.patterns);
      if (Object.keys(view).length > 0) entities[id] = view;
    }
  }
  return Object.keys(entities).length > 0 ? { entities } : {};
}

// Drop context clauses, return remaining args.
export function nonContextParts(parts: string[]): string[] {
  return parts.filter((p) => parseContextClause(p) === null && parseWithClause(p) === null);
}

export type WithClause = {
  patterns: string[];
  cond: string | null;
};

export function parseWithClause(part: string): WithClause | null {
  const match = part.match(/^with\s+([\s\S]+)$/);
  if (!match) return null;
  const body = match[1].trim();
  const where = body.match(/^([\s\S]*?)\s+where\s+([\s\S]+)$/);
  const rawPatterns = (where ? where[1] : body).trim();
  const patterns = rawPatterns
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (patterns.length === 0) return null;
  return {
    patterns,
    cond: where ? where[2].trim() : null,
  };
}

function projectEntity(ent: Record<string, SerialValue>, patterns: string[]): Record<string, SerialValue> {
  const out: Record<string, SerialValue> = {};
  for (const pattern of patterns) {
    for (const match of resolveWildcardPath(ent, pattern)) {
      deepSet(out, match.path, match.value);
    }
  }
  return out;
}
