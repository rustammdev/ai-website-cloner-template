/**
 * Unit tests for the pure helpers that carry most of the readability weight.
 *
 *   skills/loader — frontmatter parsing + real SKILL.md load
 *
 * Run with:
 *   node --experimental-strip-types scripts/test-units.mts
 */

import assert from "node:assert/strict";

// The skills loader transitively imports config.ts (via db/generations.ts used
// by save_generation). Satisfy its env invariants before importing anything
// downstream.
process.env.BETTER_AUTH_SECRET ??= "x-placeholder-for-test-suite-only";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";

const { listSkills, loadSkill } = await import("../src/skills/loader.ts");

async function testSkillListing() {
  const skills = await listSkills();
  const names = skills.map((s) => s.name);
  assert.ok(names.includes("clone-element"), "clone-element skill is discoverable");
  const cloneElement = skills.find((s) => s.name === "clone-element")!;
  assert.ok(
    cloneElement.description.length > 0,
    "skill description comes from frontmatter",
  );
  console.log("✓ listSkills exposes clone-element");
}

async function testSkillLoad() {
  const skill = await loadSkill("clone-element");
  assert.equal(skill.name, "clone-element");
  assert.ok(skill.systemPrompt.length > 100, "system prompt is non-trivial");
  assert.ok(
    !skill.systemPrompt.startsWith("---"),
    "frontmatter is stripped from the body",
  );
  const toolNames = skill.tools.map((t) => t.tool.name).sort();
  assert.deepEqual(toolNames, [
    "get_assets",
    "get_behaviors",
    "get_design_tokens",
    "get_full_styles",
    "get_responsive",
    "get_state_diff",
    "get_svgs",
    "request_child_styles",
    "request_exact_copy",
    "save_generation",
  ]);
  const saveGen = skill.tools.find((t) => t.tool.name === "save_generation");
  assert.ok(saveGen, "save_generation is registered");
  assert.equal(saveGen!.meta.requiresBridge, false);
  assert.equal(saveGen!.meta.runLimit, 1);
  const exactCopy = skill.tools.find((t) => t.tool.name === "request_exact_copy");
  assert.equal(exactCopy!.meta.requiresBridge, true);
  console.log("✓ loadSkill returns prompt + DefinedTool[] with metadata");
}

async function testLoadUnknownSkill() {
  let error: Error | null = null;
  try {
    await loadSkill("does-not-exist");
  } catch (err) {
    error = err as Error;
  }
  assert.ok(error, "unknown skill throws");
  assert.match(error!.message, /not found/);
  assert.match(error!.message, /clone-element/, "error lists available skills");
  console.log("✓ loadSkill throws a helpful error for unknown names");
}

async function main() {
  await testSkillListing();
  await testSkillLoad();
  await testLoadUnknownSkill();
  console.log("\nall unit tests passed.");
}

main().catch((err) => {
  console.error("unit test failed:", err);
  process.exit(1);
});
