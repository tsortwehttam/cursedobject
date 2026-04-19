import { ScalarValue, SerialValue } from "./CoreTypings";
import { readTemplateToken } from "./TemplateHelpers";

type TokenPatternType = "QUO" | "NUM" | "PCT" | "SPC" | "WRD" | "TPL";

const TOKEN_PATTERNS: { type: TokenPatternType; regex: RegExp }[] = [
  { type: "QUO", regex: /^"((?:[^"\\]|\\.)*)"/ },
  { type: "QUO", regex: /^'((?:[^'\\]|\\.)*)'/ },
  { type: "QUO", regex: /^`((?:[^`\\]|\\.)*)`/ },

  { type: "QUO", regex: /^“((?:[^”\\]|\\.)*)”/ },
  { type: "QUO", regex: /^‘((?:[^’\\]|\\.)*)’/ },
  { type: "QUO", regex: /^«((?:[^»\\]|\\.)*)»/ },
  { type: "QUO", regex: /^「((?:[^」\\]|\\.)*)」/ },
  { type: "QUO", regex: /^『((?:[^』\\]|\\.)*)』/ },

  { type: "NUM", regex: /^-?0x[0-9a-fA-F]+/ },
  { type: "NUM", regex: /^-?[0-9]+\.?[0-9]*([eE][+-]?[0-9]+)?/ },
  { type: "NUM", regex: /^-?\.[0-9]+([eE][+-]?[0-9]+)?/ },
  { type: "WRD", regex: /^[$_\p{L}\p{N}]+(\.[$_\p{L}\p{N}]+)*/u },
  { type: "PCT", regex: /^[^\s]/ },
  { type: "SPC", regex: /^\s+/ },
];

export type LexerToken = {
  type: TokenPatternType;
  value: string;
};

export function tokenize(src: string) {
  const tokens: LexerToken[] = [];
  let remaining = src;

  while (remaining.length > 0) {
    const tpl =
      readTemplateToken(remaining, 0, "{{", "}}", true) ?? readTemplateToken(remaining, 0, "<<", ">>", false, false);
    if (tpl) {
      tokens.push({ type: "TPL", value: tpl.raw });
      remaining = remaining.slice(tpl.end);
      continue;
    }

    let matched = false;

    for (const pattern of TOKEN_PATTERNS) {
      const match = remaining.match(pattern.regex);
      if (!match) continue;

      matched = true;

      if (pattern.type === "QUO") {
        const unescaped = match[1].replace(/\\(.)/g, "$1");
        tokens.push({ type: pattern.type, value: unescaped });
      } else if (pattern.type === "NUM" || pattern.type === "PCT" || pattern.type === "WRD" || pattern.type === "SPC") {
        tokens.push({ type: pattern.type, value: match[0] });
      }

      remaining = remaining.slice(match[0].length);
      break;
    }

    if (!matched) {
      console.warn(`Lexer: Unable to tokenize remaining input: ${remaining}`);
      return tokens;
    }
  }

  return tokens;
}

export const KVP_DELIM = ";";
export const EAVE_DELIM = ",";

const UNARY_KEYWORDS = new Set(["typeof", "void", "delete"]);
const EXPR_START_PUNCT = new Set(["!", "-", "(", "[", "{"]);

export function looksLikeScriptExpression(tokens: LexerToken[]): boolean {
  const wows = tokens.filter((t) => t.type !== "SPC");
  if (wows.length < 2) return false;
  const puncts = tokens.filter((t) => t.type === "PCT");
  if (puncts.length === wows.length) return false;
  const first = wows[0];
  const second = wows[1];
  const heuristic =
    (first.type === "PCT" && EXPR_START_PUNCT.has(first.value)) ||
    (first.type === "WRD" && UNARY_KEYWORDS.has(first.value)) ||
    second.type === "PCT";
  if (!heuristic) return false;
  return true;
}

export function tokensToKVP(tokens: LexerToken[]): Record<string, SerialValue> {
  const res: Record<string, LexerToken[]> = tokensToKeyGroupPairs(tokens);
  const out: Record<string, SerialValue> = {};
  for (const key in res) {
    out[key] = tokensToScalarValue(res[key]);
  }
  return out;
}

export function tokensToKeyGroupPairs(tokens: LexerToken[]): Record<string, LexerToken[]> {
  const res: Record<string, LexerToken[]> = {};
  let group: LexerToken[] = [];
  function assignGroup() {
    if (group.length === 0) {
      return;
    }
    let keyIndex = -1;
    for (let i = 0; i < group.length; i += 1) {
      const t = group[i].type;
      if (t === "WRD" || t === "NUM") {
        keyIndex = i;
        break;
      }
    }
    if (keyIndex < 0) {
      group = [];
      return;
    }
    const key = group[keyIndex].value;
    const valueTokens = group.slice(keyIndex + 1);
    res[key] = valueTokens;
    group = [];
  }
  for (const token of tokens) {
    if (token.type === "PCT" && token.value === KVP_DELIM) {
      assignGroup();
      continue;
    }
    group.push(token);
  }
  assignGroup();
  return res;
}

export function tokensToScalarValue(parts: LexerToken[]): ScalarValue {
  const vals = trimTokenSpaces(parts);
  if (vals.length === 0) {
    return null;
  }
  if (vals.length === 1) {
    const part = vals[0];
    if (part.type === "QUO") {
      return part.value;
    }
    if (part.type === "NUM") {
      return Number(part.value);
    }
    if (part.type === "WRD") {
      if (part.value === "true") {
        return true;
      }
      if (part.value === "false") {
        return false;
      }
      if (part.value === "null") {
        return null;
      }
    }
  }
  let acc = "";
  for (const part of vals) {
    if (part.type === "QUO") {
      acc += `"${part.value}"`;
      continue;
    }
    acc += part.value;
  }
  return acc;
}

export function trimTokenSpaces(parts: LexerToken[]) {
  let start = 0;
  let end = parts.length - 1;
  while (start <= end && parts[start].type === "SPC") {
    start += 1;
  }
  while (end >= start && parts[end].type === "SPC") {
    end -= 1;
  }
  return parts.slice(start, end + 1);
}
