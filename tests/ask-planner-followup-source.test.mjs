import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Ask Planner's two chip groups look alike and mean different things.
//
// A *suggested prompt* is shown before you have asked anything, and is a
// starting point you are expected to edit — so it fills the box and stops.
// A *follow-up* is shown under a finished answer, phrased as the next
// question, and asking it is the only thing it can mean — so it submits.
//
// The split is deliberate because every ask spends a paid model call: the
// deferred one keeps an unintended click cheap, the immediate one is only
// reachable after the user has already chosen to ask once.

async function readDrawer() {
  return readFile(new URL("../components/seat-map/AskPlannerDrawer.tsx", import.meta.url), "utf8");
}

test("a follow-up chip asks its question instead of only filling the box", async () => {
  const source = await readDrawer();

  assert.match(source, /function askFollowUp\(prompt: string\)/);
  assert.match(source, /askPlanner\(prompt\)/, "the follow-up must reach the one ask path, with its own prompt");
  assert.match(source, /onClick=\{\(\) => askFollowUp\(followUp\)\}/);
});

test("a suggested prompt still fills the box and waits for an explicit ask", async () => {
  const source = await readDrawer();

  assert.match(source, /onClick=\{\(\) => choosePrompt\(promptOption\.prompt\)\}/);
  // choosePrompt stages the question; it must never spend a model call itself.
  const chooseBody = source.match(/function choosePrompt\(prompt: string\) \{[\s\S]*?\n {2}\}/)?.[0] ?? "";
  assert.ok(chooseBody, "choosePrompt should still exist");
  assert.doesNotMatch(chooseBody, /askPlanner/);
});

test("neither chip group can queue a second ask while one is in flight", async () => {
  const source = await readDrawer();

  const followUpButton = source.match(/onClick=\{\(\) => askFollowUp\(followUp\)\}[\s\S]{0,200}/)?.[0] ?? "";
  assert.match(followUpButton, /disabled=\{pending\}/, "an in-flight ask must visibly disable the follow-ups too");
});
