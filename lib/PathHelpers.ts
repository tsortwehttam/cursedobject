import { SerialValue } from "./CoreTypings";

// Read a dot-separated path from a nested object. Missing → null.
export function deepGet(root: unknown, segs: string[]): SerialValue {
  if (segs.length === 0) return null;
  let cur: any = root;
  for (const k of segs) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[k];
  }
  return (cur ?? null) as SerialValue;
}

// Assign at a dot-separated path, creating intermediate plain objects as needed.
// Mutates `root`. No-ops on empty segs.
export function deepSet(root: Record<string, unknown>, segs: string[], value: SerialValue): void {
  if (segs.length === 0) return;
  let cur: any = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = segs[i];
    if (typeof cur[k] !== "object" || cur[k] === null || Array.isArray(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[segs[segs.length - 1]] = value;
}
