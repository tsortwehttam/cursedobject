import { SerialValue } from "./CoreTypings";
import { PRNG } from "./RandHelpers";

export type BuiltinCtx = {
  rng: PRNG;
  counter: (key: string) => number;
  key: string;
};

export type BuiltinFunc = (args: string, ctx: BuiltinCtx) => SerialValue | Promise<SerialValue>;

export const BUILTIN_DIRECTIVES: Record<string, BuiltinFunc> = {
  rand: (args, { rng }) => {
    const parts = splitParts(args);
    return parts.length ? rng.randomElement(parts) : "";
  },
  cycle: (args, { counter, key }) => {
    const parts = splitParts(args);
    if (!parts.length) return "";
    return parts[counter(key) % parts.length] ?? "";
  },
  seq: (args, { counter, key }) => {
    const parts = splitParts(args);
    if (!parts.length) return "";
    return parts[Math.min(counter(key), parts.length - 1)] ?? "";
  },
  once: (args, { counter, key }) => {
    const parts = splitParts(args);
    const idx = counter(key);
    return idx < parts.length ? (parts[idx] ?? "") : "";
  },
  random: (_args, { rng }) => rng.next(),
  randint: (args, { rng }) => {
    const [min, max] = parseNums(args, 2);
    return rng.getRandomInt(min, max);
  },
  randfloat: (args, { rng }) => {
    const [min, max] = parseNums(args, 2);
    return rng.getRandomFloat(min, max);
  },
  randnormal: (args, { rng }) => {
    const [min, max] = parseNums(args, 2);
    return rng.getRandomFloatNormal(min, max);
  },
  randintnormal: (args, { rng }) => {
    const [min, max] = parseNums(args, 2);
    return rng.getRandomIntNormal(min, max);
  },
  coin: (args, { rng }) => {
    const parts = words(args);
    const prob = parts.length ? Number(parts[0]) : 0.5;
    return rng.coinToss(Number.isFinite(prob) ? prob : 0.5);
  },
  dice: (args, { rng }) => {
    const parts = words(args);
    const sides = parts.length ? Number(parts[0]) : 6;
    return rng.dice(Number.isFinite(sides) ? sides : 6);
  },
  roll: (args, { rng }) => {
    const parts = words(args);
    const rolls = parts.length > 0 ? Number(parts[0]) : 1;
    const sides = parts.length > 1 ? Number(parts[1]) : 6;
    return rng.rollMultipleDice(
      Number.isFinite(rolls) ? rolls : 1,
      Number.isFinite(sides) ? sides : 6,
    );
  },
};

function splitParts(args: string): string[] {
  return splitTopLevel(args, "|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(args: string): string[] {
  return args.trim().split(/\s+/).filter(Boolean);
}

function parseNums(args: string, count: number): number[] {
  const parts = words(args);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const part = parts[i];
    const n = part === undefined ? 0 : Number(part);
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out;
}

function splitTopLevel(text: string, delim: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && ch === delim) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}
