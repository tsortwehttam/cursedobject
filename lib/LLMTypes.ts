import { NonEmpty } from "./CoreTypings";
import { cleanSplit } from "./TextHelpers";
import { uniq } from "./ValueHelpers";

export const LLM_SLUGS = [
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4.5",

  "deepseek/deepseek-r1",
  "deepseek/deepseek-chat-v3.1",
  "deepseek/deepseek-v3.2",

  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",

  "x-ai/grok-4.1-fast",

  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",

  "moonshotai/kimi-k2:free",
  "moonshotai/kimi-k2-thinking",
  "moonshotai/kimi-k2-0905:exacto",
  "moonshotai/kimi-k2",
  "moonshotai/kimi-k2-0905",

  "anthropic/claude-3.5-opus",
  "google/gemini-pro-1.5",
  "mistralai/mistral-small-creative",
  "thedrummer/rocinante-12b",
  "nothingiisreal/mn-celeste-12b",
] as const;

export const LLM_MODEL_TAGS = ["MINI", "UNCENSORED", "WRITING", "ROLEPLAY"] as const;

export const LLM_SLUGS_TAGGED: Record<(typeof LLM_SLUGS)[number], (typeof LLM_MODEL_TAGS)[number][]> = {
  "openai/gpt-5": [], // $1.25/M input tokens $10/M output tokens
  "openai/gpt-5-mini": ["MINI"], // $0.25/M input tokens $2/M output tokens
  "openai/gpt-5-nano": ["MINI"], // $0.05/M input tokens $0.40/M output tokens
  "openai/gpt-4.1": [], // $2/M input tokens $8/M output tokens
  "openai/gpt-4.1-mini": ["MINI"], // $0.40/M input tokens $1.60/M output tokens
  "openai/gpt-4.1-nano": ["MINI"], // $0.10/M input tokens $0.40/M output tokens
  "openai/gpt-4o": [], // $0.15/M input tokens $0.60/M output tokens $0.217/K input imgs
  "openai/gpt-4o-mini": [], // $0.15/M input tokens $0.60/M output tokens $0.217/K input imgs
  "anthropic/claude-3.5-sonnet": ["WRITING"],
  "anthropic/claude-sonnet-4": ["WRITING"], // $3/M input tokens $15/M output tokens
  "anthropic/claude-sonnet-4.5": ["WRITING"], // $3/M input tokens $15/M output tokens
  "deepseek/deepseek-r1": [], // $0.40/M input tokens $2/M output tokens
  "deepseek/deepseek-chat-v3.1": ["ROLEPLAY"], // $0.27/M input tokens $1/M output tokens
  "deepseek/deepseek-v3.2": ["ROLEPLAY"], // $0.26/M input tokens $0.38/M output tokens
  "google/gemini-2.5-pro": [], // $1.25/M input tokens $10/M output tokens
  "google/gemini-2.5-flash": ["MINI"], // $0.30/M input tokens $2.50/M output tokens
  "google/gemini-2.5-flash-lite": ["MINI"], // $0.10/M input tokens $0.40/M output tokens
  "x-ai/grok-4.1-fast": ["ROLEPLAY"], // $0.20/M input tokens $0.50/M output tokens
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": ["UNCENSORED"], // $0/M input tokens $0/M output tokens
  "moonshotai/kimi-k2:free": ["WRITING"], // $0/M input tokens $0/M output tokens
  "moonshotai/kimi-k2-thinking": ["WRITING"],
  "moonshotai/kimi-k2-0905:exacto": ["WRITING"], // $0.60/M input tokens $2.50/M output tokens
  "moonshotai/kimi-k2": ["WRITING"], // $0.14/M input tokens $2.49/M output tokens
  "moonshotai/kimi-k2-0905": ["WRITING"], // $0.39/M input tokens $1.90/M output tokens
  "anthropic/claude-3.5-opus": ["WRITING"],
  "google/gemini-pro-1.5": ["WRITING"],
  "mistralai/mistral-small-creative": ["WRITING"],
  "thedrummer/rocinante-12b": ["WRITING"],
  "nothingiisreal/mn-celeste-12b": ["WRITING", "ROLEPLAY", "UNCENSORED"],
};

export const DEFAULT_LLM_SLUGS: NonEmpty<(typeof LLM_SLUGS)[number]> = [
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
];

export const UNAVAILABLE_LLM_SLUGS = ["nothingiisreal/mn-celeste-12b", "anthropic/claude-3.5-opus"] as const;
export const STRUCTURED_LLM_SLUGS = [
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-3.5-opus",
] as const;

export type LLMSlug = (typeof LLM_SLUGS)[number];

function isUnavailableSlug(slug: LLMSlug): boolean {
  return UNAVAILABLE_LLM_SLUGS.includes(slug as (typeof UNAVAILABLE_LLM_SLUGS)[number]);
}

export const IMAGE_MODEL_SLUGS = [
  "google/gemini-2.5-flash-image-preview",
  // Add more models here as they become available on OpenRouter
  // Potential future additions: black-forest-labs/flux-1-dev, etc.
] as const;

export const THUMBNAIL_IMAGE_MODEL: ImageModelSlug = "google/gemini-2.5-flash-image-preview";

export const IMAGE_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;

export type ImageModelSlug = (typeof IMAGE_MODEL_SLUGS)[number];
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export function normalizeModels(
  options: { models: string[] },
  attms: string | undefined,
  defaultModels: NonEmpty<(typeof LLM_SLUGS)[number]> = DEFAULT_LLM_SLUGS
): NonEmpty<(typeof LLM_SLUGS)[number]> {
  if (attms === undefined && options.models.length === 0) {
    return defaultModels;
  }
  const out: NonEmpty<(typeof LLM_SLUGS)[number]> = [...defaultModels];
  const wantedModels = attms ? cleanSplit(attms, ",") : [];
  wantedModels.push(...options.models);
  wantedModels.forEach((raw) => {
    const modelString = raw.trim();
    if (!modelString) {
      return;
    }
    const upper = modelString.toUpperCase();
    if (LLM_MODEL_TAGS.includes(upper as (typeof LLM_MODEL_TAGS)[number])) {
      const taggedModels = LLM_SLUGS.filter(
        (slug) => !isUnavailableSlug(slug) && LLM_SLUGS_TAGGED[slug].includes(upper as any),
      );
      taggedModels.forEach((slug) => {
        out.unshift(slug);
      });
      return;
    }
    const lower = modelString.toLowerCase();
    const matchedSlug = LLM_SLUGS.find((slug) => slug.toLowerCase() === lower && !isUnavailableSlug(slug));
    if (matchedSlug) {
      out.unshift(matchedSlug);
    }
  });
  return uniq(out) as any;
}

export type LLMInstructionRole = "user" | "system";
export type LLMInstruction = { role: LLMInstructionRole; content: string };

export type LLMBackend = "openrouter" | "openai" | "anthropic";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export function toDirectSlug(slug: string, backend: LLMBackend): string | null {
  if (backend === "openrouter") return slug;
  if (backend === "anthropic") {
    if (!slug.startsWith("anthropic/")) return null;
    return slug.replace("anthropic/", "");
  }
  if (!slug.startsWith("openai/")) return null;
  return slug.replace("openai/", "");
}

export function slugsForBackend(backend: LLMBackend): LLMSlug[] {
  const available = LLM_SLUGS.filter((slug) => !isUnavailableSlug(slug));
  if (backend === "openrouter") return [...available];
  if (backend === "anthropic") return available.filter((s) => s.startsWith("anthropic/"));
  return available.filter((s) => s.startsWith("openai/"));
}

export function defaultsForBackend(backend: LLMBackend): NonEmpty<LLMSlug> {
  if (backend === "openrouter") return DEFAULT_LLM_SLUGS;
  if (backend === "anthropic") {
    const anthropicOnly = DEFAULT_LLM_SLUGS.filter((s) => s.startsWith("anthropic/"));
    return anthropicOnly.length > 0 ? (anthropicOnly as NonEmpty<LLMSlug>) : ["anthropic/claude-sonnet-4"];
  }
  const openaiOnly = DEFAULT_LLM_SLUGS.filter((s) => s.startsWith("openai/"));
  return openaiOnly.length > 0 ? (openaiOnly as NonEmpty<LLMSlug>) : ["openai/gpt-4.1-mini"];
}

export function structuredModelsForBackend(
  models: NonEmpty<LLMSlug>,
  backend: LLMBackend,
): NonEmpty<LLMSlug> {
  const direct = models.filter((slug) => STRUCTURED_LLM_SLUGS.includes(slug as (typeof STRUCTURED_LLM_SLUGS)[number]));
  if (direct.length > 0) {
    return uniq([...direct, ...defaultsForBackend(backend)]) as NonEmpty<LLMSlug>;
  }
  return defaultsForBackend(backend);
}
