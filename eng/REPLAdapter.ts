import { SerialValue } from "../lib/CoreTypings";
import type { FacAdapter, IOCtx, IOMethod } from "./Adapter";
import { splitParams } from "./Adapter";

export type REPLWriter = (text: string) => void;

// Small adapter with io methods useful from a REPL or any text front-end.
// Compose with other adapters via `{ methods: { ...base.methods, ...repl.methods } }`.
//
// Provided io kinds:
//   <<#say ; "text">>                 — writes a line to the console
//   <<#narrate ; "text">>             — writes an italic-ish narrator line ("* text *")
//   <<#mark kind ; payload>>          — writes a tagged log line (debug scaffolding)
export function createREPLAdapter(write: REPLWriter = (t) => process.stdout.write(t)): FacAdapter {
  const line = (s: string) => write(s.endsWith("\n") ? s : s + "\n");

  const say: IOMethod = async (ctx: IOCtx): Promise<SerialValue> => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    line(parts.join(" "));
    return parts.join(" ");
  };

  const narrate: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    line(`* ${parts.join(" ")} *`);
    return parts.join(" ");
  };

  const mark: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText).map(ctx.interpolate);
    const [tag, ...rest] = parts;
    line(`[${tag ?? "mark"}] ${rest.join(" ")}`);
    return null;
  };

  return { methods: { say, narrate, mark } };
}
