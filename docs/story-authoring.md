# Story Authoring

Facsimile story state should separate three concerns:

- `public.*`: facts another entity or player can perceive.
- `private.*`: facts hidden from ordinary perception but useful when prompting that character or an omniscient narrator.
- Gameplay counters, such as `feelings.tension`, `feelings.affection`, and `insight`: numbers handlers use to branch story state.

Avoid taxonomy unless it changes inclusion rules. If fields always enter prompts together, merge them. Prefer one strong `private.personality` over separate literary labels such as `profile`, `need`, and `wound`.

## Problem

This shape mixes intent:

```fac
Grace {
  name = "Grace";
  location = "Apartment";
  role = "Trip's wife and artist who feels trapped";
  with public {
    name = "Grace";
    look = "elegant, controlled, tired of performing happiness";
    mood = "composed and cutting";
  }
  with private {
    need = "stop being curated by Trip";
    wound = "gave up her art and resents Trip's social performance";
  }
  affection = 3;
  tension = 0;
  self = 0;
}
```

Problems:

- `role` is not a role. It is prompt guidance and belongs in `private.personality`.
- `public.look` contains invisible psychology. Other characters cannot literally see "tired of performing happiness."
- `public.mood` is literary direction, not stable world state. If it helps only the LLM choose voice, put it in private prompt context or the chat system line.
- `private.need` and `private.wound` do not need separate fields unless prompts include them differently.
- `self` is unclear. The counter means earned insight, so name it `insight`.

## Improved Shape

```fac
Grace {
  name = "Grace";
  location = "Apartment";
  public {
    name = "Grace";
    appearance = "elegant clothes, guarded posture, precise smile";
  }
  private {
    personality = "Trip's wife. An artist who feels curated into Trip's display of success and wants to stop performing happiness. Gave up too much of her art and resents being turned into evidence of his taste.";
  }
  feelings {
    affection = 3;
    tension = 0;
  }
  insight = 0;
}
```

This matches engine intent:

- Observable descriptions stay queryable by UI and other entities.
- Hidden motivation only enters prompts when a `<<chat>>` explicitly asks for it.
- Stable character guidance has one inclusion policy.
- Gameplay counters read like story mechanics.

## Prompt Inclusion

Request prompt fields by inclusion policy, not by object shape accident:

```fac
Grace sayto Player <<chat
  as Grace ;
  system Player is touching the art topic. Grace reveals pride and discomfort about her art and Trip's taste. One line. ;
  on * sayto * ... ;
  recent 12 ;
  with public.*, feelings.*, insight, private.personality where location == Player.location
>>;
```

This injects key names and values. For Grace, prompt state includes data shaped like:

```json
{
  "entities": {
    "Grace": {
      "public": {
        "name": "Grace",
        "appearance": "elegant clothes, guarded posture, precise smile"
      },
      "feelings": {
        "affection": 3,
        "tension": 0
      },
      "insight": 1,
      "private": {
        "personality": "Trip's wife. An artist who feels curated into Trip's display of success and wants to stop performing happiness. Gave up too much of her art and resents being turned into evidence of his taste."
      }
    }
  }
}
```

## Authoring Rule

Before adding a field, ask:

- Can another character perceive it? Put it under `public`.
- Should only selected prompts know it? Put it under `private`.
- Is it stable prompt guidance for who the character is? Put it in `private.personality`.
- Does handler logic branch on it? Use a concrete mechanic name like `feelings.tension`, `feelings.affection`, or `insight`.
- Does it only change tone for one response? Put it in the `system` clause for that `<<chat>>`.
