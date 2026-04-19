export type ScalarValue = string | null | number | boolean;

export type VectorValue = string[] | number[] | boolean[];

export type SerialValue = ScalarValue | SerialValue[] | { [key: string]: SerialValue };

export type JsonSchema = Record<string, unknown>;

export type NonEmpty<T> = [T, ...T[]];

export type NestedRecords = {
  [key: string]: string | NestedRecords;
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function requireString(obj: Record<string, unknown>, key: string): Result<string, string> {
  const val = obj[key];
  if (typeof val !== "string") {
    return err(`expected string for '${key}', got ${typeof val}`);
  }
  return ok(val);
}

export function requireBoolean(obj: Record<string, unknown>, key: string): Result<boolean, string> {
  const val = obj[key];
  if (typeof val !== "boolean") {
    return err(`expected boolean for '${key}', got ${typeof val}`);
  }
  return ok(val);
}

export function requireLiteral<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  literal: T
): Result<T, string> {
  const val = obj[key];
  if (val !== literal) {
    return err(`expected '${literal}' for '${key}', got '${val}'`);
  }
  return ok(literal);
}

export type ErrorBase = {
  type: string;
  name: string;
  note?: string;
};
