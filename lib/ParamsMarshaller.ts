import { SerialValue } from "./CoreTypings";
import { castToString, isVarPath } from "./EvalCasting";
import { isValidUrl } from "./HTTPHelpers";
import { parseNumberOrNull } from "./MathHelpers";
import { ExprEvalFunc } from "./ScriptEvaluator";
import { isBlank } from "./TextHelpers";
import { KVP_DELIM, LexerToken, looksLikeScriptExpression, tokenize, tokensToScalarValue } from "./TokenizerLexer";

export type EvaluatorFunc = (
  expr: string,
  vars: Record<string, SerialValue>,
  funcs: Record<string, ExprEvalFunc>,
) => SerialValue;

export type MarshalledParams = {
  // The raw text of node.args
  text: string;
  // The parsed tokens of node.args
  tokens: LexerToken[];
  // Splitting into clauses delimited by ; then resolving the value, whether state var name, script chunk, etc.
  artifacts: SerialValue[];
  // Delimiting each K/V pair by ; assuming the first contiguous WRD token is the key and the rest is a value
  pairs: Record<string, SerialValue>;
  // The same as pairs, except *omitting* the first ;-delimited clause, for cases where we assume the first value
  // is an object of some kind, these are used as restructuring and merged into the first object
  trailers: Record<string, SerialValue>;
  // Full strings between each ; delimmiter
  clauses: string[];
  // Like clauses, but spans of tokens
  groups: LexerToken[][];
  // Flat list of all keys derived assuming ;-delimited
  keys: string[];
};

export function tokensToArgText(tokens: LexerToken[]) {
  return tokens
    .map((token) => {
      if (token.type === "QUO") {
        return JSON.stringify(token.value);
      }
      return token.value;
    })
    .join("")
    .trim();
}

export function arrayizeTokensOrNull(tokens: LexerToken[], delim: string = ","): SerialValue[] | null {
  const wows = trimSpaceTokens(tokens);
  if (wows.length < 2) return null;
  // Pre-flight check to avoid we aren't in just a math formula
  for (let i = 0; i < wows.length; i++) {
    const cand = wows[i];
    // I wonder if we should allow "." values too like "Dr. Smith"
    if (cand.type === "PCT" && cand.value !== delim) {
      return null;
    }
  }
  const first = wows[0];
  const last = wows[wows.length - 1];
  const isParen = first.type === "PCT" && first.value === "(" && last.type === "PCT" && last.value === ")";
  const isBracket = first.type === "PCT" && first.value === "[" && last.type === "PCT" && last.value === "]";
  if (!isParen && !isBracket) {
    return null;
  }
  const out: string[] = [];
  let accum: string = "";
  for (let i = 1; i < wows.length - 1; i++) {
    const inner = wows[i];
    if (inner.type === "PCT" && inner.value === delim) {
      out.push(accum);
      accum = "";
      continue;
    }
    accum += inner.value;
  }
  return out.map((inner) => {
    if (isBlank(inner)) return inner; // because empty string yields 0 when put into Number
    if (inner === "false") return false;
    if (inner === "true") return true;
    if (inner === "null" || inner === "undefined") return null;
    const non = parseNumberOrNull(inner);
    if (non !== null) return non;
    return inner;
  });
}

export function marshallTokensToValue(tokens: LexerToken[], evaluate: EvaluatorFunc): SerialValue {
  const aon = arrayizeTokensOrNull(tokens);
  if (Array.isArray(aon)) {
    return aon;
  }
  const val = tokensToScalarValue(tokens);
  if (typeof val === "string") {
    if (isValidUrl(val)) {
      return val;
    }
    return evaluate(val, {}, {});
  }
  return val;
}

export function spanToArtifact(span: LexerToken[], evaluate: EvaluatorFunc): SerialValue {
  if (span.length < 1) {
    return null;
  }
  if (span.every((token) => token.type === "SPC")) {
    return null;
  }
  if (span.length === 1) {
    const { value, type } = span[0];
    if (type === "NUM") {
      return Number(value);
    }
    if (type === "QUO") {
      return value;
    }
    if (type === "PCT" || type === "SPC") {
      return null;
    }
    if (isVarPath(value)) {
      const stateVal = evaluate(value, {}, {});
      if (stateVal !== null) return stateVal;
    }
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null" || value === "undefined") return null;
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== "") return num;
    return value;
  }
  return marshallTokensToValue(span, evaluate) ?? tokensToArgText(span);
}

export function onlyNonSpaceTokens(tokens: LexerToken[]): LexerToken[] {
  return tokens.filter((t) => t.type !== "SPC");
}

export function trimSpaceTokens(tokens: LexerToken[]): LexerToken[] {
  if (tokens.length < 1) return [];
  if (tokens[0].type === "SPC") return trimSpaceTokens(tokens.slice(1));
  if (tokens[tokens.length - 1].type === "SPC") return trimSpaceTokens(tokens.slice(0, -1));
  return tokens;
}

export function splitArgTokens(tokens: LexerToken[], delim: string = KVP_DELIM) {
  const groups: LexerToken[][] = [];
  let group: LexerToken[] = [];
  for (const token of tokens) {
    if (token.type === "PCT" && token.value === delim) {
      if (group.length > 0) {
        groups.push(group);
        group = [];
      }
      continue;
    }
    group.push(token);
  }
  if (group.length > 0) {
    groups.push(group);
  }
  return groups.map(trimSpaceTokens);
}

/**
 * This extremely important method is the way that we parse a node's "args", i.e. the stuff between
 * a "DIRECTIVE" and its "DO" terminator. In practice nodes have different semantics but end up needing
 * many similar utilities and rather than spread this across each directive, we choose to handle it
 * here all in one place where we can do the work in an efficient way. If you make a change here,
 * make sure to run the unit test because it took a full day to figure out how to do this correctly.
 */
export function marshallParams(text: string, evaluate: EvaluatorFunc): MarshalledParams {
  const tokens = tokenize(text);
  const groups = splitArgTokens(tokens);
  const pairs: Record<string, SerialValue> = {};
  const clauses: string[] = [];
  const keys: string[] = [];
  const trailers: Record<string, SerialValue> = {};
  const artifacts: SerialValue[] = [];
  for (let idx = 0; idx < groups.length; idx++) {
    const group = groups[idx];
    const wows = onlyNonSpaceTokens(group);
    const first = wows[0];
    if (!first) {
      clauses.push("");
      artifacts.push(null);
      continue;
    }
    if (wows.length === 1) {
      clauses.push(first.value);
      const artifact = spanToArtifact(wows, evaluate);
      artifacts.push(artifact);
      keys.push(first.value);
      if (artifact && !Array.isArray(artifact) && typeof artifact === "object") {
        Object.assign(pairs, artifact);
      } else {
        pairs[first.value] = null;
      }
      continue;
    }
    const clause = tokensToArgText(group);
    clauses.push(clause);
    const aon = arrayizeTokensOrNull(tokens);
    if (Array.isArray(aon)) {
      artifacts.push(aon);
    } else {
      if (looksLikeScriptExpression(group)) {
        const interp = evaluate(clause, {}, {});
        if (interp !== null) {
          artifacts.push(interp);
          continue;
        }
      }
    }
    keys.push(first.value);
    // Ensure we properly handle k/v pair-like sections
    const value = spanToArtifact(trimSpaceTokens(group.slice(1)), evaluate);
    pairs[first.value] = value;
    artifacts.push(value);
    if (idx > 0) {
      trailers[first.value] = value;
    }
  }
  return {
    text,
    tokens,
    clauses,
    artifacts,
    pairs,
    trailers,
    groups,
    keys,
  };
}

export function readNamedClause(params: MarshalledParams): string {
  const group = params.groups[0] ?? [];
  const plain = params.clauses[0]?.trim() ?? "";
  if (onlyNonSpaceTokens(group).length > 1) {
    return plain;
  }
  return castToString(params.artifacts[0] ?? plain);
}
