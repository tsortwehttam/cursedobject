import readline from "node:readline/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { composeAdapters } from "../eng/adapters/Adapter";
import { createAIAdapter } from "../eng/adapters/AIAdapter";
import { createTerminalAdapter } from "../eng/adapters/TerminalAdapter";
import { EMPTY_STORY_ADAPTER, type FacStoryAdapter, type ParsedREPLInput } from "../eng/adapters/StoryAdapter";
import { Facsimile, type World } from "../eng/Engine";
import { parse } from "../eng/Parser";
import { parseShorthandEvent } from "../eng/Parsing";

type StoryModule = {
  story: FacStoryAdapter | undefined;
  default: FacStoryAdapter | undefined;
};

async function main() {
  const args = await yargs(hideBin(process.argv))
    .scriptName("facsimile-repl")
    .command("$0 <script>", "Run a Facsimile story", (cmd) =>
      cmd.positional("script", { type: "string", demandOption: true }))
    .option("ids", { type: "string", default: "" })
    .parse();
  const script = typeof args.script === "string" ? args.script : String(args._[0]);
  const ids = args.ids;
  const path = resolve(script);
  const src = readFileSync(path, "utf8");
  const program = parse(src);
  const story = await loadStoryAdapter(path);
  const extraIds = ids.split(",").map((s) => s.trim()).filter(Boolean);
  const seeded = new Set([...story.ids, ...extraIds, ...inferIds(program)]);

  const rl = readline.createInterface({ input, output });
  const io = {
    ask: async (prompt: string) => rl.question(prompt),
    write: (text: string) => output.write(text),
  };
  const world: World = {
    entities: Object.fromEntries([...seeded].map((id) => [id, {}])),
    events: [],
  };
  const params = story.params ? await story.params(io) : {};
  const adapter = composeAdapters(
    createAIAdapter(),
    createTerminalAdapter({ write: io.write, style: story.style }),
    story.createAdapter ? story.createAdapter(io) : { methods: {} },
  );
  const engine = new Facsimile(world, adapter, program, { params });

  await engine.boot();
  output.write(`\nFacsimile REPL loaded ${path}\n`);
  if (story.intro) output.write(`${story.intro}\n`);
  output.write("Commands: /state, /events, /log, /actions, /help, /quit.\n\n> ");

  for await (const raw of rl) {
    const parsed = (story.parseInput ?? parseDefaultInput)(raw);
    if (parsed.kind === "empty") {
      output.write("> ");
      continue;
    }
    if (parsed.kind === "quit") break;
    if (parsed.kind === "meta") {
      await printMeta(parsed.command, engine, story);
      output.write("> ");
      continue;
    }
    const before = engine.log.length;
    await engine.emit(engine.mkEvent(parsed.slots, parsed.obs));
    for (const e of engine.log.slice(before)) {
      if (e.kind === "event") output.write(`  ${e.msg}\n`);
    }
    output.write("> ");
  }

  rl.close();
}

async function loadStoryAdapter(path: string): Promise<FacStoryAdapter> {
  const adapterPath = resolve(dirname(path), "adapter.ts");
  if (!existsSync(adapterPath)) return EMPTY_STORY_ADAPTER;
  const mod = await import(pathToFileURL(adapterPath).href) as StoryModule;
  return mod.story ?? mod.default ?? EMPTY_STORY_ADAPTER;
}

function parseDefaultInput(raw: string): ParsedREPLInput {
  const line = raw.trim();
  if (!line) return { kind: "empty" };
  if (["quit", "exit", "/quit", "/exit"].includes(line.toLowerCase())) return { kind: "quit" };
  if (line[0] === "/") return { kind: "meta", command: line.slice(1).trim().toLowerCase() };
  return { kind: "event", slots: parseShorthandEvent(line), obs: [] };
}

async function printMeta(command: string, engine: Facsimile, story: FacStoryAdapter): Promise<void> {
  if (command === "help") {
    output.write("Events: shorthand actor verb target rest... Meta: /actions, /state, /events, /log, /quit\n");
    return;
  }
  if (command === "actions") {
    if (!story.listActions) {
      output.write("No story action lister.\n");
      return;
    }
    const lines = await story.listActions(engine);
    output.write(lines.length ? `${lines.join("\n")}\n` : "No obvious actions.\n");
    return;
  }
  if (command === "state") {
    output.write(`${JSON.stringify(engine.world.entities, null, 2)}\n`);
    return;
  }
  if (command === "events") {
    for (const e of engine.world.events.slice(-30)) output.write(`${e.slots.map(String).join(" | ")}\n`);
    return;
  }
  if (command === "log") {
    for (const e of engine.log.slice(-40)) output.write(`[${e.kind}] ${e.msg}\n`);
    return;
  }
  output.write(`Unknown command /${command}. Try /help.\n`);
}

function inferIds(program: ReturnType<typeof parse>): string[] {
  const ids = new Set<string>();
  for (const h of program) {
    const s0 = h.slots[0];
    if (s0.t === "ref" && s0.segs.length === 1 && !s0.segs[0].wild) {
      const id = s0.segs[0].v;
      if (!["game", "device", "if"].includes(id)) ids.add(id);
    }
  }
  return [...ids];
}

main();
