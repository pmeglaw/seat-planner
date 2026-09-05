import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Settings affordance honesty (2026-07-16 detail critique, action 9),
// re-pointed in Phase 4 PR 4 to the Settings archetype (PHASE2UX §1S;
// DECISIONS D6-a…e; PHASE3DS §1.26–§1.28): every control leads with its verb,
// the file triggers state the accepted type and the 5 MB limit BEFORE a file
// is chosen, the standing guidance is the callout, and the honest scope names
// INFRA-02 (#277) established stay on screen. Not the styling.

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");
const readPanel = () => read("../components/admin-settings/DataUtilitiesPanel.tsx");

test("controls lead with their verb; no ASCII glyph affordance; template is a download, not a noun", async () => {
  const source = await readPanel();
  assert.doesNotMatch(source, /&gt;<\/span>/);
  assert.match(source, />Download CSV template</);
  assert.doesNotMatch(source, /Blank CSV/);
  assert.match(source, />Export CSV</);
  assert.match(source, />Export draft snapshot</);
});

test("file triggers are labelled buttons stating type and limit up front (D6-b frame invariant)", async () => {
  const panel = await readPanel();
  const trigger = await read("../components/admin-settings/FileTrigger.tsx");
  const guard = await read("../lib/fileGuard.ts");

  assert.match(panel, /label=\{`Import CSV · \$\{describeUploadLimit\("csv"\)\}`\}/);
  assert.match(panel, /label="Restore draft snapshot…"/);
  assert.match(panel, /\{describeUploadLimit\("json"\)\} — a file exported from this page\./);
  assert.match(guard, /return `\$\{EXTENSION\[kind\]\} up to 5 MB`/);
  assert.match(guard, /UPLOAD_LIMIT_BYTES = 5 \* 1024 \* 1024/);
  // The button forwards to a hidden input carrying the same name; focus stays
  // on the button (P3-16).
  assert.match(trigger, /onClick=\{\(\) => inputRef\.current\?\.click\(\)\}/);
  assert.match(trigger, /aria-label=\{label\}\s+aria-hidden="true"\s+tabIndex=\{-1\}\s+hidden/);
  // Every unhappy path is refused inline BEFORE a sheet opens.
  assert.match(panel, /const refusal = checkUpload\(file, "csv"\);\s+if \(refusal\) \{\s+setCsvError\(refusal\);\s+return;/);
  assert.match(panel, /const refusal = checkUpload\(file, "json"\);\s+if \(refusal\) \{\s+setSnapshotError\(refusal\);\s+return;/);
});

test("the standing guidance is the callout and states the publish boundary and the restore blast radius", async () => {
  const source = await readPanel();
  // Guidance read before acting: never dismissed, no status, no icon
  // (PHASE3DS §1.26). Both halves matter: nothing here reaches viewers, and a
  // restore is not a partial merge.
  assert.match(source, /<div className="sp-callout">/);
  assert.match(source, /The published map is never touched until you publish\./);
  assert.match(source, /Restores replace the entire draft — review before confirming\./);
  assert.doesNotMatch(source, /sp-callout[\s\S]{0,400}<button/);
});

test("section names stay honest — a draft working copy, not a backup (INFRA-02)", async () => {
  const source = await readPanel();
  assert.match(source, />CSV assignments</);
  assert.match(source, />Draft working-copy snapshots</);
  assert.doesNotMatch(source, /ADVANCED RECOVERY|Advanced recovery/);
  assert.doesNotMatch(source, /JSON backup/);
  assert.match(source, /not a database backup/);
  assert.match(source, /do not include the published map, publish history, or user accounts/);
});

test("each section carries exactly one primary (D6-a); exports are never disabled", async () => {
  const source = await readPanel();
  const csvSection = source.slice(source.indexOf('id="settings-csv-heading"'), source.indexOf('id="settings-snapshots-heading"'));
  const snapshotSection = source.slice(source.indexOf('id="settings-snapshots-heading"'), source.indexOf("{csvReview && ("));
  assert.equal((csvSection.match(/variant="primary"|cds-btn--primary/g) ?? []).length, 1, "CSV: Import CSV is the one primary");
  assert.equal((snapshotSection.match(/variant="primary"|cds-btn--primary/g) ?? []).length, 1, "Snapshots: Export draft snapshot is the one primary");
  assert.match(snapshotSection, /onClick=\{exportDraftSnapshot\}>Export draft snapshot</);
  assert.doesNotMatch(snapshotSection, /onClick=\{exportDraftSnapshot\} disabled/);
});
