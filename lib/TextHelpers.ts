import crypto from "crypto";

export function sha1(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}

export function smoosh(s: string): string {
  return s.trim().replaceAll(/\s+/g, " ");
}

const charsToEncode = " ~`!@#$%^&*()+={}|[]\\/:\":'<>?,.、。！？「」『』・«»—¡¿„“‚".split("");

export function slugify(txt: string, ch: string = "_"): string {
  let encoded = txt;
  charsToEncode.forEach((char) => {
    encoded = encoded.split(char).join(ch);
  });
  const re = new RegExp(`${ch}+`, "g");
  return encoded.replaceAll(re, ch);
}

export function parameterize(txt: string, ch: string = "_") {
  return txt
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}\p{C}\p{M}\u200B-\u200D\uFEFF\u2060\u00A0]/gu, ch)
    .replace(/_+/g, ch)
    .trim();
}

export function isBlank(v: any) {
  if (typeof v === "string") {
    return /^\s*$/.test(v);
  }
  if (Array.isArray(v)) {
    return v.length < 1;
  }
  if (v && typeof v === "object") {
    return Object.keys(v).length < 1;
  }
  return !v;
}
export function isPresent<T>(v: T): v is NonNullable<T> {
  return !isBlank(v);
}

export function removeLeading(t: string, c: string): string {
  if (t.startsWith(c)) {
    return removeLeading(t.slice(1), c) as string;
  }
  return t;
}

export function removeTrailing(s: string, t: string) {
  if (s[s.length - 1] === t) {
    return removeTrailing(s.slice(0, -1), t);
  }
  return s;
}

export function cleanSplit(s: string | null | undefined, sep: string = "\n") {
  if (typeof s !== "string") {
    return [];
  }
  return s
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => !!s);
}

export function parseLooseKeyValues(
  input: string,
  delimiters: string[] = ["->", "~>", ":=", "=>", ":", "-", "="]
): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof input !== "string") {
    return out;
  }
  const rows = input
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => !!row);
  for (const row of rows) {
    for (const delim of delimiters) {
      const idx = row.indexOf(delim);
      if (idx < 1) {
        continue;
      }
      const key = row.slice(0, idx).trim();
      const value = row.slice(idx + delim.length).trim();
      if (!key) {
        continue;
      }
      out[key] = value;
      break;
    }
  }
  return out;
}

export function stripOuterQuotes(str: string) {
  if (str.length < 2) {
    return str;
  }
  if (str[0] === '"' && str[str.length - 1] === '"') {
    return stripOuterQuotes(str.slice(1, -1));
  }
  if (str[0] === "'" && str[str.length - 1] === "'") {
    return stripOuterQuotes(str.slice(1, -1));
  }
  return str;
}

const ULID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(random: () => number, timestamp: number = Date.now()): string {
  let t = timestamp;
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = ULID_CHARS[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += ULID_CHARS[Math.floor(random() * 32)];
  }
  return time + rand;
}

export function generatePredictableKey(prefix: string, prompt: string, suffix: string): string {
  const slug = slugify(prompt).substring(0, 32);
  const hash = sha1(prompt).substring(0, 8);
  return `${prefix}/${slug}-${hash}.${suffix}`;
}

export const extractNetworkDomainFromSSTString = (s: string): string | null => {
  const clean = s.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  const m = clean.match(/Network:\s+(https?:\/\/\S+)/i);
  const mm = m ? m[1].trim() : null;
  if (!mm) {
    return null;
  }
  const parts = mm.split("//");
  return parts[1];
};

export function isUrlValue(value: string) {
  return /^https?:\/\//i.test(value);
}

export function parseDurationToMs(input: string): number | null {
  const source = input.trim().toLowerCase();
  if (!source) {
    return null;
  }
  const match = source.match(/^(-?\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!isFinite(value)) {
    return null;
  }
  const unit = match[2];
  if (!unit || unit === "ms" || unit === "millis" || unit === "milliseconds") {
    return Math.round(value);
  }
  if (unit === "s" || unit === "sec" || unit === "secs" || unit === "second" || unit === "seconds") {
    return Math.round(value * 1000);
  }
  if (unit === "m" || unit === "min" || unit === "mins" || unit === "minute" || unit === "minutes") {
    return Math.round(value * 60 * 1000);
  }
  if (unit === "h" || unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours") {
    return Math.round(value * 60 * 60 * 1000);
  }
  if (unit === "d" || unit === "day" || unit === "days") {
    return Math.round(value * 24 * 60 * 60 * 1000);
  }
  return null;
}
