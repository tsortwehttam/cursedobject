# Facsimile

Facsimile is a platform-agnostic, AI-native TypeScript engine for building interactive fiction, dynamic narratives, and social simulation games.

The aim is to support games where language, memory, knowledge, physical context, and authored story structure all matter at the same time: something in the territory between _Façade_, _The Sims_, _Firewatch_, parser-based IF, and simulation-heavy narrative games.

Facsimile is not a renderer, a game engine, or a content pack. It is the simulation and orchestration layer that sits between:

- authored world data
- player or NPC input
- rendering and UI
- AI and other external I/O

The engine should be able to drive anything from a terminal game to a 3D world in Unity, web, or native environments.

## Authoring Model

Facsimile should be authored as a simulation first, not as a tree of scripted story beats.

The ideal shape is:

- entities have rich, explicit traits
- handlers stay thin and operational
- AI and other adapters produce situated responses from world state

Authors should primarily describe what entities are, what they know, what is true about them, what is hidden, what they can perceive, and how interactions generally update state.

## Non-Goals

- Facsimile is not a full 3D engine.
- Facsimile should not require a specific UI framework.
- Facsimile should not hardcode game-specific business logic.
- Facsimile should not depend on networked AI to be usable at all.

## Core Idea

Everything in a Facsimile world is modeled as an entity or an event. Logic is implemented entirely by matching on events and reacting to them. Entities themselves are just dumb objects. That includes obvious things like people, rooms, notes, paintings, doors, and items, but also less obvious things like:

- points on a navigation graph
- camera targets
- sources of knowledge
- invisible trigger volumes
- remembered facts
- the player
- special system objects like input and camera bindings

The engine does not distinguish between "story objects" and "simulation objects" unless the author does so in data.
