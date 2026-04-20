# Facsimile

Facsimile is a platform-agnostic, AI-native TypeScript engine for building interactive fiction, dynamic narratives, and social simulation games.

The aim is to support games where language, memory, knowledge, physical context, and authored story structure all matter at the same time: something in the territory between _Façade_, _The Sims_, _Firewatch_, parser-based IF, and simulation-heavy narrative games.

Facsimile is not a renderer, a game engine, or a content pack. It is the simulation and orchestration layer that sits between:

- authored world data
- player or NPC input
- rendering and UI
- AI and other external I/O

The engine should be able to drive anything from a terminal game to a 3D world in Unity, web, or native environments.

## Status

This repo is early and still focused on core primitives. Some parsing and scripting infrastructure already exists in [`lib/`](./lib), including tokenizer, template rendering, and a sandboxed expression evaluator. The rest of this README is the intended product and implementation spec we are building toward.

Concrete schema and runtime-shape decisions live in [`docs/data-model.md`](./docs/data-model.md).
Current agreed decisions and remaining open questions are summarized in [`docs/spec-status.md`](./docs/spec-status.md).

## Design Goals

- Build from a very small set of primitives.
- Keep authored content human-readable and easy to hack.
- Make AI optional but first-class.
- Keep core logic in memory and environment-agnostic.
- Push all external I/O behind adapters.
- Let the same world run with different renderers and input systems.
- Prefer explicit data and composable primitives over special-case engine features.

## Authoring Model

Facsimile should be authored as a simulation first, not as a tree of scripted story beats.

The ideal shape is:

- entities have rich, explicit traits
- handlers stay thin and operational
- AI and other adapters produce situated responses from committed world state
- scripts exist for deliberate authored beats, cut scenes, and specific actions that need exact control

Authors should primarily describe what entities are, what they know, what is true about them, what is hidden, what they can perceive, and how interactions generally update state. For a character such as Grace, this means authoring her appearance, history, preferences, relationships, current mood, private affair, visible behavior, and conditions under which private facts become relevant. It should not require writing every possible line she might say.

Traits are the main grounding surface for emergent behavior. Public traits are generally available to perception and prompt assembly when the observer can perceive them. Private traits are true of the subject but should not be automatically shown to other entities or injected into AI context. A private trait can become known through explicit events, knowledge records, inference, confession, discovery, or authored state transitions.

Handlers should usually answer small operational questions:

- can this action happen now?
- what state changes does it cause?
- what events or adapter-backed work should follow?
- what new facts become visible or known?

They should avoid embedding multi-step prose beats where structured events would be clearer. For example, serving a drink is not one string like `Trip pours himself a drink. "Just one."` It is at least a physical action event and a speech event. A renderer, terminal UI, replay viewer, or AI prompt assembler can decide how to present those committed events.

This keeps inversion of control in the right place. Authored data defines the simulation and its constraints. The engine assembles entity-relative views of the world. AI can then generate dialogue, narration, decisions, or other adapter-backed outputs from what the actor can actually perceive, remember, infer, or know. Scripted snippets remain available, but they are the exception for authored specificity, not the default way to make characters feel alive.

## Non-Goals

- Facsimile is not a full 3D engine.
- Facsimile should not require a specific UI framework.
- Facsimile should not hardcode game-specific business logic.
- Facsimile should not depend on networked AI to be usable at all.
- Facsimile should not add sugar unless the same behavior can already be expressed from primitives.

## Core Idea

Everything in a Facsimile world is modeled as an entity.

That includes obvious things like people, rooms, notes, paintings, doors, and items, but also less obvious things like:

- points on a navigation graph
- camera targets
- sources of knowledge
- invisible trigger volumes
- remembered facts
- the player
- special system objects like input and camera bindings

The engine does not distinguish between "story objects" and "simulation objects" unless the author does so in data.

## Core Primitives

Facsimile should stay centered on a few concepts:

- `entities`: world objects with identity
- `traits`: information about an entity
- `handlers`: actions an entity can respond to
- `anchors`: named attachment or position slots on entities
- `events`: immutable records of things that happened

Most higher-level features should be buildable from these.

### Entities

An entity is the basic unit of simulation. At minimum, an entity is a lightweight object with:

- an id
- a type or inherited base
- traits
- zero or more handlers
- zero or more anchors
- optional transform data such as position and rotation

Entities may be visible, invisible, physical, conceptual, transient, or long-lived.

The canonical internal model should distinguish between authored definition and runtime state.

- `EntityDef`: authored, inherited, mostly static data such as type, base traits, handlers, anchors, tags, and default transform
- `EntityState`: mutable runtime state such as resolved traits, transform, anchor occupancy, and transient status

This split keeps inheritance, save/load, and runtime mutation clean. The authored layer defines what an entity is. The runtime layer defines what has happened to it.

### Traits

Traits are facts or state attached to an entity.

Traits can represent:

- physical properties like height, clothing, location
- social state like trust, suspicion, attraction
- mental state like mood, goals, stress
- biography like age, birthplace, occupation
- knowledge like "saw the painting" or "knows Bob has a tattoo"
- engine-facing metadata

Traits are also how AI gets grounded. If a character knows or sees something, that should be representable as traits and queryable state, not only implied text.

Traits should support at least these visibility categories:

- public: facts that are generally observable when relevant perception conditions are met
- private: facts that are true of the entity but not automatically observable

Traits describe world state, not what every other entity knows. The engine must separately model:

- what is true (traits may represent false beliefs too!)
- what is currently perceivable by a given entity
- what a given entity knows or remembers
- meta considerations: when entities know _that other entities know_

The exact storage shape may evolve, but the engine should not collapse truth, visibility, and per-entity knowledge into the same concept.

Traits might not always be key/value pairs or especially data-like; a trait might be as simple as a natural language string descriptor:

- `believes police are all bad people`
- `wishes Jane would ask about his photography`
- `thinking about his dog`

### Handlers

Handlers are named actions an entity can respond to.

Examples:

- `look_at`
- `talk_to`
- `pick_up`
- `give_to`
- `open`
- `close`
- `move_to`
- `keyboard/upArrow`
- `kiss`
- `punch`

A handler should define:

- an optional `when:` precondition expression
- an optional `super: true` flag for inheritance chaining
- the logic that runs when it is invoked

Handlers are how authored content meets simulation. They should be discoverable and queryable so both UI code and NPC decision systems can inspect what is currently possible.

Handlers are ideally atomic and non-overlapping (this isn't a rule but a general principle). Meaning, we would not have an `accuse` action because that would be better encapslated by a character using `talk_to` to verbally give the accusation.

Dispatch is always target-side. A handler lives on the entity being acted on; the event's `target` determines whose handler runs. `Painting_1.look_at` runs when someone looks at it; `move_to` dispatches to the destination; `$input.keyboard/upArrow` runs when the input system emits a keystroke. Actor-side concerns (actor type, required traits, range, spatial and temporal gates) are expressed through the handler's `when:` precondition using pure stdlib helpers like `hasType`, `hasTag`, and `within`. Failed preconditions silently drop the handler.

Observer reactions are modeled as synthetic perceive events. After a primary event commits, the engine emits a `perceive/<primary_type>` event to each observer (for example, `perceive/look_at`, `perceive/talk_to`). Perceive events dispatch target-side to the observer and follow the normal handler pipeline. Event type names are namespaced with `/`; `.` is reserved for trait paths.

### Anchors

Anchors are named attachment or position points on an entity.

Examples:

- a person's `left_hand`
- a wall's `center`
- a chair's `seat`
- a room tile's `stand`
- a patrol node's `next`

Anchors serve these purposes:

1. Composition: holding or attaching other entities.
2. Positioning: arranging objects relative to each other.

Anchors may constrain:

- what kinds of entities they accept
- how many entities they hold
- whether they are exclusive
- how they relate spatially to the parent entity

Anchors should stay generic. They should define attachment constraints and relative transforms, but should not absorb unrelated systems. Navigation is an adapter-backed concept, not an anchor extension (see Spatial Model and Navigation below).

### Events

The runtime is event-driven.

Examples:

```ts
{ type: "look_at", actor: "Bob", target: "Painting_1" }
{ type: "talk_to", actor: "Player", target: "Alice", body: "What did you see?" }
{ type: "keyboard/leftArrow", actor: "Player" }
```

Events are not entities. They are immutable records of what happened.

Events carry an optional `observers` field that controls who perceives them. Unset means the engine derives the observer set via the perception adapter. An explicit list is used as-is (for whispers, radios, letters). An empty list means the event is fully private. After a primary event commits, the engine fans out a `perceive/<primary_type>` event to each observer.

The event log is important for:

- replay and debugging
- state transitions
- AI context assembly
- querying recent history
- testing deterministic behavior

## Runtime Model

At a high level, the engine should work like this:

1. Load authored world data into in-memory entities.
2. Accept external input as events.
3. Process each event through an async engine pipeline.
4. Resolve which handlers can respond.
5. Execute handler logic and produce effects.
6. Resolve any adapter-backed work required by those effects.
7. Commit resulting state changes and events.
8. Allow callers to query the current committed world state at any time.

NPC behavior should plug into the same model. An NPC deciding to act is just another source of events.

Handlers should not directly mutate world state or call adapters themselves. A handler should evaluate against the current world and an input event, then return declarative effects plus any follow-up events. The engine is responsible for resolving any deferred adapter-backed work and then applying committed state changes in a deterministic order.

Events are async from the caller's point of view. Queries should remain immediate reads against the latest committed world revision. Callers may also wait for a specific event, or for all pending events, to settle before reading.

## Knowledge and Perception

One of the main jobs of the engine is to model what each entity can perceive and know.

If Bob looks at a painting, the engine should be able to represent both:

- that the painting has certain traits (visible to Bob)
- that Bob now knows those traits

That distinction matters for dialogue, planning, deception, memory, and AI prompting.

This implies a few requirements:

- visibility should be queryable from world state
- knowledge transfer should happen through explicit engine mechanisms
- AI prompts should be assembled from entity-specific world views, not omniscient state dumps
- authored logic should be able to ask both "what is true?" and "what does this character know?"

Knowledge should be represented as observer-owned records about another entity's state, rather than by copying source traits onto the observer. These records should store the claimed fact, provenance, confidence, and confirmation history.

Current visibility should not be stored in knowledge records. It should be derived separately from world state and perception rules.

## AI-Native, Not AI-Dependent

Facsimile is AI-native. It should make common AI tasks easy:

- dialogue generation
- classification
- summarization
- structured extraction
- character generation
- world flavor text
- image generation for assets

But AI should remain an adapter-backed capability, not a hard dependency of core simulation.

If a game wants to use a local model, remote API, or no model at all, the same world model should still work.

AI context should be assembled from layered, entity-relative views rather than omniscient world dumps. The runtime should separately compose stable identity context, current scene view, relevant knowledge, and recent interaction history, then include only the slices needed for the current AI task.

## Adapters and I/O

All external I/O should go through adapters.

That includes:

- LLM calls
- storage
- networking
- clocks and timers
- randomness, if a host wants to override it
- telemetry
- asset generation

This keeps the simulation portable and testable. A browser game, CLI game, native game, or Unity integration should all be able to host the same engine with different adapters.

## Authoring Model

Facsimile is data-driven. A story or world should mostly be authored as structured data, not engine code.

The preferred authoring format is YAML because it is readable and hackable, though the engine should operate on in-memory data so JSON or any similar serialization format would work as well.

Goals for the format:

- easy to read
- easy to diff
- easy to generate procedurally
- easy to validate
- easy to mod

World data should be validated with a strong schema. Zod is the intended validation layer.

## Example World Shape

The exact schema is still evolving, but the intended direction looks like this:

```yaml
Person:
  handlers:
    look_at:
      when: "{{ hasType($actor, 'Person') }}"
      action: |
        convey($self, ["hair_color", "wearing_shirt"], $actor)
  anchors:
    left_hand:
      capacity: 1
      accepts: [Item]
    right_hand:
      capacity: 1
      accepts: [Item]

Bob:
  inherits: [Person]
  traits:
    public:
      hair_color: blue
      wearing_shirt: true
    private:
      tattoo.shape: heart
      tattoo.location: left_bicep
  handlers:
    look_at:
      super: true
      action: |
        {{#if wearing_shirt === false}}
          convey($self, ["tattoo.shape", "tattoo.location"], $actor)
        {{#end}}
    tear_off_shirt:
      when: "{{ hasType($actor, 'Person') && within($actor, $self, 2.0) }}"
      action: |
        set("wearing_shirt", false)
```

This example captures several desired properties:

- inheritance for shared definitions
- explicit public and private traits
- handler composition
- simple conditional content
- knowledge transfer as an explicit action

## Scripting and Dynamic Content

Any string value may support richer interpretation by the engine.

The repo already contains early infrastructure for this in [`lib/TokenizerLexer.ts`](./lib/TokenizerLexer.ts), [`lib/ScriptEvaluator.ts`](./lib/ScriptEvaluator.ts), and [`lib/TemplateHelpers.ts`](./lib/TemplateHelpers.ts).

### `{{ ... }}` interpolation

Use `{{ ... }}` for deterministic evaluation:

```yaml
foo: {{name}}
foo: {{name.value}}
foo: {{calcFloor(x * 3)}}
foo: {{cond(hp > 75, "strong", "faint")}}
```

Also support directive-style templating:

```yaml
foo: |
  {{#if foo > bar}}
    something
  {{#elsif foo <= baz}}
    something else
  {{#else}}
    yet another thing
  {{#end}}

bar: |
  {{#switch foo}}
  {{#case abc}} something
  {{#case /meow/}} something else
  {{#default}} final default thing
  {{#end}}
```

And dynamic content variation (DCV):

```yaml
foo: {{a|b|c}}
foo: {{~a|b|c}}
foo: {{^a|b|c}}
foo: {{+a|b|c}}
```

### `<< ... >>` interpolation

`<< ... >>` is the suspension-world. Each block performs exactly one adapter-backed operation: an AI call, a nav query, a line-of-sight check, or any other engine-managed I/O. Every block takes a `#directive` prefix and may optionally bind its result.

Grammar:

```
<<# directive [binding :] body>>
```

Examples:

```yaml
foo: <<#text describe a scary looking place>>
foo: <<#text name : the angriest character's name>>
foo: <<#number Times Jim has said the word "the">>
foo: <<#JSON roll a character with age, hair color, weight>>
foo: <<#image:url Photoreal picture of cherry blossoms>>
foo: <<#bool romantic : Does Jim feel romantic toward Sue?>>
foo: <<#enum mood : happy|sad|angry : What mood is Bob in?>>

# nav and line-of-sight use the same machinery
foo: <<#canSee visible : $actor Bob>>
foo: <<#pathTo path : $actor Bob>>
foo: <<#navigate $actor Bob>>

# layered interpolation: {{...}} is resolved first and baked into the prompt
foo: <<#text describe hot weather in {{10|12|20}} words>>
```

Rules:

- Inside `<<...>>` there is no expression parser. Args are positional tokens; `$var` resolves against scope, bare identifiers are entity refs, remainder-of-body is the prompt for prose directives.
- Without a `binding :`, prose directives emit their result at position; non-prose directives are fire-and-forget.
- AI-backed branching is not a separate construct. Bind a `#bool` or `#enum` result, then branch in `{{...}}`.

Example of branching on an AI classification:

```yaml
foo: |
  <<#bool romantic : Does Jim feel romantic toward Sue?>>
  {{#if romantic}}
    something
  {{#end}}
```

This should compile down to explicit adapter calls with structured context. The engine, not the author, is responsible for assembling the right prompt context from world state, though the engine may expose affordances for author override.

Internally, each `<<...>>` block lowers to a declarative effect that the engine resolves through the right adapter, with caching, logging, and deterministic replay. That effect model is an engine detail, not a primitive authors need to think in directly.

### Script blocks

Any string beginning with `->` is treated as a script expression:

```yaml
foo: -> calcFloor(x * 3) + {{bonus}}
```

The scripting environment should be:

- sandboxed
- deterministic unless randomness is explicitly used
- safe to run for untrusted content
- expressive enough for authored logic

It should not allow arbitrary host access or unbounded execution.

## Querying

The engine should expose query APIs over the live world state.

Callers need to be able to ask things like:

- which handlers are available to this actor right now?
- what changed after the last event?
- what does Alice know about Bob?
- which entities are visible from here?
- what is attached to this anchor?
- which nearby actions are possible?

Queries matter for both renderers and AI systems. A UI needs them to render the world. An NPC planner needs them to choose actions.

## Input and Camera

Facsimile should treat input and camera as data-bound engine concepts, not renderer-specific hacks.

Special entities like `$input` and `$camera` can provide a convenient bridge:

```yaml
$input:
  handlers:
    keyboard/upArrow: {}
    keyboard/downArrow: {}
    keyboard/leftArrow: {}
    keyboard/rightArrow: {}

$camera:
  position: ~Player.face
  rotation: ~Player.rotation
```

This is mainly a convenience layer. The host environment is still responsible for emitting input events and consuming camera state.

## Spatial Model and Navigation

Facsimile should support explorable spaces, but the engine does not bake in a specific spatial model.

Walkable locations are still entities, occupancy is still explicit, and range predicates still work against world positions or graph distance. What changes is that navigation, pathfinding, and line-of-sight are adapter-backed. The engine defines a small nav interface and the host supplies the implementation:

- an entity-graph walker for room-based IF
- a tile-grid A*
- a 3D navmesh
- a full physics raycaster

The same authored world should run under any of these without changes to simulation code.

Authoring uses `<<...>>` directives for anything that touches the spatial adapter:

```yaml
<<#canSee visible : $actor Bob>>
<<#pathTo path : $actor Bob>>
<<#navigate $actor Bob>>
```

Ongoing operations like `navigate` write status and progress into committed state, which `{{...}}` can read synchronously. Point queries like `canSee` and `pathTo` resolve through the adapter and bind their results into handler scope.

This keeps the engine portable and pushes the "what's my spatial model" decision down to the host, where it belongs.

## Planning and NPC Behavior

Facsimile should work well with planners, especially GOAP-style systems.

An NPC may have:

- goals
- beliefs
- known world state
- available handlers
- heuristics or personality biases

A planner can then search for a useful path through available actions. Because handlers are enumerable and queryable, the engine can provide grounded action spaces instead of asking an LLM to invent capabilities.

That gives us a strong division of labor:

- simulation defines what is possible
- planners search among possible actions
- AI helps choose, rank, justify, or speak within that space

## Determinism, Safety, Performance

These constraints matter from the start:

- core simulation should be deterministic under a fixed seed and adapter behavior
- untrusted authored content must not get arbitrary code execution
- state transitions should be inspectable and replayable
- AI calls should be explicit, cachable, and ideally resumable
- performance should not depend on constantly rebuilding huge prompts from scratch

Performance will likely require:

- incremental world indexing
- selective prompt assembly
- memoization or caching of expensive derived views
- explicit boundaries on when AI is invoked

## Authoring Philosophy

Facsimile should resist convenience features that bypass the model.

The standard for adding a new feature should be:

1. Can this already be expressed with entities, traits, handlers, anchors, and events?
2. If not, is the missing behavior fundamental or just syntactic sugar?
3. Would adding the concept simplify many real authoring cases without weakening the model?

The author should be able to do things the "long way" from primitives first. Only then should we consider adding dedicated syntax or helpers.

## Example Games

These are representative of the kinds of games Facsimile is meant to enable:

- `Jury Room`: You are in a jury room with 11 other jurors. Their personalities, biases, and the trial facts are rolled each run. You need to persuade the group toward one verdict or another.
- `Voir Dire`: A companion game to `Jury Room` where you interview generated jurors and decide who should sit on the jury, then carry that jury into the main game.
- `No Exit`: Three people in a room, mostly talking. The gameplay is psychological, philosophical, and relational rather than physical.
- `Sneaking`: One character is improvising a story in person while another feeds advice remotely. Comedy and fast social reasoning matter.
- `Recruitment`: A dinner conversation where the other person may be a genuine defector, a plant, or an attempted recruiter. Information asymmetry is the core mechanic.
- `Sim Cult`: A compound management and social control game involving believers, rivals, infiltrators, and law enforcement pressure.
- `Trolls`: You are trapped with dangerous creatures and need to manipulate, charm, confuse, or outwit them through conversation.

The through-line is that these games rely on:

- social inference
- memory and knowledge
- physically situated interaction
- dynamic dialogue
- changing incentives and hidden information

## Prior Art

Facsimile should borrow from existing work where it helps, especially around:

- simulation object models
- event sourcing
- planner integration
- parser IF interaction patterns
- relationship modeling
- AI context management
- moddable data formats

Good prior art may come from games, simulation frameworks, narrative tools, AI agent systems, and world editors. The goal is not novelty for its own sake. The goal is a tight model that works.

## Immediate Implementation Work

The core v1 decisions are now narrow enough to implement against. The first runtime slice covers exported types, Zod schemas, and the worked event-run example. Next implementation work should broaden that slice:

- Implement full handler inheritance chaining.
- Expand the script action parser beyond simple helper-call lines.
- Implement the typed query API and query-backed stdlib helpers.
- Add adapter-backed `<<...>>` directives for AI and navigation.

## Implementation Direction

A sensible build order is:

1. Finalize the core entity, trait, handler, anchor, and event schemas.
2. Define the world state container and query surface.
3. Define handler invocation and event application semantics.
4. Formalize knowledge/perception state.
5. Formalize adapters for AI and other I/O.
6. Lock down the scripting and templating execution model.
7. Add spatial and navigation conventions.
8. Add planner integration on top of the stable primitive model.

## Summary

Facsimile is meant to be a small, portable simulation core for authored and emergent narrative worlds, especially ones driven by conversation, knowledge, memory, and situated action.

If the engine is doing its job, authors should be able to build very different kinds of narrative games while only learning a small set of concepts, and hosts should be able to run the same world in very different environments without changing the simulation model.
