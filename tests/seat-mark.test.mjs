import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadComponent, renderElement, React, cleanup } from "./helpers/renderComponent.mjs";

// SeatMark (PHASE3DS §1.4 / §5 item 5): the four status symbols + the ◇
// badge, INLINED with their data-stroke / data-fill / data-hatch parts —
// never a sprite <use> (CSS cannot reach a use's shadow tree, §7 item 6).

let SeatMark, seatMarkKindFor;
before(async () => {
  ({ SeatMark, seatMarkKindFor } = await loadComponent("@/components/seat-map/SeatMark"));
});
afterEach(() => cleanup());

async function render(kind) {
  const { container } = await renderElement(React.createElement(SeatMark, { kind }));
  return container.firstElementChild;
}

test("open = a hollow ring drawn with data-stroke; reserved = shackle stroke + filled body; unavailable = stroked square + hatch", async () => {
  const open = await render("open");
  assert.ok(open.classList.contains("sp-seat-mark"));
  assert.equal(open.getAttribute("aria-hidden"), "true");
  assert.ok(open.querySelector("circle[data-stroke]"));
  cleanup();
  const reserved = await render("reserved");
  assert.ok(reserved.querySelector("path[data-stroke]") && reserved.querySelector("rect[data-fill]"));
  cleanup();
  const unavailable = await render("unavailable");
  assert.ok(unavailable.querySelector("rect[data-stroke]") && unavailable.querySelector("path[data-hatch]"));
});

test("assigned = the mini-pill span; assigned-dot = the filled ● the legend shows with names off", async () => {
  const pill = await render("assigned");
  assert.equal(pill.tagName, "SPAN");
  assert.ok(pill.classList.contains("sp-seat-mark--pill"));
  cleanup();
  const dot = await render("assigned-dot");
  assert.ok(dot.querySelector("circle[data-fill]"));
});

test("draft-badge = the 8px hollow ◇ on .sp-pill-badge (styled by fill/stroke on the svg)", async () => {
  const badge = await render("draft-badge");
  assert.ok(badge.classList.contains("sp-pill-badge"));
  assert.equal(badge.getAttribute("viewBox"), "0 0 8 8");
  assert.ok(badge.querySelector("path"));
});

test("no mark uses <use> — every path is inlined", async () => {
  for (const kind of ["assigned", "assigned-dot", "open", "reserved", "unavailable", "draft-badge"]) {
    const el = await render(kind);
    assert.equal(el.querySelector("use"), null, `${kind} must not <use> a symbol`);
    cleanup();
  }
});

test("seatMarkKindFor maps the four SeatStatus values", () => {
  assert.equal(seatMarkKindFor("assigned"), "assigned");
  assert.equal(seatMarkKindFor("available"), "open");
  assert.equal(seatMarkKindFor("reserved"), "reserved");
  assert.equal(seatMarkKindFor("unavailable"), "unavailable");
});
