import test, { before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, configureContext, fireEvent, act, cleanup, screen, within, flushFrames, waitFor } from "./helpers/renderComponent.mjs";

// ShellPanels — the three dark right panels (Help · History · Account) of
// the Phase 3 shell, exercised standalone (AppShell mounts them; its suite
// covers open/close wiring and focus return). These pin the landmark +
// heading-focus contract, the History panel's fetch states, the viewer's
// read-only History, the Theme radio's single writer (applyTheme), and the
// native sign-out form.

let ShellPanels;
let themeCalls;
before(async () => {
  ({ ShellPanels } = await loadComponent("@/components/ui/ShellPanels", {
    extraMocks: {
      "@/lib/theme": `
        export const THEME_DARK = "dark";
        export const THEME_LIGHT = "light";
        export const applyTheme = choice => globalThis.__ct.theme.push(choice);
      `
    }
  }));
});

beforeEach(() => {
  themeCalls = [];
  configureContext({ pathname: "/admin" });
  globalThis.__ct.theme = themeCalls;
  delete document.documentElement.dataset.theme;
});
afterEach(() => cleanup());

const PUBLISHED = { kind: "published", publishedAt: "2026-09-02T21:12:00Z" };
const DRAFT = { kind: "draft", publishedAt: "2026-09-02T21:12:00Z", changeCount: 4, lastEditAt: null };

function panels(overrides = {}) {
  return React.createElement(ShellPanels, {
    open: null,
    onClose: () => {},
    email: "jane@example.com",
    roleLabel: "Admin",
    isAdmin: true,
    pathname: "/admin",
    modeStatus: DRAFT,
    mySeat: { label: "L02", floor: "3" },
    onSwitchMode: () => {},
    onRetryStatus: () => {},
    ...overrides
  });
}

const host = () => document.getElementById("shell-panels");

test("closed: the host is mounted, carries no data-open, and holds no panel", async () => {
  await renderElement(panels());
  assert.ok(host());
  assert.equal(host().getAttribute("data-open"), null, "the landed CSS keys on attribute presence — never data-open=false");
  assert.equal(host().querySelector("aside"), null);
});

test("Account: complementary landmark named by its heading, focus lands on the heading, data-open arrives a frame later", async () => {
  await renderElement(panels({ open: "account" }));
  const panel = screen.getByRole("complementary", { name: "Account" });
  assert.equal(panel.id, "shell-panel-account");
  const heading = within(panel).getByRole("heading", { level: 2, name: "Account" });
  assert.equal(document.activeElement, heading, "focus moves to the panel heading on open");
  await flushFrames();
  assert.equal(host().getAttribute("data-open"), "true");
});

test("Account: email, role tag, My seat row, and a native POST sign-out form that goes busy on submit", async () => {
  await renderElement(panels({ open: "account" }));
  const panel = screen.getByRole("complementary", { name: "Account" });
  assert.ok(within(panel).getByText(/jane@example.com/));
  assert.ok(within(panel).getByText("Admin", { selector: ".cds-tag" }));
  const seat = within(panel).getByRole("link", { name: /My seat — L02 · Floor 3/ });
  assert.equal(seat.getAttribute("href"), "/my-seat");
  const signOut = within(panel).getByRole("button", { name: "Sign out" });
  assert.equal(signOut.getAttribute("type"), "submit");
  const form = signOut.closest("form");
  assert.equal(form?.getAttribute("action"), "/auth/signout");
  assert.equal(form?.getAttribute("method"), "post");
  await act(async () => fireEvent.submit(form));
  assert.equal(within(panel).getByRole("button", { name: "Signing out…" }).getAttribute("aria-busy"), "true");
});

test("Account: an unseated person reads a static row, not a disabled control", async () => {
  await renderElement(panels({ open: "account", mySeat: null, roleLabel: "Viewer", isAdmin: false }));
  const panel = screen.getByRole("complementary", { name: "Account" });
  assert.equal(within(panel).queryByRole("link", { name: /My seat/ }), null);
  assert.ok(within(panel).getByText("No seat published for you yet"));
  assert.ok(within(panel).getByText("Viewer", { selector: ".cds-tag" }));
});

test("Account: the Theme radio reflects the html attribute after hydration and writes ONLY through applyTheme", async () => {
  document.documentElement.dataset.theme = "dark";
  await renderElement(panels({ open: "account" }));
  const group = screen.getByRole("group", { name: "Theme" });
  const dark = within(group).getByRole("radio", { name: "Dark" });
  const light = within(group).getByRole("radio", { name: "Light" });
  const system = within(group).getByRole("radio", { name: "System" });
  assert.equal(dark.checked, true, "stored dark → Dark checked after hydration");
  assert.ok(group.querySelector("span.sp-radio-mark"), "the mark must be a span (zone rule specificity, PHASE3DS §7)");

  await act(async () => fireEvent.click(light));
  await act(async () => fireEvent.click(system));
  assert.deepEqual(themeCalls, ["light", null], "Light → applyTheme('light'); System → applyTheme(null)");
  assert.equal(system.checked, true);
});

test("History (admin): switch reflects the route, status line renders, events load and render as rows", async () => {
  configureContext({
    pathname: "/admin",
    actions: {
      getPublishHistoryAction: async () => [
        { created_at: "2026-09-02T21:12:00Z", seat_count: 68, published_by: "u1", published_by_email: "patrick@example.com", change_summary: { assignments_changed: 3, employee_edits: 2 } },
        { created_at: "2026-08-29T16:40:00Z", seat_count: 68, published_by: "u1", published_by_email: null, change_summary: { seats_moved: 1 } },
        { created_at: "2026-07-20T15:30:00Z", seat_count: 68, published_by: null, published_by_email: null, change_summary: null }
      ]
    }
  });
  await renderElement(panels({ open: "history" }));
  const panel = screen.getByRole("complementary", { name: "History" });
  const modeSwitch = within(panel).getByRole("group", { name: "Mode" });
  assert.equal(within(modeSwitch).getByRole("button", { name: "Draft" }).getAttribute("aria-pressed"), "true");
  assert.equal(within(modeSwitch).getByRole("button", { name: "Published" }).getAttribute("aria-pressed"), "false");
  assert.ok(within(panel).getByText("4 unpublished changes"));
  await waitFor(() => assert.equal(panel.querySelectorAll(".sp-event").length, 3));
  const rows = panel.querySelectorAll(".sp-event");
  assert.equal(rows[0].querySelector(".sp-event-what").textContent, "3 assignments changed · 2 employee edits");
  assert.equal(rows[0].querySelector(".sp-event-when").textContent, "Sep 2, 2026, 2:12 PM");
  assert.equal(rows[0].querySelector(".sp-event-who").textContent, "patrick@example.com");
  assert.equal(rows[1].querySelector(".sp-event-who").textContent, "an admin", "an unresolved publisher reads as 'an admin'");
  assert.equal(rows[2].querySelector(".sp-event-what").textContent, "Initial publish · 68 seats");
  assert.equal(within(panel).queryByRole("button", { name: "Show more" }), null, "fewer than a page → no Show more");
});

test("History (admin): pressing the other segment calls onSwitchMode; the current one is inert", async () => {
  const switched = [];
  configureContext({ pathname: "/admin/management", actions: { getPublishHistoryAction: async () => [] } });
  await renderElement(panels({ open: "history", pathname: "/admin/management", onSwitchMode: target => switched.push(target) }));
  const modeSwitch = screen.getByRole("group", { name: "Mode" });
  await act(async () => fireEvent.click(within(modeSwitch).getByRole("button", { name: "Draft" })));
  assert.deepEqual(switched, []);
  await act(async () => fireEvent.click(within(modeSwitch).getByRole("button", { name: "Published" })));
  assert.deepEqual(switched, ["published"]);
});

test("History (admin): a full page shows Show more; 25 shows the cap caption", async () => {
  const requested = [];
  const event = i => ({ created_at: `2026-08-${String(30 - i).padStart(2, "0")}T10:00:00Z`, seat_count: 1, published_by: null, published_by_email: null, change_summary: { seats_moved: 1 } });
  configureContext({
    pathname: "/admin",
    actions: {
      getPublishHistoryAction: async limit => {
        requested.push(limit);
        return Array.from({ length: limit }, (_, i) => event(i));
      }
    }
  });
  await renderElement(panels({ open: "history" }));
  const panel = screen.getByRole("complementary", { name: "History" });
  const more = await waitFor(() => within(panel).getByRole("button", { name: "Show more" }));
  await act(async () => fireEvent.click(more));
  await waitFor(() => assert.equal(panel.querySelectorAll(".sp-event").length, 25));
  assert.deepEqual(requested, [10, 25]);
  assert.ok(within(panel).getByText("Showing the 25 most recent publishes."));
  assert.equal(within(panel).queryByRole("button", { name: "Show more" }), null);
});

test("History (admin): a failed load shows the error notification with Retry; Retry refetches", async () => {
  let calls = 0;
  configureContext({
    pathname: "/admin",
    actions: {
      getPublishHistoryAction: async () => {
        calls += 1;
        if (calls === 1) throw new Error("boom");
        return [];
      }
    }
  });
  await renderElement(panels({ open: "history" }));
  const panel = screen.getByRole("complementary", { name: "History" });
  const alert = await waitFor(() => within(panel).getByRole("alert"));
  assert.match(alert.textContent, /Publish history couldn't load/);
  await act(async () => fireEvent.click(within(alert).getByRole("button", { name: "Retry" })));
  assert.equal(calls, 2);
  await waitFor(() => assert.equal(within(panel).queryByRole("alert"), null));
});

test("History (admin): never published → empty state, no fetch", async () => {
  let calls = 0;
  configureContext({ pathname: "/admin", actions: { getPublishHistoryAction: async () => ((calls += 1), []) } });
  await renderElement(panels({ open: "history", modeStatus: { kind: "unpublished" } }));
  const panel = screen.getByRole("complementary", { name: "History" });
  assert.ok(within(panel).getByText("Publish the draft to start the history"));
  assert.ok(within(panel).getByText("Nothing published yet"));
  assert.equal(calls, 0);
});

test("History (admin): an errored mode status offers Retry on the status line", async () => {
  let retries = 0;
  configureContext({ pathname: "/admin", actions: { getPublishHistoryAction: async () => [] } });
  await renderElement(panels({ open: "history", modeStatus: { kind: "error" }, onRetryStatus: () => (retries += 1) }));
  const status = screen.getByRole("status");
  assert.match(status.textContent, /Publish state unavailable/);
  await act(async () => fireEvent.click(within(status).getByRole("button", { name: "Retry" })));
  assert.equal(retries, 1);
});

test("History (viewer): no switch, no events — one fact line and the admin note", async () => {
  let calls = 0;
  configureContext({ pathname: "/", actions: { getPublishHistoryAction: async () => ((calls += 1), []) } });
  await renderElement(panels({ open: "history", isAdmin: false, roleLabel: "Viewer", pathname: "/", modeStatus: PUBLISHED }));
  const panel = screen.getByRole("complementary", { name: "History" });
  assert.equal(within(panel).queryByRole("group", { name: "Mode" }), null);
  assert.ok(within(panel).getByText("Published · Sep 2, 2026, 2:12 PM"));
  assert.ok(within(panel).getByText("Publish history is available to admins."));
  assert.equal(calls, 0, "viewers never call the admin history action");
  cleanup();
  await renderElement(panels({ open: "history", isAdmin: false, roleLabel: "Viewer", pathname: "/", modeStatus: { kind: "unpublished" } }));
  assert.ok(screen.getByText("Nothing has been published yet"));
  assert.ok(screen.getByText("Ask an admin."));
});

test("Help: shortcut list, Draft/Published explainer, who to ask", async () => {
  await renderElement(panels({ open: "help" }));
  const panel = screen.getByRole("complementary", { name: "Help" });
  assert.ok(within(panel).getByText("Find a person or seat"));
  assert.ok(within(panel).getByText(/K$/, { selector: "dt" }), "the search shortcut names the platform modifier + K");
  assert.ok(within(panel).getByText("Draft and Published"));
  assert.ok(within(panel).getByText(/Your office administrators publish the map/));
});

test("Escape inside a panel calls onClose", async () => {
  let closed = 0;
  await renderElement(panels({ open: "help", onClose: () => (closed += 1) }));
  const panel = screen.getByRole("complementary", { name: "Help" });
  await act(async () => fireEvent.keyDown(panel, { key: "Escape" }));
  assert.equal(closed, 1);
});

test("a pointer-down outside the panel (and outside the header) calls onClose; inside does not", async () => {
  let closed = 0;
  const header = document.createElement("header");
  header.id = "shell-header";
  document.body.appendChild(header);
  try {
    await renderElement(panels({ open: "help", onClose: () => (closed += 1) }));
    const panel = screen.getByRole("complementary", { name: "Help" });
    await act(async () => fireEvent.pointerDown(panel));
    assert.equal(closed, 0, "inside the panel must not close");
    await act(async () => fireEvent.pointerDown(header));
    assert.equal(closed, 0, "header clicks are the triggers' business");
    await act(async () => fireEvent.pointerDown(document.body));
    assert.equal(closed, 1);
  } finally {
    header.remove();
  }
});
