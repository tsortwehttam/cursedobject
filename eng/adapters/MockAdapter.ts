import type { FacAdapter, IOCtx } from "./Adapter";
import { collectContext, nonContextParts, splitParams } from "./Adapter";
import { SerialValue } from "../../lib/CoreTypings";

export type MockResponder = (kind: string, parts: string[], ctx: IOCtx) => SerialValue | Promise<SerialValue>;

// Mock adapter for tests. Responder gets the parsed parts; returns canned value.
export function createMockAdapter(responder: MockResponder): FacAdapter {
  async function dispatch(ctx: IOCtx): Promise<SerialValue> {
    const parts = splitParams(ctx.rawText).map((p) => ctx.interpolate(p));
    const r = await responder(ctx.kind, parts, ctx);

    // For binding-style kinds, also set env[name] so {{#if name}} works.
    if (["text", "bool", "number", "enum"].includes(ctx.kind)) {
      const name = parts[0];
      if (name) ctx.env[name] = r;
    }
    return r;
  }

  const methods: Record<string, typeof dispatch> = {};
  for (const k of ["chat", "text", "bool", "number", "enum", "match", "JSON", "canSee", "pathTo", "print", "narrate", "say", "mark"]) {
    methods[k] = dispatch;
  }
  return { methods };
}

export { collectContext, nonContextParts, splitParams };
