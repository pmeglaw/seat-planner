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
  cleanup
} from "./helpers/renderComponent.mjs";

// The first tier that MOUNTS ReceptionScreen — the front-desk call-routing
// surface. It was covered only by `reception-source` (regex over the file) plus
// `reception-directory` (a lib/ behavior test for the search/recents/fallback
// helpers). Neither can see the component's own wiring: that arrows move a
// highlight the detail card follows, that Enter locks and clears, that focus
// never leaves the input, or that the recents list displays fewer entries than
// it stores.
//
// Scope note: the ranking/dedupe rules themselves live in lib/receptionDirectory
// and are tested there. These tests deliberately assert the COMPONENT's
// contracts (the ones numbered in its header comment) rather than re-testing
// the helpers through the DOM.
let ReceptionScreen;
before(async () => {
  ({ ReceptionScreen } = await loadComponent("@/components/reception/ReceptionScreen"));
});
beforeEach(() => configureContext({}));
afterEach(() => cleanup());

function makePerson(id, name, department, extension, seatLabel, zone = "North Offices", position = "Attorney", floor = seatLabel ? "3" : null) {
  return { id, name, position, department, extension, seatLabel, zone, floor };
}

// Alphabetical, matching what buildReceptionDirectory hands down — the search
// helper relies on stable input order, so a scrambled fixture would test a
// state the component never sees.
const PEOPLE = [
  makePerson("p1", "Alice Adams", "Litigation", "101", "A-01"),
  makePerson("p2", "Bob Baker", "Litigation", "102", "B-02"),
  makePerson("p3", "Carol Chen", "Corporate", "103", "C-03"),
  makePerson("p4", "Dan Diaz", "Corporate", "104", null, null, "Paralegal"),
  makePerson("p5", "Erin Ellis", "Litigation", "105", "E-05"),
  makePerson("p6", "Frank Fox", "Litigation", "106", "F-06"),
  makePerson("p7", "Gina Gray", "Corporate", null, "G-07")
];

async function renderReception(people = PEOPLE) {
  return renderElement(React.createElement(ReceptionScreen, { people }));
}

const searchInput = () => screen.getByRole("combobox", { name: "Search the directory" });
const detailCard = () => screen.getByRole("region", { name: "Caller detail" });
const optionRows = () => within(screen.getByRole("listbox", { name: "People" })).getAllByRole("option");

function type(value) {
  fireEvent.change(searchInput(), { target: { value } });
}

function press(key) {
  fireEvent.keyDown(searchInput(), { key });
}

// The detail card's <h2> is the person it is currently reading out.
function detailName() {
  return within(detailCard()).queryByRole("heading", { level: 2 })?.textContent ?? null;
}

test("at rest it lists everyone and waits for a call", async () => {
  await renderReception();
  assert.equal(optionRows().length, PEOPLE.length);
  assert.match(document.body.textContent, /7 people/);
  assert.match(detailCard().textContent, /Waiting for a call/);
  assert.equal(detailName(), null);
});

test("search filters the list and reports the match count", async () => {
  await renderReception();
  type("Bob");
  assert.equal(optionRows().length, 1);
  assert.match(optionRows()[0].textContent, /Bob Baker/);
  assert.match(document.body.textContent, /1 match(?!es)/);

  type("Litigation");
  assert.equal(optionRows().length, 4);
  assert.match(document.body.textContent, /4 matches/);
});

test("a query matching nobody says so instead of rendering an empty listbox", async () => {
  await renderReception();
  type("Nobody Here");
  assert.equal(screen.queryByRole("listbox", { name: "People" }), null);
  assert.match(document.body.textContent, /No one matches/);
});

// AUDIT-2 §8.2: before the first publish the directory is genuinely empty and
// no search is active — the old branch rendered `No one matches ""`, blaming a
// query that does not exist. First-run gets its own message with a next step.
test("an empty directory with no query explains first-run instead of No one matches \"\"", async () => {
  await renderElement(React.createElement(ReceptionScreen, { people: [] }));
  assert.ok(!screen.queryByRole("listbox", { name: "People" }));
  assert.doesNotMatch(document.body.textContent, /No one matches/);
  assert.match(document.body.textContent, /directory is empty/i);
  assert.match(document.body.textContent, /publish/i);
});

// --- Contract #2: while searching, the detail card previews the HIGHLIGHT ----

test("the detail card previews the highlighted result while searching", async () => {
  await renderReception();
  type("Litigation");
  // Alice, Bob, Erin, Frank — highlight starts at the top.
  assert.equal(detailName(), "Alice Adams");

  press("ArrowDown");
  assert.equal(detailName(), "Bob Baker");

  press("ArrowUp");
  assert.equal(detailName(), "Alice Adams");
});

test("the highlight clamps at both ends instead of wrapping", async () => {
  await renderReception();
  type("Litigation");

  press("ArrowUp");
  assert.equal(detailName(), "Alice Adams", "ArrowUp at the top must stay put");

  for (let i = 0; i < 10; i += 1) press("ArrowDown");
  assert.equal(detailName(), "Frank Fox", "ArrowDown past the end must stay on the last row");
});

test("the highlighted row is the marked option and the combobox points at it", async () => {
  await renderReception();
  type("Litigation");
  press("ArrowDown");

  const selected = optionRows().filter(row => row.getAttribute("aria-selected") === "true");
  assert.equal(selected.length, 1, "exactly one option may be marked selected");
  assert.match(selected[0].textContent, /Bob Baker/);
  // aria-activedescendant is how a screen reader follows a highlight that never
  // takes DOM focus — the whole point of keeping focus in the input.
  assert.equal(searchInput().getAttribute("aria-activedescendant"), selected[0].id);
});

test("a fresh query resets the highlight to the top", async () => {
  await renderReception();
  type("Litigation");
  press("ArrowDown");
  press("ArrowDown");
  assert.equal(detailName(), "Erin Ellis");

  type("Corporate");
  assert.equal(detailName(), "Carol Chen");
});

// --- Contract #3: Enter locks; focus never leaves the input -----------------

test("Enter locks the highlighted person and clears the query", async () => {
  await renderReception();
  type("Litigation");
  press("ArrowDown");
  press("Enter");

  assert.equal(searchInput().value, "", "locking clears the query for the next call");
  assert.equal(detailName(), "Bob Baker", "the locked person stays on screen at rest");
  assert.equal(optionRows().length, PEOPLE.length, "the list returns to the full directory");
});

test("Enter on an empty query does nothing", async () => {
  await renderReception();
  press("Enter");
  assert.equal(detailName(), null);
  assert.match(detailCard().textContent, /Waiting for a call/);
});

test("Escape clears the query and returns to the resting state", async () => {
  await renderReception();
  type("Bob");
  press("Escape");
  assert.equal(searchInput().value, "");
  assert.equal(optionRows().length, PEOPLE.length);
});

test("clicking a row locks that person", async () => {
  await renderReception();
  type("Litigation");
  const row = optionRows().find(option => option.textContent.includes("Erin Ellis"));
  fireEvent.mouseDown(row);
  fireEvent.click(row);
  assert.equal(detailName(), "Erin Ellis");
});

test("a row's mousedown default is prevented so the click never steals focus", async () => {
  await renderReception();
  type("Litigation");
  // fireEvent returns false when a handler called preventDefault. This asserts
  // the mechanism directly: jsdom does not move focus on synthetic mousedown,
  // so checking document.activeElement here would pass even with the handler
  // deleted, and would guard nothing.
  const dispatched = fireEvent.mouseDown(optionRows()[0]);
  assert.equal(dispatched, false, "keepInputFocus must preventDefault on the row");
});

test("locking returns focus to the input even if focus has left it", async () => {
  await renderReception();
  type("Litigation");
  const row = optionRows().find(option => option.textContent.includes("Erin Ellis"));

  // autoFocus already parks focus in the input at mount, so blurring first is
  // what makes this assertion mean anything: without it the check passes even
  // when lock() never refocuses.
  searchInput().blur();
  assert.notEqual(document.activeElement, searchInput(), "precondition: focus left the input");

  fireEvent.click(row);
  assert.equal(document.activeElement, searchInput(), "focus must return to search after locking");
});

// --- Contract #4: recents store 5, display at most 4, never the current one --

test("the just-locked person is not listed as a recent lookup", async () => {
  await renderReception();
  type("Bob");
  press("Enter");
  assert.equal(screen.queryByRole("region", { name: "Recent lookups" }), null);
});

test("earlier lookups become recents, most recent first", async () => {
  await renderReception();
  for (const name of ["Alice", "Bob", "Carol"]) {
    type(name);
    press("Enter");
  }

  const recents = within(screen.getByRole("region", { name: "Recent lookups" })).getAllByRole("button");
  // Each row's text is initials + name + extension, so match on the name rather
  // than scrubbing: "Bob Baker" arrives as "BBBob Baker102".
  assert.equal(recents.length, 2);
  // Carol is locked, so she is excluded; Bob was locked most recently before her.
  assert.match(recents[0].textContent, /Bob Baker/);
  assert.match(recents[1].textContent, /Alice Adams/);
});

test("the oldest lookup falls off once more than five people have been looked up", async () => {
  await renderReception();
  for (const name of ["Alice", "Bob", "Carol", "Dan", "Erin", "Frank"]) {
    type(name);
    press("Enter");
  }

  const recents = within(screen.getByRole("region", { name: "Recent lookups" })).getAllByRole("button");
  const names = recents.map(button => button.textContent);
  assert.equal(recents.length, 4);
  assert.ok(!names.some(text => text.includes("Frank Fox")), "the current selection is never a recent");
  assert.ok(!names.some(text => text.includes("Alice Adams")), "the oldest lookup falls out of the store");

  // NOTE: the visible 4 is enforced by RECENTS_STORED_MAX (5) minus the current
  // selection, NOT by RECENTS_DISPLAY_MAX. lock() pushes the same id it selects,
  // so the store always contains the selection and the filtered list is already
  // <= 4 — the display slice is defensive and cannot bind. Mutating it to 5
  // changes nothing observable, which is why nothing here claims to guard it.
});

test("re-locking someone moves them to the front of recents without duplicating", async () => {
  await renderReception();
  for (const name of ["Alice", "Bob", "Alice", "Carol"]) {
    type(name);
    press("Enter");
  }

  const recents = within(screen.getByRole("region", { name: "Recent lookups" })).getAllByRole("button");
  const names = recents.map(button => button.textContent);
  assert.equal(names.filter(text => text.includes("Alice Adams")).length, 1, "no duplicate entries");
  assert.match(names[0], /Alice Adams/, "the re-locked person is most recent");
});

test("clicking a recent lookup locks that person again", async () => {
  await renderReception();
  for (const name of ["Alice", "Bob"]) {
    type(name);
    press("Enter");
  }
  const recent = within(screen.getByRole("region", { name: "Recent lookups" })).getByRole("button");
  fireEvent.click(recent);

  assert.equal(detailName(), "Alice Adams");
  assert.equal(document.activeElement, searchInput());
});

// --- The readout and the fallback list --------------------------------------

test("the detail card reads out the extension, seat, floor and zone", async () => {
  await renderReception();
  type("Bob");
  press("Enter");
  const detail = detailCard().textContent;
  assert.match(detail, /102/);
  assert.match(detail, /Seat B-02 · Floor 3 · North Offices/);
});

test("someone with no seat and no known floor gets the voicemail warning, not a blank line", async () => {
  await renderReception();
  type("Dan");
  press("Enter");
  assert.match(detailCard().textContent, /No assigned seat — reaches voicemail if away/);
});

// Multi-floor PR-2: an unseated person on the unmapped floor is a LOCATION,
// not an absence — the readout names the floor and the list cell shows it in
// place of a seat code.
test("someone who works on the unmapped floor is read out by floor, with the voicemail warning", async () => {
  const hal = makePerson("p8", "Hal Ho", "Litigation", "108", null, null, "Attorney", "2");
  await renderReception([...PEOPLE, hal]);
  const halRow = optionRows().find(row => /Hal Ho/.test(row.textContent));
  assert.match(halRow.textContent, /Floor 2/);
  assert.doesNotMatch(halRow.textContent, /—\s*108/, "the seat cell reads the floor, not a dash");

  type("Hal");
  press("Enter");
  assert.match(detailCard().textContent, /Floor 2 · Litigation — reaches voicemail if away/);
});

test("same-department colleagues are offered as fallbacks, and one can be locked", async () => {
  await renderReception();
  type("Bob");
  press("Enter");

  const fallbackButtons = within(detailCard()).getAllByRole("button");
  const names = fallbackButtons.map(button => button.textContent);
  assert.ok(names.some(text => text.includes("Erin Ellis")), "expected a Litigation colleague");
  assert.ok(!names.some(text => text.includes("Bob Baker")), "the selected person is not their own fallback");
  assert.ok(!names.some(text => text.includes("Carol Chen")), "other departments must not appear");

  fireEvent.click(fallbackButtons.find(button => button.textContent.includes("Erin Ellis")));
  assert.equal(detailName(), "Erin Ellis");
});

test("a colleague with no extension is not offered as a fallback", async () => {
  await renderReception();
  type("Carol");
  press("Enter");
  // Gina Gray is Corporate but has no extension, so there is nothing to
  // transfer to; Dan Diaz is the only valid Corporate fallback.
  const names = within(detailCard()).getAllByRole("button").map(button => button.textContent);
  assert.ok(!names.some(text => text.includes("Gina Gray")));
  assert.ok(names.some(text => text.includes("Dan Diaz")));
});

test("a person in no department offers no fallback list", async () => {
  await renderReception([makePerson("solo", "Sol Solo", null, "999", "S-01")]);
  type("Sol");
  press("Enter");
  assert.equal(within(detailCard()).queryAllByRole("button").length, 0);
});
