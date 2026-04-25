import type { SerialValue } from "../../lib/CoreTypings";
import type { EntityData, Facsimile } from "../Engine";
import type { FacAdapter } from "./Adapter";
import type { TerminalStyle, TerminalWriter } from "./TerminalAdapter";

export type ParsedREPLInput =
  | { kind: "empty" }
  | { kind: "quit" }
  | { kind: "meta"; command: string }
  | { kind: "event"; slots: SerialValue[]; obs: string[] };

export type StoryIO = {
  ask: (prompt: string) => Promise<string>;
  write: TerminalWriter;
};

export type FacStoryAdapter = {
  ids: string[];
  params: ((io: StoryIO) => Promise<Record<string, SerialValue>>) | null;
  parseInput: ((raw: string) => ParsedREPLInput) | null;
  listActions: ((engine: Facsimile) => Promise<string[]>) | null;
  createAdapter: ((io: StoryIO) => FacAdapter) | null;
  style: TerminalStyle | null;
  intro: string | null;
};

export const EMPTY_STORY_ADAPTER: FacStoryAdapter = {
  ids: [],
  params: null,
  parseInput: null,
  listActions: null,
  createAdapter: null,
  style: null,
  intro: null,
};

export function labelFor(id: string, ent: EntityData): string {
  const pub = ent.public;
  if (pub && typeof pub === "object" && !Array.isArray(pub)) {
    const name = (pub as Record<string, SerialValue>).name;
    if (typeof name === "string") return name.toLowerCase();
  }
  return id.toLowerCase();
}
