import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillDescriptor } from "../lib/types.ts";
import type { DefinedTool } from "./clone-element/tools/_shared.ts";

/**
 * Skills mirror the Claude Code clone-website pattern. Each skill lives in
 * its own folder alongside this loader:
 *
 *   skills/<name>/
 *     SKILL.md      — frontmatter-annotated system prompt
 *     tools/index.ts — exports a `tools` array of DefinedTool
 *
 * Loaded lazily on first use and cached indefinitely. Skills are read-only at
 * runtime; to reload, restart the process.
 */

export interface LoadedSkill {
  name: string;
  description: string;
  argumentHint?: string;
  systemPrompt: string;
  tools: DefinedTool[];
}

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

const FRONTMATTER_KEYS = ["name", "description", "argument-hint"] as const;
type FrontmatterKey = (typeof FRONTMATTER_KEYS)[number];
type Frontmatter = Partial<Record<FrontmatterKey, string>>;

const cache = new Map<string, LoadedSkill>();

async function listSkillDirs(): Promise<string[]> {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readSkillMarkdown(name: string): Promise<string | null> {
  try {
    return await readFile(join(SKILLS_DIR, name, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
}

/**
 * Minimal frontmatter parser — YAML-ish, restricted to the keys we expect.
 * Avoids pulling a full YAML parser for what is effectively 3 string fields.
 */
function parseFrontmatter(raw: string): { meta: Frontmatter; body: string } {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };

  const header = raw.slice(3, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const meta: Frontmatter = {};

  for (const line of header.split("\n")) {
    const match = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    const value = match[2]!.replace(/^["']|["']$/g, "");
    if ((FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      meta[key as FrontmatterKey] = value;
    }
  }
  return { meta, body };
}

export async function listSkills(): Promise<SkillDescriptor[]> {
  const dirs = await listSkillDirs();
  const summaries: SkillDescriptor[] = [];
  for (const dir of dirs) {
    const raw = await readSkillMarkdown(dir);
    if (!raw) continue;
    const { meta } = parseFrontmatter(raw);
    summaries.push({
      name: meta.name ?? dir,
      description: meta.description ?? "",
      argumentHint: meta["argument-hint"],
    });
  }
  return summaries;
}

export async function loadSkill(name: string): Promise<LoadedSkill> {
  const cached = cache.get(name);
  if (cached) return cached;

  const raw = await readSkillMarkdown(name);
  if (!raw) {
    const known = (await listSkillDirs()).join(", ") || "(none)";
    throw new Error(`Skill "${name}" not found. Available skills: ${known}.`);
  }

  const { meta, body } = parseFrontmatter(raw);
  const toolsModule = (await import(
    join(SKILLS_DIR, name, "tools/index.ts")
  )) as { tools?: DefinedTool[] };

  const loaded: LoadedSkill = {
    name: meta.name ?? name,
    description: meta.description ?? "",
    argumentHint: meta["argument-hint"],
    systemPrompt: body.trim(),
    tools: toolsModule.tools ?? [],
  };
  cache.set(name, loaded);
  return loaded;
}
