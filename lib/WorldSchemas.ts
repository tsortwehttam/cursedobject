import { z } from "zod";
import { SerialValue } from "./CoreTypings";
import { AuthoredWorld } from "./WorldTypes";

export const SerialValueSchema: z.ZodType<SerialValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(SerialValueSchema), z.record(z.string(), SerialValueSchema)]),
);

export const TraitBagSchema = z
  .object({
    public: z.record(z.string(), SerialValueSchema).default({}),
    private: z.record(z.string(), SerialValueSchema).default({}),
  })
  .default({ public: {}, private: {} });

export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const QuatSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  w: z.number(),
});

export const TransformDefSchema = z.object({
  position: Vec3Schema.nullable().default(null),
  rotation: QuatSchema.nullable().default(null),
});

export const HandlerDefSchema = z.object({
  when: z.string().nullable().default(null),
  super: z.boolean().default(false),
  action: z.string().default(""),
});

export const AnchorDefSchema = z.object({
  accepts: z.array(z.string()).default([]),
  capacity: z.number().int().positive().default(1),
  offset: Vec3Schema.nullable().default(null),
  rotation: QuatSchema.nullable().default(null),
});

export const EntityDefSchema = z.object({
  type: z.string().nullable().default(null),
  inherits: z.array(z.string()).default([]),
  traits: TraitBagSchema,
  scripts: z.record(z.string()).default({}),
  handlers: z.record(z.string(), HandlerDefSchema).default({}),
  anchors: z.record(z.string(), AnchorDefSchema).default({}),
  transform: TransformDefSchema.nullable().default(null),
  tags: z.array(z.string()).default([]),
});

export const AuthoredWorldSchema = z.record(z.string(), EntityDefSchema).superRefine((world, ctx) => {
  for (const [id, def] of Object.entries(world)) {
    validateEntityId(id, ctx);
    for (const parent of def.inherits) {
      if (!world[parent]) {
        ctx.addIssue({
          code: "custom",
          path: [id, "inherits"],
          message: `unknown inherited entity '${parent}'`,
        });
      }
    }
    for (const path of Object.keys(def.traits.public)) {
      validateTraitPath([id, "traits", "public", path], path, ctx);
    }
    for (const path of Object.keys(def.traits.private)) {
      validateTraitPath([id, "traits", "private", path], path, ctx);
    }
    for (const name of Object.keys(def.handlers)) {
      validateHandlerName([id, "handlers", name], name, ctx);
    }
  }
  for (const id of Object.keys(world)) {
    validateInheritance(id, world, ctx);
  }
});

export const EventInputSchema = z.object({
  type: z.string().min(1).refine((type) => !type.includes("."), "event types must not contain '.'"),
  actor: z.string().nullable().default(null),
  target: z.string().nullable().default(null),
  body: SerialValueSchema.default(null),
  observers: z.array(z.string()).nullable().default(null),
});

const DirSchema = z.union([z.literal("asc"), z.literal("desc")]);

export const QueryFilterSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("type"), value: z.string() }),
  z.object({ op: z.literal("tag"), value: z.string() }),
  z.object({ op: z.literal("trait_eq"), path: z.string(), value: SerialValueSchema }),
  z.object({ op: z.literal("trait_in"), path: z.string(), value: z.array(SerialValueSchema) }),
  z.object({ op: z.literal("visible_to"), observer: z.string() }),
  z.object({ op: z.literal("known_by"), holder: z.string(), path: z.string().nullable() }),
  z.object({ op: z.literal("within"), entity: z.string(), distance: z.number() }),
  z.object({ op: z.literal("handler_available"), actor: z.string(), name: z.string().nullable() }),
  z.object({ op: z.literal("attached_to"), parent: z.string(), anchor: z.string().nullable() }),
]);

export const QuerySortSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("distance_to"), entity: z.string(), dir: DirSchema }),
  z.object({ op: z.literal("trait"), path: z.string(), dir: DirSchema }),
]);

export const QuerySelectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entities") }),
  z.object({ kind: z.literal("ids") }),
  z.object({ kind: z.literal("traits"), paths: z.array(z.string()) }),
]);

export const QuerySchema = z.object({
  where: z.array(QueryFilterSchema).default([]),
  sort: z.array(QuerySortSchema).default([]),
  limit: z.number().int().positive().nullable().default(null),
  select: QuerySelectSchema.default({ kind: "entities" }),
});

function validateEntityId(id: string, ctx: z.RefinementCtx) {
  if (!id.trim()) {
    ctx.addIssue({ code: "custom", path: [id], message: "entity id must not be blank" });
  }
}

function validateTraitPath(path: (string | number)[], value: string, ctx: z.RefinementCtx) {
  if (!value.trim()) {
    ctx.addIssue({ code: "custom", path, message: "trait path must not be blank" });
  }
  if (value.includes("/")) {
    ctx.addIssue({ code: "custom", path, message: "trait path must not contain '/'" });
  }
}

function validateHandlerName(path: (string | number)[], value: string, ctx: z.RefinementCtx) {
  if (!value.trim()) {
    ctx.addIssue({ code: "custom", path, message: "handler name must not be blank" });
  }
  if (value.includes(".")) {
    ctx.addIssue({ code: "custom", path, message: "handler name must not contain '.'" });
  }
}

function validateInheritance(id: string, world: AuthoredWorld, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  const stack = new Set<string>();
  visitInheritance(id, id, world, seen, stack, ctx);
}

function visitInheritance(
  root: string,
  id: string,
  world: AuthoredWorld,
  seen: Set<string>,
  stack: Set<string>,
  ctx: z.RefinementCtx,
) {
  if (stack.has(id)) {
    ctx.addIssue({ code: "custom", path: [root, "inherits"], message: `inheritance cycle includes '${id}'` });
    return;
  }
  if (seen.has(id)) return;
  seen.add(id);
  stack.add(id);
  const def = world[id];
  if (def) {
    for (const parent of def.inherits) {
      visitInheritance(root, parent, world, seen, stack, ctx);
    }
  }
  stack.delete(id);
}
