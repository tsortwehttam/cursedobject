import dedent from "dedent";
import OpenAI from "openai";
import { encoding_for_model, TiktokenModel } from "tiktoken";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { JsonSchema, NonEmpty, SerialValue } from "./CoreTypings";
import { safeJsonParse } from "./JSONAndYAMLHelpers";
import { LLM_SLUGS, LLMBackend, LLMInstruction, structuredModelsForBackend, toDirectSlug } from "./LLMTypes";
import {
  AIChatMessage,
  OpenRouterModerationCategories,
  TOpenRouterModerationCategory,
  TOpenRouterModerationResult,
  TOpenRouterModerationScores,
} from "./OpenRouterHelpers";

export const countTokens = (text: string, model: TiktokenModel = "gpt-4o-mini") => {
  const enc = encoding_for_model(model);
  const tokens = enc.encode(text);
  enc.free();
  return tokens.length;
};

type OpenAIChatModel = (typeof LLM_SLUGS)[number];

export type TokenUsageDetails = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const asInput = (messages: AIChatMessage[]) =>
  messages.map((m) => ({
    role: (m.role === "developer" ? "system" : m.role) as "user" | "assistant" | "system",
    content: m.body,
  }));

const instructionsToMessages = (instructions: LLMInstruction[]) => {
  if (instructions.length === 0) {
    return [{ role: "user" as const, content: "" }];
  }
  return instructions;
};

const readText = (r: { choices?: Array<{ message?: { content?: string } }> }): string =>
  (r.choices ?? []).map((c) => c?.message?.content ?? "").join("");

function prepRoute(models: NonEmpty<OpenAIChatModel>, online: boolean, backend: LLMBackend) {
  const transformed = models.map((m) => toDirectSlug(m, backend)).filter((m): m is string => m !== null);

  if (transformed.length === 0) {
    throw new Error("No compatible models for backend: " + backend);
  }

  const route =
    backend === "openrouter" && online
      ? transformed.map((m) => (m.includes(":online") ? m : `${m}:online`))
      : transformed;

  const [model, ...fallbacks] = route;
  return { model, fallbacks };
}

function isUnavailableModelError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  if ("status" in err && err.status === 404) {
    return true;
  }

  const message =
    "message" in err && typeof err.message === "string"
      ? err.message
      : "error" in err && err.error && typeof err.error === "object" && "message" in err.error && typeof err.error.message === "string"
        ? err.error.message
        : "";

  if ("status" in err && err.status === 400 && /not a valid model id/i.test(message)) {
    return true;
  }

  if (!("error" in err) || !err.error || typeof err.error !== "object") {
    return false;
  }

  return ("code" in err.error && err.error.code === 404) || ("code" in err.error && err.error.code === 400 && /not a valid model id/i.test(message));
}

async function retryUnavailableModel<T>(
  models: NonEmpty<OpenAIChatModel>,
  run: (route: { model: string; fallbacks: string[] }) => Promise<T>,
  online: boolean,
  backend: LLMBackend,
): Promise<T> {
  const route = prepRoute(models, online, backend);
  return run(route).catch(async (err) => {
    if (!isUnavailableModelError(err) || models.length <= 1) {
      throw err;
    }

    console.warn(`Model unavailable, retrying with fallback: ${route.model}`);
    return retryUnavailableModel(models.slice(1) as NonEmpty<OpenAIChatModel>, run, online, backend);
  });
}

export async function generateText(
  openai: OpenAI,
  instructions: LLMInstruction[],
  useWebSearch = false,
  models: NonEmpty<OpenAIChatModel>,
  backend: LLMBackend = "openrouter",
) {
  const r = await retryUnavailableModel(
    models,
    ({ model, fallbacks }) =>
      openai.chat.completions.create({
        model,
        messages: instructionsToMessages(instructions),
        ...(fallbacks.length ? { extra_body: { models: fallbacks } } : {}),
      }),
    useWebSearch,
    backend,
  );
  return readText(r as any);
}

export async function extractJson(
  openai: OpenAI,
  text: string,
  schema: Record<string, SerialValue>,
  models: NonEmpty<OpenAIChatModel>,
  backend: LLMBackend = "openrouter",
): Promise<Record<string, SerialValue>> {
  const instructions: LLMInstruction[] = [
    {
      role: "user",
      content: dedent`
        Given this input, return JSON.
        ---
        ${text}
        ---
        Return JSON only:
      `.trim(),
    },
  ];
  return generateJson(openai, instructions, schema, models, backend);
}

export async function generateJsonWithWeb(
  openai: OpenAI,
  instructions: LLMInstruction[],
  schema: Record<string, SerialValue>,
  models: NonEmpty<OpenAIChatModel>,
  backend: LLMBackend = "openrouter",
) {
  return extractJson(openai, await generateText(openai, instructions, true, models, backend), schema, models, backend);
}

export async function generateJson(
  openai: OpenAI,
  instructions: LLMInstruction[],
  schema: Record<string, SerialValue>,
  models: NonEmpty<OpenAIChatModel>,
  backend: LLMBackend = "openrouter",
): Promise<Record<string, SerialValue>> {
  const preface = [
    "Follow the user's prompt.",
    "Return ONLY a valid JSON object.",
    "This schema describes the expected output shape:",
    JSON.stringify(schema, null, 2),
  ].join(" ");
  const messages: { role: "system" | "user"; content: string }[] = [{ role: "system", content: preface }];
  for (const inst of instructions) {
    if (inst.role === "system") {
      messages[0].content += "\n\n" + inst.content;
    } else {
      messages.push({ role: "user", content: inst.content });
    }
  }
  if (messages.length === 1) {
    messages.push({ role: "user", content: "" });
  }
  const r = await retryUnavailableModel(
    models,
    ({ model, fallbacks }) =>
      openai.chat.completions.create({
        model,
        messages,
        response_format: schema ? { type: "json_object" } : { type: "text" },
        ...(fallbacks.length ? { extra_body: { models: fallbacks } } : {}),
      }),
    false,
    backend,
  );
  const txt = readText(r as any) || "{}";
  return JSON.parse(txt);
}

export async function generateJsonWithSchema<T = Record<string, unknown>>(
  openrouter: OpenAI,
  instructions: LLMInstruction[],
  schema: JsonSchema,
  models: NonEmpty<OpenAIChatModel>,
  backend: LLMBackend = "openrouter",
): Promise<T | null> {
  const structuredModels = structuredModelsForBackend(models, backend);
  const r = await retryUnavailableModel(
    structuredModels,
    ({ model, fallbacks }) =>
      openrouter.chat.completions.create({
        model,
        messages: instructionsToMessages(instructions),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "well_schema",
            schema,
            strict: true,
          },
        },
        ...(fallbacks.length ? { extra_body: { models: fallbacks } } : {}),
      }),
    false,
    backend,
  ).catch((err) => {
    console.warn("Failed to generate structured JSON", err);
    return null;
  });
  if (!r) {
    return null;
  }
  const txt = readText(r as any);
  const data = safeJsonParse(txt);
  if (!data) {
    console.warn("Structured response was not valid JSON");
    return null;
  }
  return data as T;
}

const isZodSchema = (s: unknown): s is z.ZodType =>
  typeof s === "object" && s !== null && "_def" in s && "safeParse" in s;

export async function generateChatResponse(
  openai: OpenAI,
  messages: AIChatMessage[],
  models: NonEmpty<OpenAIChatModel>,
  schema?: null,
  backend?: LLMBackend,
): Promise<string>;

export async function generateChatResponse<T>(
  openai: OpenAI,
  messages: AIChatMessage[],
  models: NonEmpty<OpenAIChatModel>,
  schema: z.ZodType<T>,
  backend?: LLMBackend,
): Promise<T | null>;

export async function generateChatResponse<T>(
  openai: OpenAI,
  messages: AIChatMessage[],
  models: NonEmpty<OpenAIChatModel>,
  schema: JsonSchema,
  backend?: LLMBackend,
): Promise<T | null>;

export async function generateChatResponse<T>(
  openai: OpenAI,
  messages: AIChatMessage[],
  models: NonEmpty<OpenAIChatModel>,
  schema: z.ZodType<T> | JsonSchema | null = null,
  backend: LLMBackend = "openrouter",
): Promise<string | T | null> {
  const zodSchema = isZodSchema(schema) ? schema : null;
  const jsonSchema = schema
    ? isZodSchema(schema)
      ? (zodToJsonSchema(schema, { $refStrategy: "none" }) as JsonSchema)
      : schema
    : null;
  const routedModels = jsonSchema ? structuredModelsForBackend(models, backend) : models;
  const response = await retryUnavailableModel(
    routedModels,
    ({ model, fallbacks }) =>
      openai.chat.completions.create({
        model,
        messages: asInput(messages),
        ...(jsonSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "response_schema",
                  schema: jsonSchema,
                  strict: true,
                },
              },
            }
          : {}),
        ...(fallbacks.length ? { extra_body: { models: fallbacks } } : {}),
      }),
    true,
    backend,
  );
  const txt = readText(response as any);
  if (!schema) {
    return txt;
  }
  const data = safeJsonParse(txt);
  if (!data) {
    console.warn("Chat response was not valid JSON");
    return null;
  }
  if (zodSchema) {
    const result = zodSchema.safeParse(data);
    if (!result.success) {
      console.warn("Chat response failed Zod validation", result.error);
      return null;
    }
    return result.data;
  }
  return data as T;
}

export async function moderateInput(
  openai: OpenAI,
  input: string,
  models: NonEmpty<OpenAIChatModel>,
  threshold: number,
  backend: LLMBackend = "openrouter",
): Promise<TOpenRouterModerationResult | null> {
  const schema: Record<string, SerialValue> = {};
  (Object.keys(OpenRouterModerationCategories) as TOpenRouterModerationCategory[]).forEach((k) => {
    schema[k] = "number";
  });
  const instructions: LLMInstruction[] = [
    {
      role: "user",
      content: dedent`
        Score the input between 0 and 1 for each moderation category.
        Only return numeric values for every category.
        <input>${input}</input>
      `.trim(),
    },
  ];
  const data = await generateJson(openai, instructions, schema, models, backend).catch((err) => {
    console.warn("Failed to score moderation", err);
    return null;
  });
  if (!data) {
    return null;
  }
  const scores = {} as TOpenRouterModerationScores;
  const keys = Object.keys(OpenRouterModerationCategories) as TOpenRouterModerationCategory[];
  keys.forEach((k) => {
    const raw = data[k];
    const num = typeof raw === "number" ? raw : Number(raw);
    const val = Number.isFinite(num) ? num : 0;
    const clamped = Math.min(Math.max(val, 0), 1);
    scores[k] = clamped;
  });
  const t = Math.min(Math.max(threshold, 0), 1);
  const flagged = keys.some((k) => scores[k] > t);
  return { flagged, scores };
}
