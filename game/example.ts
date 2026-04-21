/**
// respond to events like this
Trip sayto Grace "Hello" {
  // emit explicit events like this
  Grace sayto Trip "Hi"
}

// wildcards for matching entities
$1 sayto Grace "You are ugly" {
  Grace.selfEsteem decr
  Grace.$1.dislike set 9999
}

// regex for matching
$1 sayto Bob /dog|puppy|hound/ {
  Bob.sadness incr
  Bob.note "You started thinking about your sick puppy, which made you sad. You want to talk about it"
}

// even property updates are reactable events
$1.selfEsteem decr {
  $1.anxiety incr 2
}

$1 sayto Grace "I love you" if $obs has Trip {
  Trip.Grace.jealousy set 6
  // can reference $actor, etc too
  Trip.$actor.suspicion set 2
}

// add your own lifecycle events
Trip spawn {
  Trip.self.description set "You are a successful, charismatic host who's built a refined life..."
  Trip.hair_color blond
  Trip.eye-color blue
}

// objective logic is possible - make entities aware of others traits reactively
$1 lookat Trip {
  // note Dynamic Content Variation as well as interpolation
  $1.Trip.desc set "Trip is a {{tall|very tall|super tall}} white man with {{Trip.hair_color}} hair, {{Trip.eye-color}} eyes, and..."
}

$1 lookat MonetPainting {
  // interpolating an expression
  $1.MonetPainting.description set "Painting of a calm pond covered with {{randIntBetween(3, 10) + 1}} floating lilies..."
}

// use AI calls for fuzzy matching any event value
Trip sayto Grace <<#match I dislike you >> {
  // or for responding dynamically
  Grace sayto Trip <<#chat Express your dislike for Trip>>
}
$1 sayto Grace <<#match I'm in love with you>> if $obs has Trip {
  // Trip probably gets more angry here
}

// get really meta with it
$1 sayto $2 $3 {
  $2 sayto $1 <<#chat {{$1}} said {{$3}} to you. Respond in character as {{$2}}.>>
}

$1 sayto $2 "ping" {
  $2 sayto $1 "pong"
}

// device events ... TODO: need to align this better
device keyboard/upArrow { ... }
device keyboard/onKeyPress { ... }
device form/onSubmit {}

// game-level events ... TODO: enumerate these
game boot {
  // set up NPCs and setting here
}

// templated conditionals in body
a b c {
  {{#if foo > bar}}
    something
  {{#elsif foo <= baz}}
    something else
  {{#else}}
    yet another thing
  {{#end}}

  {{#switch foo}}
  {{#case abc}}
    something
  {{#case /meow/}}
    something else
  {{#default}}final default thing{{#end}}
}

// io adapter call with variable binding
d e f {
  <<#bool romantic = Does Jim feel romantic toward Sue?>> // how the heck do we pass in context here?
  {{#if romantic}}
    something
  {{#end}}}
}

*/

import { SerialObject, SerialValue } from "../lib/CoreTypings";

type FacBaseEvent = {
  actor: string;
  verb: string;
  target: string;
  value: string;
};

type FacEvent = FacBaseEvent & {
  obs: string[];
};

type FacEventHandlerSpec = FacBaseEvent & {
  cond: string;
  body: string;
};

type FacEntity = {
  id: string;
  data: Record<string, SerialValue>;
};

type FacAdapterMethod = (world: FacWorld, ...args: string[]) => Promise<SerialObject>;
type FacAdapter = {
  methods: Record<string, FacAdapterMethod>;
};

type FacWorld = {
  entities: FacEntity[];
};

class Facsimile {
  constructor(
    public world: FacWorld,
    public adapter: FacAdapter,
    public handlers: FacEventHandlerSpec[],
  ) {}

  emit(event: FacEvent) {}
}

// big open question:
// the << >> often implies that context is passed.
// how do we specify that?
/*
first, how 

*/

// Grammar would be something like
// BLOCK = HEADING { BODY }
// EVENT_DESC = ACTOR VERB [TARGET [VALUE [if COND]]]
// HEADING = EVENT_DESC
// BODY = EVENT_DESC

// These are representative of the kinds of games Facsimile is meant to enable:
//
// - `Jury Room`: You are in a jury room with 11 other jurors. Their personalities, biases, and the trial facts are rolled each run. You need to persuade the group toward one verdict or another.
// - `Voir Dire`: A companion game to `Jury Room` where you interview generated jurors and decide who should sit on the jury, then carry that jury into the main game.
// - `No Exit`: Three people in a room, mostly talking. The gameplay is psychological, philosophical, and relational rather than physical.
// - `Sneaking`: One character is improvising a story in person while another feeds advice remotely. Comedy and fast social reasoning matter.
// - `Recruitment`: A dinner conversation where the other person may be a genuine defector, a plant, or an attempted recruiter. Information asymmetry is the core mechanic.
// - `Sim Cult`: A compound management and social control game involving believers, rivals, infiltrators, and law enforcement pressure.
// - `Trolls`: You are trapped with dangerous creatures and need to manipulate, charm, confuse, or outwit them through conversation.
//
// The through-line is that these games rely on:
//
// - social inference
// - memory and knowledge
// - physically situated interaction
// - dynamic dialogue
// - changing incentives and hidden information

/*
- This file format should be a proper Peggy grammar.
- Entities are just dumb objects with key value pairs.
- Main thread can query all entities (with filters) at any time and decide how to render, what to expose
- Engine simply receives events, and process them.
- IO adapter is used for llm calls and anything else, so callers can bring their own implementation. Things that are IO:
  - Game save, load
  - LLM calls
  - Querying for line-of-sight visibility, entities actual spatial position, etc.
  - May act as connector to system level events

## Design Goals

- Build from a very small set of primitives.
- Keep authored content human-readable and easy to hack.
- Make AI optional but first-class.
- Keep core logic in memory and environment-agnostic.
- Push all external I/O behind adapters.
- Let the same world run with different renderers and input systems.
- Prefer explicit data and composable primitives over special-case engine features.

PLEASE NOTE we have some code in ScriptEvaluator.ts and TemplateHelpers.ts and TokenizerLexer.ts that can likely help rather than implementing from scratch.

```
<<#text describe a scary looking place>>
<<#text name : the angriest character's name>>
<<#number Times Jim has said the word "the">>
<<#JSON roll a character with age, hair color, weight>>
<<#image:url Photoreal picture of cherry blossoms>>
<<#bool romantic : Does Jim feel romantic toward Sue?>>
<<#enum mood : happy|sad|angry : What mood is Bob in?>>

# nav and line-of-sight use the same machinery
<<#canSee visible : $actor Bob>>
<<#pathTo path : $actor Bob>>
<<#navigate $actor Bob>>

# layered interpolation: {{...}} is resolved first and baked into the prompt
<<#text describe hot weather in {{10|12|20}} words>>
```

*/
