# Facade Notes

`game/facade.fac` follows the article's architecture at Facsimile scale: social games are state counters, player dialogue is classified into discourse acts, and beat handlers choose local reactions from current tension, affinity, hot-button topic, and self-realization.

Awkward spots worth fixing in the language:

- Dynamic entity projection in strings is weak. `{{$thing.public.look}}` cannot mean "look up entity id held by `$thing`", so object descriptions need exact `lookat` handlers.
- Beat progress wants reusable prompt blocks. Current `<<chat>>` clauses are explicit and declarative, but repeated `system/on/recent/with` scaffolding is noisy.
- Story state wants list append or structured facts. Current script uses scalar counters and strings because mutations support `set`, `incr`, and `decr` only.
- Simultaneous performance direction from the article maps poorly to terminal output. The script records mood/tension and emits dialogue, but has no first-class parallel staging or gesture layer yet.
