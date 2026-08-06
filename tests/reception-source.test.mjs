import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Reception guardrails (reception handoff, contracts #3/#9 + accessibility).
// These pin the safety properties — published-layer-only data, read-only
// surface, keyboard/listbox semantics, live extension readout — not the
// screen's styling. Colors/spacing/tokens are free to evolve.

const pageSource = () => readFile(new URL("../app/(shell)/reception/page.tsx", import.meta.url), "utf8");
const screenSource = () => readFile(new URL("../components/reception/ReceptionScreen.tsx", import.meta.url), "utf8");

test("the reception page reads ONLY the published layer — snapshot employees + published seats", async () => {
  const source = await pageSource();
  // Employees come from the publish-time snapshot, never the admins' live
  // working set.
  assert.match(source, /\.from\("published_employees"\)/);
  assert.doesNotMatch(source, /\.from\("employees"\)/);
  // Seats are the published copy only.
  assert.match(source, /\.eq\("layer", "published"\)/);
  assert.doesNotMatch(source, /\.eq\("layer", "draft"\)/);
  // Paged reads (PostgREST truncates bare selects silently at the row cap).
  assert.match(source, /fetchAllRows/);
});

test("the reception surface is read-only: no server actions, no draft RPCs", async () => {
  const page = await pageSource();
  const screen = await screenSource();
  for (const source of [page, screen]) {
    assert.doesNotMatch(source, /from "@\/app\/actions"/);
    assert.doesNotMatch(source, /\.rpc\(/);
    assert.doesNotMatch(source, /publish_seat_map|update_draft_seat|restore_draft_snapshot/);
  }
});

test("the reception page is session-gated for both roles, not admin-gated", async () => {
  const source = await pageSource();
  assert.match(source, /redirect\("\/login\?next=\/reception"\)/);
  // Deliberately NOT the admin-only prologue: viewers are first-class here.
  // (Import-anchored: the page comment may still NAME the guard to explain
  // why it is absent.)
  assert.doesNotMatch(source, /import .*getAdminPageContext/);
});

test("keyboard loop: autofocused combobox drives an aria-activedescendant listbox", async () => {
  const source = await screenSource();
  assert.match(source, /autoFocus/);
  assert.match(source, /role="combobox"/);
  assert.match(source, /aria-activedescendant=/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /role="option"/);
  assert.match(source, /aria-selected=/);
  // Arrow keys clamp (no wrap) and Escape clears — the handlers must exist.
  assert.match(source, /"ArrowDown"/);
  assert.match(source, /"ArrowUp"/);
  assert.match(source, /"Escape"/);
});

test("the extension readout announces selection changes (aria-live output)", async () => {
  const source = await screenSource();
  assert.match(source, /aria-live="polite"/);
});

test("unseated people stay in the loop: null seat renders the voicemail line, never a hidden row", async () => {
  const source = await screenSource();
  assert.match(source, /No assigned seat — reaches voicemail if away/);
});
