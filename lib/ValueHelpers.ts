import { SerialValue } from "./CoreTypings";
import { jsonStableStringify } from "./JSONAndYAMLHelpers";

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function mapValues<T, U>(obj: Record<string, T>, fn: (value: T, key: string) => U): Record<string, U> {
  const out: Record<string, U> = {};
  for (const key in obj) {
    out[key] = fn(obj[key], key);
  }
  return out;
}

export function mutativeMerge<T extends Record<string, unknown>>(target: T, ...sources: unknown[]): T {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const key in source as Record<string, unknown>) {
      const srcVal = (source as Record<string, unknown>)[key];
      const tgtVal = target[key];
      if (
        srcVal &&
        typeof srcVal === "object" &&
        !Array.isArray(srcVal) &&
        tgtVal &&
        typeof tgtVal === "object" &&
        !Array.isArray(tgtVal)
      ) {
        mutativeMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
      } else if (srcVal !== undefined) {
        (target as Record<string, unknown>)[key] = srcVal;
      }
    }
  }
  return target;
}

export function intersection<T>(a: T[], b: T[]): T[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

export function camelCase(str: string): string {
  return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
}

export function collate(obj: Record<string, SerialValue>): Record<string, SerialValue> {
  const out: Record<string, SerialValue> = {};

  function flatten(value: SerialValue, path: string) {
    if (value === null || typeof value !== "object") {
      out[path] = value;
      return;
    }

    if (Array.isArray(value)) {
      out[path] = value;
      if (value.length === 0) {
        return;
      }
      value.forEach((item, index) => {
        flatten(item, path ? `${path}.${index}` : `${index}`);
      });
      return;
    }

    const keys = Object.keys(value);
    out[path] = value;
    if (keys.length === 0) {
      return;
    }

    keys.forEach((key) => {
      flatten(value[key], path ? `${path}.${key}` : key);
    });
  }

  Object.keys(obj).forEach((key) => {
    flatten(obj[key], key);
  });

  return out;
}

export function removeFrom<T>(el: T, arr: T[]) {
  const idx = arr.indexOf(el);
  if (idx >= 0) {
    arr.splice(idx, 1);
  }
}

export function collateObjectsByFields<T extends {}>(messages: T[], fields: (keyof T)[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const msg of messages) {
    const key = jsonStableStringify(fields.map((f) => msg[f])) as string;
    const group = groups.get(key);
    if (group) group.push(msg);
    else groups.set(key, [msg]);
  }
  // This should never return inner empty objects
  return Array.from(groups.values()).filter((gp) => gp.length > 0);
}

export function sortBy<T>(arr: T[], key: keyof T): T[] {
  return [...arr].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
    return 0;
  });
}

type ConversationEvent = { from: string; to: string[]; obs: string[] };

export function filterConversationEvents<T extends ConversationEvent>(events: T[], participants: string[]): T[] {
  if (participants.length === 0) return events;
  const set = new Set(participants);
  return events.filter((e) => {
    if (e.to.length === 0) return true;
    if (set.has(e.from)) return true;
    if (e.obs.some((t) => set.has(t))) return true;
    return e.to.some((t) => set.has(t));
  });
}

export function summarizeObj(obj: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const key in obj) {
    out[key] = summarizeVal(obj[key]);
  }
  return out;
}

export function summarizeVal(val: any): any {
  if (Array.isArray(val)) {
    return val.map(summarizeVal);
  }
  if (val && typeof val === "object") {
    return "{object}";
  }
  return val;
}

export function omit<T extends Record<PropertyKey, unknown>>(
  obj: T | null | undefined,
  keys: readonly PropertyKey[],
): Record<PropertyKey, unknown> {
  if (!obj) return {};
  if (keys.length === 0) return { ...obj };
  const set = new Set<PropertyKey>(keys);
  const out: Record<PropertyKey, unknown> = {};
  for (const k of Reflect.ownKeys(obj)) {
    if (set.has(k)) continue;
    out[k] = obj[k as keyof T];
  }
  return out;
}
