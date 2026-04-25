import type { SerialValue } from "../lib/CoreTypings";

export type RefSeg = { wild: boolean; v: string };

export type Slot =
  | { t: "ref"; segs: RefSeg[] }
  | { t: "str"; v: string }
  | { t: "json"; v: SerialValue }
  | { t: "regex"; v: string; flags: string }
  | { t: "num"; v: number }
  | { t: "io"; kind: string; raw: string }
  | { t: "cond"; kind: string; raw: string }
  | { t: "rest" };

export type FacNode = {
  slots: Slot[];
  cond?: string;
  body?: FacNode[];
};

export type FacProgram = FacNode[];
