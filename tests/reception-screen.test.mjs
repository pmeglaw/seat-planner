import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  loadComponent,
  renderElement,
  React,
  configureContext,
  fireEvent,
  screen,
  within,
  cleanup,
  flushFrames,
  setUrl
} from "./helpers/renderComponent.mjs";

// The tier that MOUNTS ReceptionScreen — the front-desk call-routing surface,
// rebuilt on the Phase 3 `.sp-recep` family in redesign-v2 Phase 4 PR 5
// (plan of record: docs/redesign-v2/phase4/plans/phase4-pr5-reception.md;
// PHASE2UX §1R; PHASE3DS §1.29; DECISIONS D3 / D3′ / D3-a…e). `reception-source`
// regexes the file for the published-layer and D3′ copy pins; the search /
// recents / fallback helpers are covered in `reception-directory`. These
// tests assert the COMPONENT's contracts:
//
//   - the combobox → listbox loop: [data-highlight] is the keyboard cursor
//     while typing (aria-activedescendant points at it), aria-selected="true"
//     is the LOCK (↵) — swapped from the pre-PR-5 mapping;
//   - the Esc ladder (owner ruling Q-1): a typed query clears first and the
//     lock stays; an empty field unlocks;
//   - `?q=` (D3-c): one writer, history.replaceState, the three landings;
//   - the readout (D3-d): "No extension on file" never a dash, the D3′ seat
//     line, Show on map only for the locked person, the ↵ / Esc hint;
//   - the states (P2-5): zero, empty directory, partial (seats failed alone);
//   - focus never leaves the field on a pointer (rows, row-buttons, recents,
//     the clear ×), Ctrl / ⌘ K refocuses it, the platform hint after mount;
//   - recents: ≤ 4 shown of 5 stored, the locked person excluded, newest
//     first, OUTSIDE the live region (O-9); no avatar anywhere (§1.29).
let ReceptionScreen;
before(async () => {
  ({ ReceptionScreen } = await loadComponent("@/components/reception/ReceptionScreen"));
});
beforeEach(() => {
  configureContext({});
  setUrl("/reception");
});
afterEach(() => cleanup());

function makePerson(id, name, department, extension, seatLabel, zone = "North Offices", position = "Attorney", floor = seatLabel ? "3" : null) {
  return { id, name, position, department, extension, seatLabel, zone, floor };
}

// Alphabetical, matching what buildReceptionDirectory hands down — the search
// helper relies on stable input order.
const PEOPLE = [
  makePerson("p1", "Alice Adams", "Litigation", "101", "A-01"),
  makePerson("p2", "Bob Baker", "Litigation", "102", "B-02"),
  makePerson("p3", "Carol Chen", "Corporate", "103", "C-03"),
  makePerson("p4", "Dan Diaz", "Corporate", "104", null, null, "Paralegal"),
  makePerson("p5", "Erin Ellis", "Litigation", "105", "E-05"),
  makePerson("p6", "Frank Fox", "Litigation", "106", "F-06"),
  makePerson("p7", "Gina Gray", "Corporate", null, "G-07")
];

async function renderReception(props = {}) {
  return renderElement(React.createElement(ReceptionScreen, { people: PEOPLE, ...props }));
}

const searchInput = () => screen.getByRole("combobox", { name: "Search the directory" });
const readout = () => screen.getByRole("region", { name: "Caller detail" });
const listbox = () => screen.getByRole("listbox", { name: "People" });
const optionRows = () => within(listbox()).queryAllByRole("option");
const highlighted = () => document.querySelectorAll("[data-highlight]");
const lockedRows = () => optionRows().filter(row => row.getAttribute("aria-selected") === "true");
const count = () => document.querySelector(".sp-recep-count").textContent;
const hint = () => document.querySelector(".sp-readout-hint")?.textContent ?? null;
const mapLink = () => screen.queryByRole("link", { name: "Show on map" });
const recentsRegion = () => screen.queryByRole("complementary", { name: "Recent lookups" });

function type(value) {
  fireEvent.change(searchInput(), { target: { value } });
}
function press(key) {
  fireEvent.keyDown(searchInput(), { key });
}
function readoutName() {
  return within(readout()).queryByRole("heading", { level: 2 })?.textContent ?? null;
}
function lockByTyping(name) {
  type(name);
  press("Enter");
}

// ---------------------------------------------------------------- at rest

test("at rest: everyone listed, '7 people', the waiting copy, no cursor, no lock, no avatar", async () => {
  await renderReception();
  assert.equal(optionRows().length, PEOPLE.length);
  assert.equal(count(), "7 people");
  assert.match(readout().textContent, /Waiting for a call\./);
  assert.match(readout().textContent, /Start typing what the caller gives you — a name, department, seat, or extension\./);
  assert.equal(readoutName(), null);
  assert.equal(highlighted().length, 0);
  assert.equal(lockedRows().length, 0);
  assert.equal(mapLink(), null);
  // No avatar anywhere (PHASE3DS §1.29 owner ruling): no image, no initials
  // disc — a row's text starts with the person's name.
  assert.equal(document.querySelector("img"), null);
  assert.ok(optionRows()[0].textContent.startsWith("Alice Adams"), optionRows()[0].textContent);
  // The search is its own landmark; the skip link lands on the field.
  assert.equal(searchInput().closest('[role="search"]') !== null, true);
  assert.equal(searchInput().id, "reception-main");
  assert.equal(searchInput().getAttribute("type"), "search");
  // The listbox is reached through the combobox, never a tab stop (O-3).
  assert.equal(listbox().hasAttribute("tabindex"), false);
  assert.ok(optionRows().every(row => !row.hasAttribute("tabindex")));
  // The clear × exists only once typed.
  assert.equal(screen.queryByRole("button", { name: "Clear search" }), null);
});

test("row cells: the seat code as plain text, the Floor tag only where the floor differs, '—' via the empty cell", async () => {
  const hal = makePerson("p8", "Hal Ho", "Litigation", "108", null, null, "Attorney", "2");
  await renderElement(React.createElement(ReceptionScreen, { people: [...PEOPLE, hal] }));
  const row = name => optionRows().find(option => option.textContent.includes(name));
  assert.equal(row("Alice Adams").querySelector(".sp-recep-seat").textContent, "A-01");
  assert.equal(row("Alice Adams").querySelector(".cds-tag"), null);
  // Unseated on the unmapped floor: a location, not an absence (D3′).
  assert.equal(row("Hal Ho").querySelector(".cds-tag").textContent, "Floor 2");
  assert.equal(row("Hal Ho").querySelector(".sp-recep-seat"), null);
  // Unseated, no floor yet: the empty seat cell (the sheet draws the dash).
  assert.equal(row("Dan Diaz").querySelector(".sp-recep-seat").textContent, "");
  assert.equal(row("Dan Diaz").querySelector(".cds-tag"), null);
  // The extension cell: the number, or empty for the sheet's dash.
  assert.equal(row("Bob Baker").querySelector(".sp-recep-ext").textContent, "102");
  assert.equal(row("Gina Gray").querySelector(".sp-recep-ext").textContent, "");
  // Meta line, with a title for the sheet's truncation.
  assert.equal(row("Dan Diaz").querySelector(".sp-recep-meta").textContent, "Paralegal · Corporate");
  assert.equal(row("Dan Diaz").querySelector(".sp-recep-name").getAttribute("title"), "Dan Diaz");
});

// ---------------------------------------------------------------- the count

test("the count: '1 match' / 'N matches' / '0 matches' while typing, '0 people' on an empty directory", async () => {
  await renderReception();
  type("Bob");
  assert.equal(count(), "1 match");
  type("Litigation");
  assert.equal(count(), "4 matches");
  type("zzzz");
  assert.equal(count(), "0 matches");
  cleanup();
  await renderElement(React.createElement(ReceptionScreen, { people: [] }));
  assert.equal(count(), "0 people");
});

// ---------------------------------------------------------------- the cursor

test("typing puts the cursor on the first result; exactly one [data-highlight]; aria-activedescendant follows it", async () => {
  await renderReception();
  type("Litigation");
  assert.equal(highlighted().length, 1);
  assert.match(highlighted()[0].textContent, /Alice Adams/);
  assert.equal(searchInput().getAttribute("aria-activedescendant"), highlighted()[0].id);
  assert.equal(lockedRows().length, 0, "the cursor is not the lock");
  assert.equal(readoutName(), "Alice Adams", "the readout previews the cursor");

  press("ArrowDown");
  assert.equal(highlighted().length, 1);
  assert.match(highlighted()[0].textContent, /Bob Baker/);
  assert.equal(searchInput().getAttribute("aria-activedescendant"), highlighted()[0].id);
  assert.equal(readoutName(), "Bob Baker");

  press("ArrowUp");
  assert.equal(readoutName(), "Alice Adams");
});

test("the cursor clamps at both ends instead of wrapping", async () => {
  await renderReception();
  type("Litigation");
  press("ArrowUp");
  assert.equal(readoutName(), "Alice Adams");
  for (let i = 0; i < 10; i += 1) press("ArrowDown");
  assert.equal(readoutName(), "Frank Fox");
});

test("a fresh query resets the cursor to the top", async () => {
  await renderReception();
  type("Litigation");
  press("ArrowDown");
  press("ArrowDown");
  assert.equal(readoutName(), "Erin Ellis");
  type("Corporate");
  assert.equal(readoutName(), "Carol Chen");
});

test("while previewing: the ↵ hint, and no Show on map", async () => {
  await renderReception();
  type("Bob");
  assert.match(hint(), /↵/);
  assert.match(hint(), /to lock/);
  assert.equal(mapLink(), null, "Show on map is for the locked person only");
});

test("the tile hint states the current key: ↵ while previewing, none while a typed query matches nobody, Esc when locked at rest", async () => {
  await renderReception();
  type("Bob");
  assert.match(hint(), /↵/);
  press("Enter");
  assert.match(hint(), /Esc/);
  assert.match(hint(), /to unlock/);
  // Zero matches with a lock: the readout keeps the person, but Esc would CLEAR
  // the query first (Q-1's first rung) — so no hint promises an unlock.
  type("zzzz");
  assert.equal(readoutName(), "Bob Baker");
  assert.equal(hint(), null);
  press("Escape");
  assert.match(hint(), /Esc/);
  // A preview over a lock reads ↵ again.
  type("Car");
  assert.match(hint(), /↵/);
});

// ---------------------------------------------------------------- the lock

test("↵ locks the cursor's person: aria-selected on that row only, the query cleared, ?q=<name>, the Esc hint, Show on map", async () => {
  await renderReception();
  type("Litigation");
  press("ArrowDown");
  press("Enter");

  assert.equal(searchInput().value, "");
  assert.equal(readoutName(), "Bob Baker");
  assert.equal(optionRows().length, PEOPLE.length, "the list returns to the full directory");
  assert.equal(lockedRows().length, 1);
  assert.match(lockedRows()[0].textContent, /Bob Baker/);
  assert.equal(highlighted().length, 0, "no cursor at rest");
  assert.equal(searchInput().getAttribute("aria-activedescendant"), null);
  assert.equal(window.location.pathname + window.location.search, "/reception?q=Bob+Baker");
  assert.match(hint(), /Esc/);
  assert.match(hint(), /to unlock/);
  assert.equal(mapLink().getAttribute("href"), "/?q=Bob+Baker");
  assert.equal(document.activeElement, searchInput());
});

test("↵ on an empty query does nothing", async () => {
  await renderReception();
  press("Enter");
  assert.equal(readoutName(), null);
  assert.equal(lockedRows().length, 0);
  assert.equal(window.location.search, "");
});

test("↵ with zero matches does nothing", async () => {
  await renderReception();
  type("zzzz");
  press("Enter");
  assert.equal(searchInput().value, "zzzz");
  assert.equal(lockedRows().length, 0);
});

// ---------------------------------------------------------------- Esc (Q-1)

test("Esc, first rung: a typed query clears and the lock stays (the readout keeps the person, ?q= too)", async () => {
  await renderReception();
  lockByTyping("Bob");
  type("Car");
  assert.equal(readoutName(), "Carol Chen", "precondition: previewing");
  press("Escape");
  assert.equal(searchInput().value, "");
  assert.equal(readoutName(), "Bob Baker");
  assert.equal(lockedRows().length, 1);
  assert.equal(window.location.search, "?q=Bob+Baker");
});

test("Esc, second rung: an empty field unlocks — the readout waits, ?q= is removed", async () => {
  await renderReception();
  lockByTyping("Bob");
  press("Escape");
  assert.equal(readoutName(), null);
  assert.match(readout().textContent, /Waiting for a call\./);
  assert.equal(lockedRows().length, 0);
  assert.equal(window.location.pathname + window.location.search, "/reception");
  assert.equal(mapLink(), null);
});

test("Esc on an empty field with nothing locked is a no-op", async () => {
  await renderReception();
  press("Escape");
  assert.equal(searchInput().value, "");
  assert.equal(window.location.search, "");
});

// ---------------------------------------------------------------- the clear ×

test("the clear × appears once typed, clears the query only (the lock and ?q= stay), keeps focus in the field", async () => {
  await renderReception();
  lockByTyping("Bob");
  type("Car");
  const clear = screen.getByRole("button", { name: "Clear search" });
  // fireEvent returns false when a handler called preventDefault: jsdom does
  // not move focus on a synthetic mousedown, so the mechanism is asserted.
  assert.equal(fireEvent.mouseDown(clear), false, "the × must never steal focus from the field");
  fireEvent.click(clear);
  assert.equal(searchInput().value, "");
  assert.equal(document.activeElement, searchInput());
  assert.equal(readoutName(), "Bob Baker");
  assert.equal(window.location.search, "?q=Bob+Baker");
  assert.equal(screen.queryByRole("button", { name: "Clear search" }), null);
});

// ---------------------------------------------------------------- zero / empty

test("zero matches: the empty state in the list body with a ghost Clear search; the readout keeps the last locked person", async () => {
  await renderReception();
  lockByTyping("Bob");
  type("zzzz");
  assert.equal(optionRows().length, 0);
  assert.ok(listbox(), "the listbox stays mounted (aria-controls must resolve)");
  const empty = document.querySelector(".sp-recep-list .cds-empty");
  assert.match(empty.querySelector("h3").textContent, /No one matches “zzzz”/);
  assert.match(empty.querySelector("p").textContent, /Try a name, department, seat code or extension\./);
  assert.equal(readoutName(), "Bob Baker");
  assert.equal(highlighted().length, 0);
  const clear = within(empty).getByRole("button", { name: "Clear search" });
  assert.equal(fireEvent.mouseDown(clear), false);
  fireEvent.click(clear);
  assert.equal(searchInput().value, "");
  assert.equal(document.activeElement, searchInput());
  assert.equal(optionRows().length, PEOPLE.length);
});

test("an empty directory: its own copy, '0 people', the search stays, the readout waits", async () => {
  await renderElement(React.createElement(ReceptionScreen, { people: [] }));
  const empty = document.querySelector(".sp-recep-list .cds-empty");
  assert.match(empty.querySelector("h3").textContent, /The directory is empty/);
  assert.match(empty.querySelector("p").textContent, /It fills in when an admin publishes the seat map\./);
  assert.doesNotMatch(document.body.textContent, /No one matches/);
  assert.equal(count(), "0 people");
  assert.ok(searchInput());
  assert.match(readout().textContent, /Waiting for a call\./);
});

// ---------------------------------------------------------------- pointer

test("clicking a row locks that person; the row's mousedown is prevented so focus never leaves the field", async () => {
  await renderReception();
  type("Litigation");
  const row = optionRows().find(option => option.textContent.includes("Erin Ellis"));
  assert.equal(fireEvent.mouseDown(row), false, "keepInputFocus must preventDefault on the row");
  searchInput().blur();
  assert.notEqual(document.activeElement, searchInput(), "precondition: focus left the input");
  fireEvent.click(row);
  assert.equal(readoutName(), "Erin Ellis");
  assert.equal(lockedRows().length, 1);
  assert.equal(document.activeElement, searchInput(), "lock() returns focus to the field");
});

// ---------------------------------------------------------------- Ctrl / ⌘ K + the hint

test("Ctrl / ⌘ K from anywhere on the page refocuses the field", async () => {
  await renderReception();
  lockByTyping("Bob");
  const fallbackButton = within(readout()).getAllByRole("button").find(button => /Erin Ellis/.test(button.textContent));
  fallbackButton.focus();
  assert.equal(document.activeElement, fallbackButton, "precondition");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  assert.equal(document.activeElement, searchInput());
  fallbackButton.focus();
  fireEvent.keyDown(window, { key: "K", metaKey: true });
  assert.equal(document.activeElement, searchInput());
  // Shift / Alt variants are someone else's shortcut.
  fallbackButton.focus();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });
  assert.equal(document.activeElement, fallbackButton);
});

test("the platform hint is decided after mount: Ctrl K on Windows, ⌘ K on a Mac", async () => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, "platform");
  try {
    Object.defineProperty(window.navigator, "platform", { value: "Win32", configurable: true });
    await renderReception();
    await flushFrames();
    assert.equal(document.querySelector(".sp-search-trailing .sp-kbd").textContent, "Ctrl K");
    cleanup();
    Object.defineProperty(window.navigator, "platform", { value: "MacIntel", configurable: true });
    await renderReception();
    assert.equal(document.querySelector(".sp-search-trailing .sp-kbd").textContent, "Ctrl K", "the server markup never guesses the platform");
    await flushFrames();
    assert.equal(document.querySelector(".sp-search-trailing .sp-kbd").textContent, "⌘ K");
    assert.equal(document.querySelector(".sp-search-trailing .sp-kbd").getAttribute("aria-hidden"), "true");
  } finally {
    if (original) Object.defineProperty(window.navigator, "platform", original);
    else delete window.navigator.platform;
  }
});

// ---------------------------------------------------------------- the readout

test("the readout reads the extension in the tile and the D3′ seat line", async () => {
  await renderReception();
  lockByTyping("Bob");
  const tile = readout().querySelector(".sp-readout");
  assert.equal(tile.querySelector(".sp-readout-eyebrow").textContent, "Extension");
  assert.equal(tile.querySelector(".sp-readout-numeral").textContent, "102");
  assert.match(readout().querySelector(".sp-recep-seatline").textContent, /Seat B-02 · Floor 3 · North Offices/);
  assert.equal(readout().querySelector(".sp-recep-role").textContent, "Attorney · Litigation");
});

test("no extension on file: the sentence in the tile, never a dash; the fallback list is the next step", async () => {
  await renderReception();
  lockByTyping("Gina");
  const tile = readout().querySelector(".sp-readout");
  assert.equal(tile.querySelector(".sp-readout-numeral"), null);
  assert.equal(tile.querySelector(".sp-readout-none").textContent, "No extension on file");
  assert.doesNotMatch(tile.textContent, /—/);
  const names = within(readout()).getAllByRole("button").map(button => button.textContent);
  assert.ok(names.some(text => text.includes("Dan Diaz")), "the Corporate colleague with an extension");
});

test("someone with no seat and no known floor gets the voicemail warning, not a blank line", async () => {
  await renderReception();
  lockByTyping("Dan");
  assert.match(readout().textContent, /No assigned seat — reaches voicemail if away/);
});

test("someone who works on the unmapped floor is read out by floor, with the voicemail warning", async () => {
  const hal = makePerson("p8", "Hal Ho", "Litigation", "108", null, null, "Attorney", "2");
  await renderElement(React.createElement(ReceptionScreen, { people: [...PEOPLE, hal] }));
  lockByTyping("Hal");
  assert.match(readout().textContent, /Floor 2 · Litigation — reaches voicemail if away/);
});

test("partial (the seats query failed alone): every seat cell empty, no Floor tag, the seat-unknown line, one warning notification", async () => {
  const hal = makePerson("p8", "Hal Ho", "Litigation", "108", null, null, "Attorney", "2");
  await renderElement(React.createElement(ReceptionScreen, { people: [...PEOPLE, hal], seatsUnavailable: true }));
  assert.ok(optionRows().every(row => row.querySelector(".sp-recep-seat")?.textContent === ""), "every seat cell reads the dash");
  assert.equal(document.querySelector(".cds-tag"), null);
  const notice = screen.getByRole("status");
  assert.ok(notice.classList.contains("cds-notification--warning"));
  assert.match(notice.textContent, /Seat locations didn't load/);
  assert.match(notice.textContent, /Extensions are up to date\. Seat and floor details will show after a reload\./);
  lockByTyping("Bob");
  assert.equal(readout().querySelector(".sp-readout-numeral").textContent, "102", "the extension still reads");
  assert.match(readout().querySelector(".sp-recep-partial").textContent, /Seat unknown right now — the map is still loading\./);
  assert.doesNotMatch(readout().textContent, /voicemail/);
  assert.doesNotMatch(readout().textContent, /Seat B-02/);
});

test("the partial notification is absent when the seats loaded", async () => {
  await renderReception();
  assert.equal(document.querySelector(".cds-notification"), null);
});

// ---------------------------------------------------------------- the fallback

test("same-department colleagues with an extension are offered (≤ 3), their mousedown prevented, and one can be locked", async () => {
  await renderReception();
  lockByTyping("Bob");
  const fallback = readout().querySelector(".sp-recep-fallback");
  assert.match(fallback.querySelector("h3").textContent, /If no answer — same department/);
  const buttons = within(fallback).getAllByRole("button");
  const names = buttons.map(button => button.textContent);
  assert.ok(buttons.length <= 3);
  assert.ok(names.some(text => text.includes("Erin Ellis")));
  assert.ok(!names.some(text => text.includes("Bob Baker")), "not their own fallback");
  assert.ok(!names.some(text => text.includes("Carol Chen")), "other departments must not appear");
  const erin = buttons.find(button => button.textContent.includes("Erin Ellis"));
  assert.equal(erin.querySelector(".sp-row-button-ext").textContent, "105");
  assert.equal(fireEvent.mouseDown(erin), false);
  fireEvent.click(erin);
  assert.equal(readoutName(), "Erin Ellis");
  assert.equal(window.location.search, "?q=Erin+Ellis");
});

test("a colleague with no extension is not offered; a person in no department offers no fallback list", async () => {
  await renderReception();
  lockByTyping("Carol");
  const names = within(readout()).getAllByRole("button").map(button => button.textContent);
  assert.ok(!names.some(text => text.includes("Gina Gray")));
  assert.ok(names.some(text => text.includes("Dan Diaz")));
  cleanup();
  await renderElement(React.createElement(ReceptionScreen, { people: [makePerson("solo", "Sol Solo", null, "999", "S-01")] }));
  lockByTyping("Sol");
  assert.equal(readout().querySelector(".sp-recep-fallback"), null);
});

// ---------------------------------------------------------------- recents (O-9)

test("recent lookups: hidden while empty, the just-locked person excluded, newest first, its own landmark outside the live region", async () => {
  await renderReception();
  assert.equal(recentsRegion(), null);
  lockByTyping("Bob");
  assert.equal(recentsRegion(), null, "the current person is never a recent");
  for (const name of ["Alice", "Carol"]) lockByTyping(name);
  const region = recentsRegion();
  assert.ok(region);
  assert.equal(region.closest("[aria-live]"), null, "recents must not be announced on every lock");
  assert.ok(readout().querySelector("[aria-live]"), "the readout block itself is the live region");
  const recents = within(region).getAllByRole("button");
  assert.equal(recents.length, 2);
  assert.match(recents[0].textContent, /Alice Adams/);
  assert.match(recents[1].textContent, /Bob Baker/);
  assert.equal(recents[1].querySelector(".sp-recep-ext").textContent, "102");
});

test("recents show at most four, drop the oldest past five stored, and never duplicate", async () => {
  await renderReception();
  for (const name of ["Alice", "Bob", "Carol", "Dan", "Erin", "Frank"]) lockByTyping(name);
  let names = within(recentsRegion()).getAllByRole("button").map(button => button.textContent);
  assert.equal(names.length, 4);
  assert.ok(!names.some(text => text.includes("Frank Fox")));
  assert.ok(!names.some(text => text.includes("Alice Adams")));
  for (const name of ["Alice", "Bob", "Alice", "Carol"]) lockByTyping(name);
  names = within(recentsRegion()).getAllByRole("button").map(button => button.textContent);
  assert.equal(names.filter(text => text.includes("Alice Adams")).length, 1, "no duplicate entries");
  assert.match(names[0], /Alice Adams/, "the re-locked person is most recent");
});

test("a recent lookup re-locks that person; its mousedown is prevented", async () => {
  await renderReception();
  for (const name of ["Alice", "Bob"]) lockByTyping(name);
  const recent = within(recentsRegion()).getByRole("button");
  assert.equal(fireEvent.mouseDown(recent), false);
  fireEvent.click(recent);
  assert.equal(readoutName(), "Alice Adams");
  assert.equal(document.activeElement, searchInput());
  assert.equal(window.location.search, "?q=Alice+Adams");
});

// ---------------------------------------------------------------- Back to the list (the narrow fold)

test("Back to the list sits first in the readout and focuses the field", async () => {
  await renderReception();
  lockByTyping("Bob");
  const back = within(readout()).getByRole("button", { name: "Back to the list" });
  assert.ok(back.classList.contains("sp-recep-back"));
  assert.equal(readout().firstElementChild, back);
  searchInput().blur();
  fireEvent.click(back);
  assert.equal(document.activeElement, searchInput());
});

// ---------------------------------------------------------------- ?q= landing (D3-c)

test("landing on ?q= with a unique match locks the readout and rewrites ?q=<name>", async () => {
  setUrl("/reception?q=102");
  await renderReception({ initialQuery: "102" });
  assert.equal(readoutName(), "Bob Baker");
  assert.equal(lockedRows().length, 1);
  assert.equal(searchInput().value, "");
  assert.equal(window.location.search, "?q=Bob+Baker");
});

test("landing on ?q= with several matches keeps the query and puts the cursor on the first row", async () => {
  setUrl("/reception?q=Litigation");
  await renderReception({ initialQuery: "Litigation" });
  assert.equal(searchInput().value, "Litigation");
  assert.equal(count(), "4 matches");
  assert.equal(highlighted().length, 1);
  assert.match(highlighted()[0].textContent, /Alice Adams/);
  assert.equal(lockedRows().length, 0);
  assert.equal(window.location.search, "?q=Litigation");
});

test("landing on ?q= with no match shows the zero state with the query kept", async () => {
  setUrl("/reception?q=zzzz");
  await renderReception({ initialQuery: "zzzz" });
  assert.equal(searchInput().value, "zzzz");
  assert.equal(count(), "0 matches");
  assert.match(document.querySelector(".sp-recep-list .cds-empty h3").textContent, /No one matches “zzzz”/);
  assert.equal(window.location.search, "?q=zzzz");
});
