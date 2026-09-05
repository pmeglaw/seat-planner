import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const mod = await importTsModule("lib/platformShortcut.ts");

// P3-4: the modifier is decided from navigator.platform at hydration; the
// server always renders Ctrl. One module feeds Help, the search hint and the
// Undo / Redo tooltips so they can never disagree.

test("modifier: ⌘ on Apple platforms, Ctrl elsewhere and when unknown", () => {
  assert.equal(mod.modifierKeyLabel("MacIntel"), "⌘");
  assert.equal(mod.modifierKeyLabel("iPhone"), "⌘");
  assert.equal(mod.modifierKeyLabel("Win32"), "Ctrl");
  assert.equal(mod.modifierKeyLabel("Linux x86_64"), "Ctrl");
  assert.equal(mod.modifierKeyLabel(undefined), "Ctrl");
  assert.equal(mod.modifierKeyLabel(null), "Ctrl");
});

test("hints: 'Ctrl K' / '⌘ K', 'Ctrl Z', 'Ctrl Shift Z'", () => {
  assert.equal(mod.shortcutHint("Win32", "K"), "Ctrl K");
  assert.equal(mod.shortcutHint("MacIntel", "K"), "⌘ K");
  assert.equal(mod.undoShortcutHint("Win32"), "Ctrl Z");
  assert.equal(mod.redoShortcutHint("MacIntel"), "⌘ Shift Z");
});

const key = (k, mods = {}) => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test("historyShortcutFor: Ctrl Z / Ctrl Shift Z / Ctrl Y on Windows; ⌘ on Mac; the other modifier never counts", () => {
  assert.equal(mod.historyShortcutFor(key("z", { ctrlKey: true }), "Win32"), "undo");
  assert.equal(mod.historyShortcutFor(key("Z", { ctrlKey: true, shiftKey: true }), "Win32"), "redo");
  assert.equal(mod.historyShortcutFor(key("y", { ctrlKey: true }), "Win32"), "redo");
  assert.equal(mod.historyShortcutFor(key("z", { metaKey: true }), "Win32"), null);
  assert.equal(mod.historyShortcutFor(key("z", { metaKey: true }), "MacIntel"), "undo");
  assert.equal(mod.historyShortcutFor(key("z", { metaKey: true, shiftKey: true }), "MacIntel"), "redo");
  assert.equal(mod.historyShortcutFor(key("y", { metaKey: true }), "MacIntel"), null, "Ctrl/⌘ Y is a Windows habit only");
  assert.equal(mod.historyShortcutFor(key("z", { ctrlKey: true }), "MacIntel"), null);
  assert.equal(mod.historyShortcutFor(key("z", { ctrlKey: true, altKey: true }), "Win32"), null);
  assert.equal(mod.historyShortcutFor(key("z"), "Win32"), null);
});

test("shortcutTargetIsEditable: text fields and dialogs swallow the shortcut", () => {
  const closest = selector => ({ closest: sel => (sel.includes(selector) ? {} : null) });
  assert.equal(mod.shortcutTargetIsEditable(closest("textarea")), true);
  assert.equal(mod.shortcutTargetIsEditable(closest("[role='dialog']")), true);
  assert.equal(mod.shortcutTargetIsEditable({ closest: () => null }), false);
  assert.equal(mod.shortcutTargetIsEditable(null), false);
});
