import JSON5 from "json5";

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
