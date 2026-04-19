import { load } from "js-yaml";
import jss from "json-stable-stringify";
import JSON5 from "json5";
import { SerialValue } from "./CoreTypings";

export function jsonStableStringify(o: any): string | undefined {
  return jss(o);
}

export function safeJsonParse(s: string | null): any | null {
  if (!s) {
    return null;
  }
  try {
    return JSON5.parse(s);
  } catch (e) {
    return null;
  }
}

export function safeYamlParse(s: string | null): any | null {
  if (!s) return null;
  try {
    return load(s);
  } catch (e) {
    return null;
  }
}

export function safeJsonOrYamlParse(s: any): SerialValue {
  if (typeof s !== "string") return s;
  const trimmed = s.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const json = safeJsonParse(s);
    if (json !== null) return json;
  }
  return safeYamlParse(s);
}

export function safeJsonParseTyped<T>(json: string, validator?: (n: any) => boolean): T | null {
  try {
    const value = JSON.parse(json);
    if (validator) {
      if (validator(value)) {
        return value;
      }
      return null;
    }
    return value;
  } catch (e) {
    return null;
  }
}

export function extractFrontmatter(rawContent: string): {
  content: string;
  frontmatter: Record<string, SerialValue> | null;
} {
  const regex = /^---\s*\n([\s\S]*?)\n---\s*$/gm;
  const blocks: string[] = [];
  let match;

  while ((match = regex.exec(rawContent)) !== null) {
    blocks.push(match[1]);
  }

  if (blocks.length === 0) {
    return { content: rawContent, frontmatter: null };
  }

  const frontmatter: Record<string, SerialValue> = {};

  for (const block of blocks) {
    try {
      const parsed = load(block);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.assign(frontmatter, parsed);
      }
    } catch (e) {
      console.warn("Failed to parse frontmatter block:", e);
    }
  }

  const content = rawContent.replace(/^---\s*\n[\s\S]*?\n---\s*$/gm, "");

  return {
    content: content.trim(),
    frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null,
  };
}
