# Facsimile

See also @AGENTS.md.

Facsimile is a platform-agnostic, AI-native TypeScript engine for building interactive fiction, dynamic narratives, and social simulation games.

The aim is to support games where language, memory, knowledge, physical context, and authored story structure all matter at the same time: something in the territory between _Façade_, _The Sims_, _Firewatch_, parser-based IF, and simulation-heavy narrative games.

Facsimile is not a renderer, a game engine, or a content pack. It is the simulation and orchestration layer that sits between:

- authored world data
- player or NPC input
- rendering and UI
- AI and other external I/O

The engine should be able to drive anything from a terminal game to a 3D world in Unity, web, or native environments.

## Core Idea

Everything in a Facsimile world is modeled as an entity or an event. Logic is implemented entirely by matching on events and reacting to them. Entities themselves are just dumb objects. That includes obvious things like people, rooms, notes, paintings, doors, and items, but also less obvious things like:

- points on a navigation graph
- camera targets
- sources of knowledge
- invisible trigger volumes
- remembered facts
- the player
- special system objects like input and camera bindings

The engine does not distinguish between "story objects" and "simulation objects" unless the author does so in data. Facsimile should be authored as a simulation first - not as a tree of scripted story beats. The ideal shape is:

- entities have rich, explicit traits - authors spend most of their time here
- event handlers stay thin and operational
- AI and other adapters produce situated responses from world state

Authors should primarily describe what entities are, what they know, what is true about them, what is hidden, what they can perceive, and how interactions generally update state for each entity.

## Goals

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

## Non-Goals

- Facsimile is not a full 3D engine.
- Facsimile should not require a specific UI framework.
- Facsimile should not hardcode game-specific business logic.
- Facsimile should not depend on networked AI to be usable at all.

## Implementation & Design Goals

- Build from a very small set of primitives.
- Keep authored content human-readable and easy to hack.
- Make AI optional but first-class.
- Keep core logic in memory and environment-agnostic.
- Push all external I/O behind adapters.
- Let the same world run with different renderers and input systems.
- Prefer explicit data and composable primitives over special-case engine features.

As we begin implementation, please note the code we already have in:

- `lib/ParamsMarshaller.ts`
- `lib/TemplateHelpers.ts`
- `lib/ScriptEvaluator.ts`
- `lib/TokenizerLexer.ts`

## I/O Adapter

All I/O should live in the adapter layer. Examples of I/O:

- Disk
- Network
- LLM calls
- Game save and load
- Querying 3D space - e.g. for line-of-sight visibility
- Pathfinding
- System- and device-level events (mouse position, etc.)

Adapters live in `eng/adapters/` and can be composed with `composeAdapters`. The built-in adapters cover shared runtime concerns such as AI calls, terminal output, and mocks. Story-specific adapters live beside their story files under `fic/<story>/adapter.ts`.

Story files should emit semantic I/O, not presentation instructions. For example, a story should prefer `<<narrate ...>>` or `<<say Trip ; Player ; ...>>` over encoding terminal colors in `.fac` content. The active adapter decides how those outputs should be rendered for a terminal, web UI, native app, or test.

## Stories

Stories live in `fic/`, one subfolder per story:

- `fic/facade/facade.fac`
- `fic/facade/adapter.ts`

The sibling `adapter.ts` can provide initial entity ids, story params, input parsing, action listing, semantic renderers, and presentation styling. This keeps `.fac` content focused on world state and story behavior while adapters handle environment-specific integration.

Run a story with the generic REPL:

```sh
npm run facade
```

or:

```sh
tsx dev/repl.ts fic/facade/facade.fac
```

## Querying

A main component of Facsimily is the query interface. Since Facsimile isn't concerned with UI per say, games will have to implement that. But rather than have Facsimile push updates, instead, Facsimile receives events, updates, ensures consistency, and then exposes all entities properties in an easy-to-query interface so that the UI or other processes can find out the current state of entities in the system, including:

- What they just said
- What they are holding
- How they look
- What they are doing
