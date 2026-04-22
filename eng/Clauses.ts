export type Clause = { tag: string | null; payload: string };

// Given `;`-split parts from an io directive, classify each part by its leading tag word.
// A part whose first whitespace-delimited token is in `knownTags` becomes {tag, payload=rest}.
// Otherwise the whole part is an untagged payload (tag = null).
// Use case: <<#chat as Trip ; on * sayto Trip ... ; You are Trip... >>
export function parseClauses(parts: string[], knownTags: Set<string>): Clause[] {
  const out: Clause[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const m = t.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    if (m && knownTags.has(m[1])) {
      out.push({ tag: m[1], payload: (m[2] ?? "").trim() });
    } else {
      out.push({ tag: null, payload: t });
    }
  }
  return out;
}

// Filter clauses by tag. `null` selects untagged ones.
export function clausesOf(clauses: Clause[], tag: string | null): Clause[] {
  return clauses.filter((c) => c.tag === tag);
}

export function firstClause(clauses: Clause[], tag: string | null): Clause | undefined {
  return clauses.find((c) => c.tag === tag);
}
