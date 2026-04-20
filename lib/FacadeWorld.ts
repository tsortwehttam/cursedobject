import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import { AuthoredWorldSchema } from "./WorldSchemas";

const FacadeGameSchema = z.object({
  aliases: z.record(z.string()),
  world: AuthoredWorldSchema,
});

const path = resolve(process.cwd(), "game/facade.yaml");
const parsed = FacadeGameSchema.parse(load(readFileSync(path, "utf8")));

export const facadeAliases = parsed.aliases;
export const facadeWorld = parsed.world;
