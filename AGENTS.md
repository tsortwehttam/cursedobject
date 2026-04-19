# Instructions

See @README.md

## General

- Write simple, minimal, modular code that is strongly typed and:
  - DRY: If you repeat code in multiple places, extract it into a reusable function
  - YAGNI: Make abstractions only when you _actually_ need it in more than one place
- Use short variable names in clean, tight, well-organized stanzas
- Don't add comments unless critical; code should be self-descriptive
  - If you add a comment, it should explain _why_ the code is needed, not what it does
- Prefer pure functions with explicit inputs and outputs
- Separate pure and impure code religiously
  - Business logic should work in memory as much as possible
  - If I/O is unavoidable, use dependency injection or strategy pattern
  - If unit tests require I/O, that means your separation is poor
- Prefer early return over conditional
- Array properties should default to empty arrays, not `null`
- Prefer libraries' own types over writing your own
- Don't create classes (unless instructed)
- Don't add console.logs - unless temporarily for debugging
  - But leave existing console.logs/info untouched
- Never include backward compat code (unless instructed)
  - Remove legacy, unused, and cruft code wherever you find it
- When researching APIs and docs, use latest content (it is 2026)
- If you're unsure about something, ask!
- Make shared constants `UPPER_CASE`
- For functions, prefer camel case verbs (`calcTimeAt(x)`, not `timeAt(x)`)
- For variables and object properties, prefer concise single words (`elapsed`, not `elapsedTime`)
- Fix problems the _right_ way (robust), not hacky
- For functional units that don't require I/O or significant setup/teardown, add unit tests
  - Write tests in `test/*.test.ts`
- Warn me if you notice security vulnerabilities, flaws
  - Always double check that we aren't exposing secret keys or env vars to the client
- Keep the README and docs up-to-date
  - README is for consumers of the project, not the developers of it
- Docs should go under `docs/`, plans under `plans/`

## JavaScript & TypeScript

- Prefer strong TypeScript everywhere - scripts, components, business logic, tooling
- Avoid mjs whenever possible
- After logical changes, package upgrades, or refactors, run typecheck and unit tests
- Never use the `any` type and avoid `unknown` unless you have no other choice
- For command line tools and arg parsing, always use yargs
- Prefer function declaration style (`function getFoo() {...}`)
- Don't add try/catch blocks
- Rely on strong typing rather than throwing
  - Be liberal in what we accept
- Don't use `optional?:` types function arguments or object properties
- Don't use default exports (unless necessary)
- Make Zod schemas PascalCase, like `FooSchema`
- Scan `lib/*` or `src/*` and make use of pre-existing utility/helpers files
- When naming files with shared code, use `FooUtils.ts` for i/o stuff, `BarHelpers.ts`
  - e.g. `MathHelpers.ts`, `WebsocketUtils.ts`, etc.
- Delete all dead code - use `https://knip.dev/blog/knip-v6`

## React & Components & Web & Frontend UI

- All pages, views, and components should be implemented in mobile-first, platform-agnostic way
- Use pure functional components with strongly typed props (use inline typings unless shared)
- Presentational components should be separated from logical components
- Reusable business logic should be modularized into React hooks in a `hooks/` folder
- Each hook's file name should match the hook's exported name
- Prefer idiomatic Tailwind as the CSS/styling solution

### Try to Enforce Shared Contracts

Before you implement a function that feels "generic", check if an implementation already exists. For example, if you're changing some pricing logic, you should scan to see what utility code already exists for managing pricing, billing, etc. Then, after changes, review your work to seek out and eliminate duplicate code, streamline logic, reduce footprint, and prevent the divergence of features that ought to depend on the same types. Keep a single source of truth for shared assumptions, and try your best to consolidate code and avoid repetition.

Always look for runtime invariants (constants, magic strings, policies, validations, subroutines) and find ways to share across modules to avoid code drift. For example, suppose we're writing an LLM prompt with a desired output shape which we then pass to a function. The naive (bad) way to do this would be to write literal JSON in the prompt, a one-off function to validate its shape, and then a separate type signature for the function. The smart (good) way would be to write a single Zod schema, use that to render the prompt's JSON, to validate the output, and to use as a strong signature of the function.

### Consider whether the solution is LESS code

Continually ask yourself: Can we improve the system by _consolidating_, _simplifying_, _reducing_, or even _deleting_ code, pathways, modules, etc? Often simplifying unlocks an elegant fix or improvement that adding modules would not.

## Writing, Prose

Write in the simplest way you can with no fluff. Avoid LLM-isms like "it's not X, it's Y".

# Analysis & Question Answering

When you answer questions or perform analysis of information, keep your responses short. Begin with a compact and direct response of under 50 lines. The human needs to understand the answer immediately without getting bogged down in details. After the main idea section, you may put details, add'l considerations, reframings, edge cases, ancillary discussion and so on. Do not repeat yourself. Do not rephrase the same information in multiple different ways. Use headings and lists sparingly.
