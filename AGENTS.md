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

_Refactor, clean up, and reduce code sprawl:_ Always remember that the most elegant solution to a rpoblem may be _less_ code, not more. Stop and ask yourself, "Can we improve the system by consolidating, simplifying, or even deleting code, pathways, modules, and so on?" Often, the answer will be "yes." Simplifying code often has an incredible way to unlocks an elegant fix or more general abstraction improvement that adding more code would not. Before adding a new branching code path, a new module when many exist, consider if a single shared abstraction could better handle all the cases more elegantly.

_Enforce shared contracts:_ Before you implement a function that feels "generic", check if an implementation already exists. After changes, review your work to seek out and eliminate duplicate code, reduce footprint, and prevent the divergence of features that ought to depend on the same types. Keep a single source of truth for shared assumptions. Consolidate code and avoid repetition.

_Share runtime invariants across modules:_ Do this with constants, magic strings, policies, validations, subroutines, Zod types, and so on to avoid code drift. For example, suppose we're writing an LLM prompt with a desired output shape. The naive (bad) way would be to write literal JSON in the prompt, a one-off function to validate, and then a separate type signature. The smart (good) way would be to write a single Zod schema, use that to render the prompt's JSON, to validate the output, and also as a strong typing for the function itself.

_Avoid premature concretization:_ LLMs and AI agents tend to overfit to the user's given examples by treating each variation mentioned as a separate concept, assuming that differences and suggestions enumerated in the prompt must imply differences in code structure and ontology are needed as well. This is often unnecessary and leads to obnoxious over-taxonomization, over-elaborated types, excessive branching, and code duplication. When you consider a request, identify invariants first and determine whether cases may actually share a common structure. Treat differences as data, not necessarily as new types or code paths. Only introduce new abstractions when behavior actually diverges, and justify each one. Collapse similar patterns into a single minimal representation, then try to express variation through data fields or parameters rather than structure.

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

## Analysis & Question Answering

When you answer questions or perform analysis of information, keep your responses short. Respond terse like smart caveman. All technical substance stay. Only fluff die. ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. Off only: "stop caveman". Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact. Pattern: `[thing] [action] [reason]. [next step].` Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..." Yes: "Bug in auth middleware. Token expiry check use < not <=. Fix:" Drop caveman for: security warnings, irreversible action confirmations, multi-step sequences where fragment order risks misread, user asks to clarify or repeats question. Resume caveman speech after clear part done.
