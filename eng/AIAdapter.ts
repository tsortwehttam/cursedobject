import OpenAI from "openai";
import { NonEmpty, SerialValue } from "../lib/CoreTypings";
import type { FacAdapter, IOCtx, IOMethod } from "./Adapter";
import { collectContext, collectEntityContext, nonContextParts, splitParams } from "./Adapter";
import { parseClauses } from "./Clauses";
import { selectEvents } from "./Query";
import { resolveWildcardPath, wildcardMatchesToMap } from "../lib/WildcardPath";
import { DEFAULT_LLM_SLUGS, LLMSlug } from "../lib/LLMTypes";
import { generateJson, generateText } from "../lib/OpenRouterUtils";

export type AIAdapterOptions = {
  openai?: OpenAI;
  apiKey?: string;
  baseURL?: string;
  models?: NonEmpty<LLMSlug>;
};

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export function createAIAdapter(opts: AIAdapterOptions = {}): FacAdapter {
  const openai =
    opts.openai ??
    new OpenAI({
      apiKey: opts.apiKey ?? process.env.OPENROUTER_API_KEY,
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
    });
  const models = opts.models ?? (DEFAULT_LLM_SLUGS as NonEmpty<LLMSlug>);

  async function callText(prompt: string): Promise<string> {
    const txt = await generateText(openai, [{ role: "user", content: prompt }], false, models, "openrouter");
    return txt.trim();
  }

  async function callJson(prompt: string, schema: Record<string, SerialValue>) {
    return generateJson(openai, [{ role: "user", content: prompt }], schema, models, "openrouter");
  }

  async function buildPrompt(parts: string[], ctx: IOCtx, preface: string): Promise<string> {
    const nonCtx = nonContextParts(parts).map((p) => ctx.interpolate(p));
    const context = {
      ...collectContext(parts, ctx.world),
      ...(await collectEntityContext(parts, ctx)),
    };
    const ctxBlock = Object.keys(context).length
      ? `\n\nContext:\n${JSON.stringify(context, null, 2)}`
      : "";
    return `${preface}\n\n${nonCtx.join("\n\n")}${ctxBlock}`.trim();
  }

  const CHAT_TAGS = new Set(["as", "on", "context", "with", "recent", "system"]);

  const chat: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const clauses = parseClauses(parts, CHAT_TAGS);

    const asC = clauses.find((c) => c.tag === "as");
    const onC = clauses.find((c) => c.tag === "on");
    const recentC = clauses.find((c) => c.tag === "recent");
    const systemC = clauses.find((c) => c.tag === "system");
    const contextCs = clauses.filter((c) => c.tag === "context");
    const withCs = clauses.filter((c) => c.tag === "with");
    const promptPieces = clauses.filter((c) => c.tag === null).map((c) => ctx.interpolate(c.payload));

    // `as Trip` → include Trip.* as context automatically.
    const scope: Record<string, SerialValue> = {};
    if (asC) {
      const pattern = asC.payload.includes(".") ? asC.payload : `${asC.payload}.*`;
      Object.assign(scope, wildcardMatchesToMap(resolveWildcardPath(ctx.world.entities, pattern)));
    }
    for (const c of contextCs) {
      Object.assign(scope, wildcardMatchesToMap(resolveWildcardPath(ctx.world.entities, c.payload)));
    }
    Object.assign(scope, await collectEntityContext(withCs.map((c) => `with ${c.payload}`), ctx));

    // `on <pattern>` → filter event history.
    let history = onC ? selectEvents(ctx.world, onC.payload) : [];
    if (recentC) {
      const n = Number(recentC.payload) || 0;
      if (n > 0) history = history.slice(-n);
    }

    // Build prompt
    const parts2: string[] = [];
    const sys = systemC ? ctx.interpolate(systemC.payload) : undefined;
    const body = promptPieces.join("\n\n");
    if (asC) parts2.push(`You are voicing ${asC.payload}. Produce a single in-character line.`);
    if (sys) parts2.push(sys);
    if (body) parts2.push(body);
    if (Object.keys(scope).length) parts2.push(`State:\n${JSON.stringify(scope, null, 2)}`);
    if (history.length) {
      const lines = history.map((e) => `  ${e.slots.map(String).join(" | ")}`).join("\n");
      parts2.push(`Recent events:\n${lines}`);
    }
    parts2.push("Respond with only the line of dialogue, no quotes or prefixes.");

    return callText(parts2.join("\n\n"));
  };

  const text: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const [name, ...rest] = parts;
    if (!name) throw new Error("<<text>> requires binding name");
    const prompt = await buildPrompt(rest, ctx, "Generate a concise piece of text for the following:");
    const v = await callText(prompt);
    ctx.env[name] = v;
    return v;
  };

  const bool: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const [name, ...rest] = parts;
    if (!name) throw new Error("<<bool>> requires binding name");
    const prompt = await buildPrompt(rest, ctx, "Answer strictly true or false.");
    const r = await callJson(prompt, { type: "object", properties: { value: { type: "boolean" } }, required: ["value"] });
    const v = !!r.value;
    ctx.env[name] = v;
    return v;
  };

  const number: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const [name, ...rest] = parts;
    if (!name) throw new Error("<<number>> requires binding name");
    const prompt = await buildPrompt(rest, ctx, "Return a single numeric value.");
    const r = await callJson(prompt, { type: "object", properties: { value: { type: "number" } }, required: ["value"] });
    const v = Number(r.value);
    ctx.env[name] = v;
    return v;
  };

  const enumMethod: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const [name, optsStr, ...rest] = parts;
    if (!name || !optsStr) throw new Error("<<enum>> requires name and options");
    const choices = optsStr.split("|").map((s) => s.trim());
    const prompt = await buildPrompt(rest, ctx, `Pick exactly one of: ${choices.join(", ")}.`);
    const r = await callJson(prompt, {
      type: "object",
      properties: { value: { type: "string", enum: choices } },
      required: ["value"],
    });
    const v = String(r.value);
    ctx.env[name] = v;
    return v;
  };

  const match: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const [query, targetExpr] = parts;
    const target = targetExpr ? ctx.interpolate(targetExpr) : "";
    const prompt = `Does the following text semantically mean the same as the query? Answer true or false.\n\nQuery: ${ctx.interpolate(query ?? "")}\n\nText: ${target}`;
    const r = await callJson(prompt, { type: "object", properties: { value: { type: "boolean" } }, required: ["value"] });
    return !!r.value;
  };

  const JSONMethod: IOMethod = async (ctx) => {
    const parts = splitParams(ctx.rawText);
    const prompt = await buildPrompt(parts, ctx, "Return a JSON object matching the description.");
    const r = await callJson(prompt, { type: "object" });
    return r as SerialValue;
  };

  return {
    methods: {
      chat,
      text,
      bool,
      number,
      enum: enumMethod,
      match,
      JSON: JSONMethod,
      // Stubs for spatial queries until authors override.
      canSee: async () => true,
      pathTo: async () => [],
    },
  };
}
