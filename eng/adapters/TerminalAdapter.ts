import { SerialValue } from "../../lib/CoreTypings";
import type { FacAdapter, IOCtx, IOMethod } from "./Adapter";
import { splitParams } from "./Adapter";

export type TerminalWriter = (text: string) => void;
export type TerminalStyle = (kind: string, parts: string[]) => string | null;
export type TerminalAdapterOptions = {
  write: TerminalWriter | null;
  style: TerminalStyle | null;
};

export function createTerminalAdapter(opts: TerminalAdapterOptions): FacAdapter {
  const write = opts.write ?? ((t: string) => process.stdout.write(t));
  const line = (s: string) => write(s.endsWith("\n") ? s : s + "\n");

  const print: IOMethod = async (ctx: IOCtx): Promise<SerialValue> => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    const text = parts.join(" ");
    line(colorize(text, opts.style ? opts.style("print", parts) : null));
    return text;
  };

  const narrate: IOMethod = async (ctx: IOCtx): Promise<SerialValue> => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    const text = parts.join(" ");
    line(colorize(text, opts.style ? opts.style("narrate", parts) : null));
    return text;
  };

  const mark: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    const [tag, ...rest] = parts;
    const text = `[${tag ?? "mark"}] ${rest.join(" ")}`;
    line(colorize(text, opts.style ? opts.style("mark", parts) : null));
    return null;
  };

  return { methods: { print, narrate, mark } };
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
