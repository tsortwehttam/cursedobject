import { SerialValue } from "./CoreTypings";
import { safeJsonParse } from "./JSONAndYAMLHelpers";
import { cleanSplit } from "./TextHelpers";

export function castToBoolean(v: any): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !isNaN(v);
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "yes", "1"].includes(s)) return true;
    if (["false", "no", "0", ""].includes(s)) return false;
    return Boolean(s);
  }
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
}

export function castToNumber(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return isNaN(n) ? 0 : n;
  }
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}

export function castToString(v: any): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(castToString).join(",");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function isTruthy(v: any) {
  return castToBoolean(v);
}

function tryParseArray(value: SerialValue): SerialValue[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  if (!value.includes(",")) return null;
  const parts = cleanSplit(value, ",");
  if (!parts.length) return null;
  return parts;
}

export function castToTypeEnhanced(value: SerialValue, type?: string): SerialValue {
  if ((!type || type === "json") && typeof value === "string") {
    if (value.startsWith("{") || value.startsWith("[")) {
      return safeJsonParse(value) ?? castToString(value);
    }
  }

  if (!type || type === "string") return castToString(value);
  if (type === "number") return castToNumber(value);
  if (type === "boolean") return castToBoolean(value);
  if (type === "int" || type === "integer") {
    return Math.round(castToNumber(value));
  }

  // Handle enums (e.g., "elf|dwarf|human")
  if (type.includes("|")) {
    const options = type.split("|").map((s) => s.trim());
    const normalized = castToString(value).toLowerCase().trim();
    const match = options.find((opt) => opt.toLowerCase() === normalized);
    if (match) return match;

    // Try fuzzy match for common variations
    for (const opt of options) {
      if (normalized.includes(opt.toLowerCase()) || opt.toLowerCase().includes(normalized)) {
        return opt;
      }
    }
    return null;
  }

  // Handle arrays if type is like "string[]" or "array<string>"
  if (type.endsWith("[]")) {
    const itemType = type.slice(0, -2);
    const parsed = tryParseArray(value);
    const arr = parsed ?? (Array.isArray(value) ? value : [value]);
    return arr.map((item) => castToTypeEnhanced(item, itemType));
  }

  if (type.startsWith("array<") && type.endsWith(">")) {
    const itemType = type.slice(6, -1);
    const parsed = tryParseArray(value);
    const arr = parsed ?? (Array.isArray(value) ? value : [value]);
    return arr.map((item) => castToTypeEnhanced(item, itemType));
  }

  return value;
}

export function castToArray(a: any): any[] {
  if (Array.isArray(a)) {
    return a;
  }
  if (a === null || a === undefined || isNaN(a)) {
    return [];
  }
  return [a];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function toNonEmptyString(value: unknown): string | null {
  const str = toStringValue(value);
  if (str === null) {
    return null;
  }
  const trimmed = str.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const entry = toNonEmptyString(value[i]);
      if (entry) {
        out.push(entry);
      }
    }
    return out;
  }
  const str = toNonEmptyString(value);
  if (!str) {
    return [];
  }
  return cleanSplit(str, ",");
}

export function unwrapAsString(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return "" + v;
  if (typeof v === "number") return "" + v;
  if (typeof v === "bigint") return "" + v;
  if (typeof v == "string") return v;
  if (Array.isArray(v)) {
    if (v.length < 1) return "";
    return unwrapAsString(v[0]);
  }
  if (typeof v === "object") {
    const first = Object.values(v).find((v) => !!v);
    return first ? unwrapAsString(first) : "";
  }
  return "";
}

const FORBIDDEN_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
]);

export const JS_KEYWORDS = [
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "await",
  "async",
];

export function isValidKey(key: string): boolean {
  if (FORBIDDEN_KEYS.has(key)) return false;
  if (key.startsWith("__") && key.endsWith("__")) return false;
  return true;
}

export function hasInvalidPathSegment(path: string): boolean {
  return path.split(".").some((segment) => !isValidKey(segment));
}

export type TVars = Record<string, SerialValue>;

export function safeGet(obj: TVars, path: string): SerialValue {
  if (hasInvalidPathSegment(path)) return null;
  const parts = path.split(".");
  let current: SerialValue = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (typeof current !== "object") return null;
    if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      if (isNaN(idx)) return null;
      current = current[idx] ?? null;
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, part)) return null;
      current = current[part] ?? null;
    }
  }
  return current;
}

export function safeSet(obj: TVars, path: string, value: SerialValue): void {
  if (hasInvalidPathSegment(path)) return;
  const parts = path.split(".");
  let current: SerialValue = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current === null || current === undefined) return;
    if (typeof current !== "object" || Array.isArray(current)) return;
    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      current[part] = {};
    }
    current = current[part]!;
  }
  const lastKey = parts[parts.length - 1]!;
  if (current !== null && typeof current === "object" && !Array.isArray(current)) {
    current[lastKey] = value;
  }
}

const VAR_PATH_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[(?:\d+|"[^"]+"|'[^']+')\])*$/;

export function isVarPath(expr: string) {
  return VAR_PATH_RE.test(expr);
}

export const isIdent = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s);

export function allTruthy(conds: SerialValue[]): boolean {
  return conds.filter(isTruthy).length === conds.length;
}
