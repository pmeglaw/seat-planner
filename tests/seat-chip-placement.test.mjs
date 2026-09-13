import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { placeDeskwardChip, usesDeskwardChip } = await importTsModule("lib/seatChipPlacement.ts");
const { savedPointToVisualPoint, visualPointToSavedPoint } = await importTsModule("lib/mapLayoutTransform.ts");

test("deskward placement is confined to the approved floor-3 seats", () => {
  for (const [label, zone] of [["W02", "West Pod"], ["W05", "West Pod"], ["NE02", "Northeast Pod"], ["NE03", "Northeast Pod"], ["NE07", "Northeast Pod"], ["CW06", "Center West"], ["E03", "East Pod"], ["SE02", "Southeast Office"]]) {
    assert.equal(usesDeskwardChip({ label, zone, floor: "3" }), true);
    assert.equal(usesDeskwardChip({ label, zone, floor: "2" }), false);
    assert.equal(usesDeskwardChip({ label, zone: "Other", floor: "3" }), false);
  }
  assert.equal(usesDeskwardChip({ label: "W01", zone: "West Pod", floor: "3" }), false);
});

test("NE02 clears NE03 toward its left-hand desk, retaining the chair row when space allows", () => {
  for (const width of [1644, 1911, 2500]) {
    const canvas = { left: 31, top: 120, width, height: width * 867 / 1911 };
    const anchor = { x: 31 + .789025 * width, y: 120 + .080697 * canvas.height };
    const obstacles = [[.732139, .080697, 75.390625], [.818401, .079625, 73.78125], [.8748, .080807, 71.71875]]
      .map(([x, y, w]) => ({ left: 31 + x * width - w / 2, top: 120 + y * canvas.height - 14, width: w, height: 28 }));
    const offset = placeDeskwardChip(anchor, { width: 74.1328125, height: 28 }, canvas, obstacles, -1);
    assert.ok(offset && offset.x <= 0 && offset.x >= -width * .04);
    if (width >= 1911) assert.equal(offset.y, 0);
    const left = anchor.x + offset.x - 74.1328125 / 2;
    const top = anchor.y + offset.y - 14;
    for (const rect of obstacles) assert.ok(left + 74.1328125 <= rect.left || left >= rect.left + rect.width || top + 28 <= rect.top || top >= rect.top + rect.height);
  }
});

test("leftward placement accepts DOMRect-style inherited geometry properties", () => {
  const canvas = Object.create({ left: 0, top: 0, width: 1911, height: 867 });
  const obstacle = Object.create({ left: 1542, top: 60, width: 74, height: 28 });
  const offset = placeDeskwardChip({ x: 1523, y: 74 }, { width: 74, height: 28 }, canvas, [obstacle], -1);
  assert.deepEqual(offset, { x: -20, y: 0 });
});

test("NE03 clears an empty NE02 footprint at the narrower desktop width", () => {
  const width = 1644;
  const canvas = { left: 1, top: 180, width, height: width * 867 / 1911 };
  const anchor = { x: 1 + .818401 * width, y: 180 + .079625 * canvas.height };
  const obstacles = [[.789025, .080697, 28], [.8748, .080807, 72]]
    .map(([x,y,w]) => ({left:1+x*width-w/2,top:180+y*canvas.height-14,width:w,height:28}));
  const offset = placeDeskwardChip(anchor, {width:82,height:28}, canvas, obstacles);
  assert.ok(offset && offset.x >= 0);
  assert.equal(offset.y, 0);
  const left = anchor.x + offset.x - 41;
  for (const rect of obstacles) assert.ok(left >= rect.left + rect.width || left + 82 <= rect.left);
});

test("CW06, E03 and SE02 use readable deskward placement across desktop widths", () => {
  for (const width of [1644, 1911]) {
    const canvas = {left:0,top:0,width,height:width*867/1911};
    for (const [label,x,y,w,neighbours] of [
      ["CW06",.378033,.587127,74,[[.339344,.588573,60]]],
      ["E03",.689333,.414,55.164,[[.658222,.414,65.774],[.746,.414,64.704]]],
      ["SE02",.869049,.592053,68.8125,[[.831527,.592053,71.86]]]
    ]) {
      const obstacles = neighbours.map(([nx,ny,nw])=>({left:nx*width-nw/2,top:ny*canvas.height-14,width:nw,height:28}));
      const anchor = {x:x*width,y:y*canvas.height};
      const offset = placeDeskwardChip(anchor,{width:w,height:28},canvas,obstacles);
      assert.ok(offset, label);
      assert.equal(offset.y,0,label);
      const left=anchor.x+offset.x-w/2;
      for (const rect of obstacles) assert.ok(left>=rect.left+rect.width || left+w<=rect.left,label);
    }
  }
});

test("CW06 nudges its short label 6px left while clearing CW05", () => {
  for (const width of [1644, 1911]) {
    const canvas = {left:0,top:0,width,height:width*867/1911};
    const anchor = {x:.378033*width,y:.587127*canvas.height};
    const neighbour = {left:.339344*width-59.524/2,top:.588573*canvas.height-14,width:59.524,height:28};
    const offset = placeDeskwardChip(anchor,{width:48.289,height:28},canvas,[neighbour],-1,6);
    assert.deepEqual(offset,{x:-6,y:0});
    assert.ok(anchor.x+offset.x-48.289/2 > neighbour.left+neighbour.width);
  }
});

// Geometry and measured widths only: no office directory data in fixtures.
const rows = [
  ["W01", .146708, .414999, 62.25, 0],
  ["W02", .178265, .414999, 82.640625, -14],
  ["W03", .234055, .414999, 58.7265625, 0],
  ["W04", .146708, .488283, 56.328125, 0],
  ["W05", .178265, .488283, 67.859375, -14],
  ["W06", .234055, .488283, 62.1875, 0],
  ["NE06", .788419, .159471, 53.9765625, 0],
  ["NE07", .819998, .161242, 68.8046875, -14],
  ["NE08", .8748, .157692, 81.2421875, 0]
];
for (const width of [1280, 1500, 1644, 1911, 2500, 3822]) {
  test(`approved chips clear both neighbours without moving their anchors at map width ${width}`, () => {
    const canvas = { left: 31, top: 120, width, height: width * 867 / 1911 };
    const rects = rows.map(([id, x, y, w, dy]) => ({
      id, left: canvas.left + x * width - w / 2, top: canvas.top + y * canvas.height + dy - 14, width: w, height: 28
    }));
    for (const label of ["W02", "W05", "NE07"]) {
      const [, x, y, w] = rows.find(row => row[0] === label);
      const anchor = { x: canvas.left + x * width, y: canvas.top + y * canvas.height };
      const obstacles = rects.filter(rect => rect.id !== label);
      const offset = placeDeskwardChip(anchor, { width: w, height: 28 }, canvas, obstacles);
      assert.ok(offset, `${label} must find a bounded position`);
      assert.ok(offset.x >= 0 && offset.x <= width * .04);
      assert.ok(Math.abs(offset.y) <= 31);
      const placed = { id: label, left: anchor.x + offset.x - w / 2, top: anchor.y + offset.y - 14, width: w, height: 28 };
      for (const obstacle of obstacles) {
        assert.ok(placed.left + w <= obstacle.left || placed.left >= obstacle.left + obstacle.width ||
          placed.top + 28 <= obstacle.top || placed.top >= obstacle.top + obstacle.height, `${label} overlaps ${obstacle.id}`);
      }
      Object.assign(rects.find(rect => rect.id === label), placed);
    }
  });
}

test("missing geometry or an impossibly crowded canvas retains the existing fallback", () => {
  const canvas = { left: 0, top: 0, width: 100, height: 100 };
  assert.equal(placeDeskwardChip({ x: 50, y: 50 }, { width: 0, height: 28 }, canvas, []), null);
  assert.equal(placeDeskwardChip({ x: NaN, y: 50 }, { width: 40, height: 28 }, canvas, []), null);
  assert.equal(placeDeskwardChip({ x: 50, y: 50 }, { width: 40, height: 28 }, canvas, [canvas]), null);
});

test("fractional DOM rounding does not reject the free row above a tight pod", () => {
  const canvas = { left: 1, top: 182.5703125, width: 1644, height: 745.859375 };
  const anchor = { x: canvas.left + .178265 * canvas.width, y: canvas.top + .414999 * canvas.height };
  const offset = placeDeskwardChip(anchor, { width: 82.640625, height: 28 }, canvas, [
    { left: 211.0625, top: 478.09375, width: 62.25, height: 28 },
    { left: 356.41796875, top: 478.09375, width: 58.7265625, height: 28 },
    { left: 214.0234375, top: 532.7578125, width: 56.328125, height: 28 },
    { left: 260.1328125, top: 518.7578125, width: 67.859375, height: 28 }
  ]);
  assert.ok(offset);
  assert.ok(offset.x > 0 && offset.y < 0);
});

test("South Offices land inside their rooms and round-trip to the original saved positions", () => {
  for (const [label, x, y, left, right] of [["S01", .252101, .88734, .32, .42], ["S02", .107488, .883173, .18, .215]]) {
    const source = { label, zone: "South Offices", floor: "3", x, y };
    const visual = savedPointToVisualPoint(source, source);
    assert.ok(visual.x > left && visual.x < right);
    assert.ok(visual.y > .96 && visual.y < .98);
    const saved = visualPointToSavedPoint(visual, { source });
    assert.ok(Math.abs(saved.x - x) < .000002 && Math.abs(saved.y - y) < .000002);
    const secondFloor = { ...source, floor: "2" };
    assert.deepEqual(savedPointToVisualPoint(secondFloor, secondFloor), { x, y });
  }
});
