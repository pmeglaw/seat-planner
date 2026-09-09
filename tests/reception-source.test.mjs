import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Reception guardrails (reception handoff, contracts #3/#9 + accessibility).
// These pin the safety properties — published-layer-only data, read-only
// surface, keyboard/listbox semantics, live extension readout — not the
// screen's styling. Colors/spacing/tokens are free to evolve.

const pageSource = () => readFile(new URL("../app/(shell)/reception/page.tsx", import.meta.url), "utf8");
const screenSource = () => readFile(new URL("../components/reception/ReceptionScreen.tsx", import.meta.url), "utf8");

// The component's RENDERED markup — everything from the top-level `return (`.
// Assertions about what the screen draws must not be satisfiable (or broken) by
// a header comment that merely names the thing: the D3-f comment explains why
// "Back to the list" was retired, and a whole-file regex would read that as the
// button still being there.
const renderedMarkup = source => source.slice(source.indexOf("  return (\n    <div className=\"sp-recep\">"));

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

// Phase 4 PR 5 (plan of record: docs/redesign-v2/phase4/plans/phase4-pr5-reception.md):
// the cursor / lock split, the URL contract, the landmarks and the platform
// hint are contracts a redesign must keep, not looks.
test("PR 5 contracts: [data-highlight] is the cursor, aria-selected the lock; no avatar; the search landmark; the skip-link field", async () => {
  const source = await screenSource();
  assert.match(source, /data-highlight=/);
  assert.doesNotMatch(source, /buildInitials/, "no avatar on Reception (PHASE3DS §1.29 owner ruling)");
  assert.match(source, /role="search"/);
  assert.match(source, /id="reception-main"/, "the skip link lands on the field (PHASE2UX §1R.7)");
  assert.match(source, /from "@\/lib\/platformShortcut"/, "the Ctrl K / ⌘ K hint is decided at hydration (P3-4)");
  assert.match(source, /aria-label="Recent lookups"/);
});

test("PR 5 URL contract: one writer (withQueryParam) through history.replaceState — never the router", async () => {
  const source = await screenSource();
  assert.match(source, /history\.replaceState\(window\.history\.state,/, "the router's history state is passed through, never null");
  assert.match(source, /from "@\/lib\/deepLink"/);
  assert.match(source, /withQueryParam\(/);
  // Import-anchored: the header comment NAMES router.replace to say why not.
  assert.doesNotMatch(source, /from "next\/navigation"|useRouter\(/);
  // The page hands the landing query down as a string only.
  const page = await pageSource();
  assert.match(page, /typeof rawQuery === "string"/);
  assert.match(page, /initialQuery=\{initialQuery\}/);
});

test("PR 5 partial state: the seats query may fail alone; the directory failing still throws to the boundary", async () => {
  const page = await pageSource();
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /employeesResult\.status === "rejected"\) throw/);
  assert.match(page, /seatsUnavailable=\{seatsUnavailable\}/);
});

test("the extension readout announces selection changes (aria-live output)", async () => {
  const source = await screenSource();
  assert.match(source, /aria-live="polite"/);
});

// Phase 5 PR 2 (owner ruling R1; sheet amendment I; DECISIONS D3-f). Below the
// 1055 fold the readout splits by job — the band pins under the search, the
// tail follows the list — so the front desk can see the number it is about to
// read aloud without scrolling past the list. The sheet does the layout; what
// the source has to hold is the split itself and the two hard constraints the
// hand-off set on it.
test("the readout is split into the band and the tail, and the BAND carries the live region", async () => {
  const source = await screenSource();
  assert.match(source, /className="sp-recep-band"/, "the band exists");
  assert.match(source, /className="sp-recep-tail"/, "the tail exists");
  assert.match(source, /aria-live="polite" className="sp-recep-band"/, "the live region IS the band");
  assert.match(source, /className="sp-recep-who"/, "the name block is a band item, so it can sit beside the numeral");
});

test("Constraint 1: ONE live region in the readout, and the extension appears in the DOM once", async () => {
  const source = await screenSource();
  const markup = renderedMarkup(source);
  const readout = markup.slice(markup.indexOf("<section"), markup.indexOf("</section>"));
  assert.equal(readout.match(/aria-live=/g)?.length, 1, "a second live region in the readout would double-announce");
  // The page carries exactly one OTHER live region and it is the list's result
  // count — shipped, and specced by PHASE2UX §1R.2 / D3-b ("the result count is
  // always published, zero included"). The hand-off's Constraint 1 is about the
  // readout: the answer is announced once, from one place.
  assert.equal(markup.match(/aria-live=/g)?.length, 2);
  assert.match(markup, /className="sp-recep-count" aria-live="polite"/);
  // One renderer for the number. A hidden duplicate for the other frame is the
  // thing the hand-off forbids: two copies drift.
  assert.equal(markup.match(/sp-readout-numeral/g)?.length, 1);
  assert.equal(markup.match(/detail\.extension \?/g)?.length, 1);
});

test("D3-f: the Back to the list ghost is retired, and the band holds nothing focusable", async () => {
  const markup = renderedMarkup(await screenSource());
  assert.doesNotMatch(markup, /sp-recep-back|Back to the list|backToList/,
    "the drill-down it belonged to is gone — the list is never left at narrow");
  // The band's markup is a heading, a role line, the tile and the seat line.
  // Nothing focusable may enter it: that is what keeps WCAG 2.4.3 focus order
  // matching visual order once the fold shows the band above the list
  // (reviewer ruling O-1, 2026-09-08 — C27 relaxed to 2.4.3).
  const band = markup.slice(markup.indexOf('className="sp-recep-band"'), markup.indexOf('className="sp-recep-tail"'));
  assert.ok(band.length > 0, "the band precedes the tail in the source");
  assert.doesNotMatch(band, /<button|<Link|<a |tabIndex/, "no focusable element inside the band");
});

test("the tail keeps PHASE2UX §1R.4's shipped order: fallbacks, then Show on map", async () => {
  const source = await screenSource();
  const tail = source.slice(source.indexOf('className="sp-recep-tail"'));
  assert.ok(tail.indexOf("sp-recep-fallback") < tail.indexOf("Show on map"),
    "the hand-off's map-first R3 was withdrawn at plan review (O-2); focusable controls are never reordered by CSS");
});

test("unseated people stay in the loop: null seat renders the voicemail line, never a hidden row", async () => {
  const source = await screenSource();
  assert.match(source, /No assigned seat — reaches voicemail if away/);
  // Multi-floor PR-2: a person on the unmapped floor is a location, not an
  // absence — the same voicemail warning, led by the floor label; and the
  // seated readout names the floor between the seat code and the zone.
  assert.match(source, /— reaches voicemail if away`/);
  assert.match(source, /Seat \$\{detail\.seatLabel\} · \$\{/);
});
