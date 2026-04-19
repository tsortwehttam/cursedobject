import { SerialValue } from "./CoreTypings";
import { castToString } from "./EvalCasting";

export type TemplateToken = {
  raw: string;
  body: string;
  end: number;
};

export function readTemplateToken(
  text: string,
  start: number,
  open: string,
  close: string,
  doAllowNesting: boolean,
  doTrackQuotes: boolean = true,
): TemplateToken | null {
  if (!text.startsWith(open, start)) {
    return null;
  }
  let i = start + open.length;
  let depth = 1;
  let quote = "";
  let escape = false;

  while (i < text.length) {
    const ch = text[i] ?? "";

    if (quote) {
      if (escape) {
        escape = false;
        i += 1;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = "";
      }
      i += 1;
      continue;
    }

    if (doTrackQuotes && (ch === '"' || ch === "'" || ch === "`")) {
      quote = ch;
      i += 1;
      continue;
    }

    if (doAllowNesting && text.startsWith(open, i)) {
      depth += 1;
      i += open.length;
      continue;
    }

    if (text.startsWith(close, i)) {
      depth -= 1;
      i += close.length;
      if (depth === 0) {
        return {
          raw: text.slice(start, i),
          body: text.slice(start + open.length, i - close.length),
          end: i,
        };
      }
      continue;
    }

    i += 1;
  }

  return null;
}

export function renderHandlebarsTemplate(text: string, resolver: (expr: string) => SerialValue): string {
  if (!text.includes("{{")) {
    return text;
  }
  let out = "";
  let loc = 0;
  while (loc < text.length) {
    const start = text.indexOf("{{", loc);
    if (start < 0) {
      out += text.slice(loc);
      break;
    }
    out += text.slice(loc, start);
    const token = readTemplateToken(text, start, "{{", "}}", true);
    if (!token) {
      out += text.slice(start);
      break;
    }
    const expr = renderHandlebarsTemplate(token.body, resolver).trim();
    const value = resolver(expr);
    out += castToString(value);
    loc = token.end;
  }
  return out;
}
