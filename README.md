# MisterYam

MisterYam loads YAML and calculates values with deterministic templates, expressions, local async bindings, and inline conditionals.

```ts
import { load } from "./misteryam";

const yam = load(
  `
name: Ada
greeting: Hello {{name}}
score: -> 1 + 2
line: |
  <<#lookup:result name Ada>>
  {{#if result == "ok"}}
    passed
  {{else}}
    failed
  {{/if}}
`,
  {
    seed: 123,
    io: {
      lookup(params) {
        return params.pairs.name === "Ada" ? "ok" : "no";
      },
    },
  },
);

await yam.calc("greeting"); // "Hello Ada"
await yam.calc("score"); // 3
yam.raw("greeting"); // "Hello {{name}}"
await yam.calcAll();
```

## Syntax

- `{{expr}}` evaluates expressions against YAML keys, params, local bindings, and built-in helpers.
- `{{cool|great|amazing}}` picks one variation with the seeded PRNG. Bare `|`, `^`, and `~` separators are treated as variation delimiters when the parts look like plain text.
- `-> expr` makes a string value calculate directly to the expression value.
- `<<#name args>>` calls `opts.io.name(params, handle)` and inserts the result.
- `<<#name:binding args>>` stores result in a local binding for the rest of the current string and inserts nothing.
- `{{#if expr}}...{{elseif expr}}...{{else}}...{{/if}}` renders the first matching block.

`calc(path)` and `calcAll()` are async. Missing paths, bad expressions, unknown variables, unknown directives, and circular dependencies throw.
