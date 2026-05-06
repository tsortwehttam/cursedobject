# Yamlchemy 🍠

<img src="./mascot.png" alt="Yamlchemy mascot" width="160" />

Yamlchemy loads YAML (or a parsed object) and calculates values with deterministic templates, expressions, local async bindings, and inline conditionals.

```ts
import { load } from "./yamlchemy";

const yam = load(
  `
name: Ada
greeting: Hello {{name}}
score: -> 1 + 2
names:
  - Ada
  - Grace
firstName: "{{get('names.0')}}"
loud: "{{shout(name)}}"
allNames: -> select("names.*")
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
    fn: {
      shout: (s) => String(s).toUpperCase(),
    },
    io: {
      async lookup(params) {
        const row = await db.find(params.pairs.name);
        return row ? "ok" : "no";
      },
    },
  },
);

await yam.calc("greeting"); // "Hello Ada"
await yam.calc("score"); // 3
await yam.calc("allNames"); // ["Ada", "Grace"]
await yam.evaluate("get('names.0')"); // "Ada"
await yam.calc("greeting", { name: "Grace" }); // "Hello Grace"
yam.has("names.0"); // true
yam.raw("greeting"); // "Hello {{name}}"
await yam.calcAll();

await yam.update(
  {
    "relations.{{other}}.emotions.arousal": "-> incr(this)",
    emotions: { arousal: "-> incr(this) + 2.5" },
  },
  { other: "sarah" },
);
yam.clear();
```

## Syntax

- `{{expr}}` evaluates expressions against YAML keys, params, local bindings, and built-in helpers.
- `get("path.to.value")` reads one calculated path and returns `null` when missing.
- `select("path.*.value")` reads calculated wildcard matches and always returns an array. `*` matches one object key or array index.
- `{{cool|great|amazing}}` picks one variation with the seeded PRNG. Bare `|`, `^`, and `~` separators are treated as variation delimiters when the parts look like plain text.
- `-> expr` makes a string value calculate directly to the expression value.
- `opts.fn` registers sync helpers callable from `{{...}}` expressions (e.g. `shout(name)`).
- `<<#name args>>` calls `opts.io.name(params, handle)` (sync or async) and inserts the result.
- `<<#name:binding args>>` stores result in a local binding for the rest of the current string and inserts nothing.
- `{{#if expr}}...{{elseif expr}}...{{else}}...{{/if}}` renders the first matching block.

`calc(path)`, `calcAll()`, and `evaluate(expr)` are async. Each accepts an optional vars object that overlays the loaded params for that call. Use `fork(opts)` to create a new handle with merged options. `evaluate(expr)` runs the expression language directly against the calculated YAML context. Missing paths, bad expressions, unknown variables, unknown directives, and circular dependencies throw.

`update(patch, vars?, opts?)` mutates the loaded state. Patch keys are dotted paths (key templates may interpolate `{{vars}}` and contain `*` wildcards). Patch values are plain literals or template strings (`-> expr`, `{{...}}`); inside a template, `this` is the current calculated value at that path. All `this` snapshots are read before any writes. Missing paths are created by default; pass `opts.create: false` to throw instead. `clear()` resets state to the originally loaded values.

## License

Copyright 2026 Matthew Trost.

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).
