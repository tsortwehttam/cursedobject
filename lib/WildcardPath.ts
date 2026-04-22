import { SerialValue } from "./CoreTypings";

export type WildcardMatch = { path: string[]; value: SerialValue };

// Walk a nested object against a dot-separated pattern with `*` segments.
// `*` matches exactly one key at that level (not multi-level). Missing paths yield empty.
// Examples: "a.b", "a.*", "*.b", "a.*.c".
export function resolveWildcardPath(root: unknown, pattern: string): WildcardMatch[] {
  const segs = pattern.split(".");
  return walk(root, segs, []);
}

function walk(node: unknown, segs: string[], acc: string[]): WildcardMatch[] {
  if (segs.length === 0) {
    return [{ path: acc, value: node as SerialValue }];
  }
  const [head, ...rest] = segs;
  if (node == null || typeof node !== "object" || Array.isArray(node)) {
    return [];
  }
  const obj = node as Record<string, unknown>;
  if (head === "*") {
    const out: WildcardMatch[] = [];
    for (const k of Object.keys(obj)) {
      out.push(...walk(obj[k], rest, [...acc, k]));
    }
    return out;
  }
  if (!(head in obj)) return [];
  return walk(obj[head], rest, [...acc, head]);
}

export function wildcardMatchesToMap(matches: WildcardMatch[]): Record<string, SerialValue> {
  const out: Record<string, SerialValue> = {};
  for (const m of matches) out[m.path.join(".")] = m.value;
  return out;
}
