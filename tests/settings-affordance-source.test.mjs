import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Settings affordance honesty (2026-07-16 detail critique, action 9): the
// same ASCII ">" implied "opens something" on rows that actually download a
// file immediately. Instant downloads and review flows now carry different
// drawn marks, and every row label leads with its verb.

test("utility rows declare their verb: download marks vs review chevrons", async () => {
  const source = await readFile(new URL("../components/admin-settings/DataUtilitiesPanel.tsx", import.meta.url), "utf8");

  // No ASCII glyph affordance anywhere.
  assert.doesNotMatch(source, /&gt;<\/span>/);
  // The three instant downloads say so.
  const downloadRows = source.match(/affordance="download"/g) ?? [];
  assert.equal(downloadRows.length, 3, "Blank/Export CSV + Export JSON are the three instant downloads");
  // Labels lead with the action — "Blank CSV" was a noun among verbs.
  assert.match(source, /label="Download CSV template"/);
  assert.doesNotMatch(source, /label="Blank CSV"/);
});
