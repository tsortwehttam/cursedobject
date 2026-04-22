export type RegexLiteral = { body: string; flags: string };

// Parse `/body/flags` form. Returns null if not a regex literal.
export function parseRegexLiteral(s: string): RegexLiteral | null {
  const t = s.trim();
  if (!t.startsWith("/")) return null;
  const end = t.lastIndexOf("/");
  if (end <= 0) return null;
  return { body: t.slice(1, end), flags: t.slice(end + 1) };
}
