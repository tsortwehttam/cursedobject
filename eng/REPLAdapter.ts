import { SerialValue } from "../lib/CoreTypings";
import type { FacAdapter, IOCtx, IOMethod } from "./Adapter";
import { splitParams } from "./Adapter";

export type REPLWriter = (text: string) => void;

// Small adapter with io methods useful from a REPL or any text front-end.
// Compose with other adapters via `{ methods: { ...base.methods, ...repl.methods } }`.
//
// Provided io kinds:
//   <<print text>>                   — writes a line to the console
//   <<print color cyan ; text>>      — writes a colored line to the console
//   <<mark kind ; payload>>          — writes a tagged log line (debug scaffolding)
export function createREPLAdapter(write: REPLWriter = (t) => process.stdout.write(t)): FacAdapter {
  const line = (s: string) => write(s.endsWith("\n") ? s : s + "\n");

  const print: IOMethod = async (ctx: IOCtx): Promise<SerialValue> => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    const { color, text } = parsePrint(parts);
    line(colorize(text, color));
    return text;
  };

  const mark: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    const [tag, ...rest] = parts;
    line(`[${tag ?? "mark"}] ${rest.join(" ")}`);
    return null;
  };

  return { methods: { print, mark } };
}

function parsePrint(parts: string[]): { color: string | null; text: string } {
  const [first, ...rest] = parts;
  const match = first?.match(/^color\s+(\S+)$/);
  if (!match) return { color: null, text: parts.join(" ") };
  return { color: match[1], text: rest.join(" ") };
}

function colorize(text: string, color: string | null): string {
  if (!color) return text;
  const code = ANSI[color];
  if (!code) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

const ANSI: Record<string, string> = {
  black: "30",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  magenta: "35",
  cyan: "36",
  white: "37",
  gray: "90",
  grey: "90",
};
