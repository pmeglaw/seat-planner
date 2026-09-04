// Platform-aware keyboard hints (PHASE3DS §5 item 4, Phase 4 PR 3a): Ctrl on
// Windows / Linux (the firm's machines), ⌘ on Apple hardware. Decided at
// hydration from navigator.platform — never in the server render, which
// always says "Ctrl" so the markup matches on both sides. One module so the
// Help panel, the map search hint and the Undo / Redo tooltips can never
// disagree about the modifier.

export type ModifierLabel = "⌘" | "Ctrl";

export function isApplePlatform(platform: string | undefined | null): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform ?? "");
}

export function modifierKeyLabel(platform: string | undefined | null): ModifierLabel {
  return isApplePlatform(platform) ? "⌘" : "Ctrl";
}

// "Ctrl K" / "⌘ K" — the space is deliberate (the specimen's .sp-kbd shows
// two glyph groups, not a chord string).
export function shortcutHint(platform: string | undefined | null, key: string): string {
  return `${modifierKeyLabel(platform)} ${key}`;
}

// Undo / Redo tooltips promise their shortcuts (PHASE2UX §1M.3, P2-1).
// Redo is Shift+Z everywhere; Windows also accepts Ctrl Y (handled by the
// keydown matcher, not advertised — one hint per control).
export function undoShortcutHint(platform: string | undefined | null): string {
  return `${modifierKeyLabel(platform)} Z`;
}

export function redoShortcutHint(platform: string | undefined | null): string {
  return `${modifierKeyLabel(platform)} Shift Z`;
}

// Which draft-history action a keydown asks for, or null. Modifier = ⌘ on
// Apple platforms and Ctrl elsewhere; the OTHER modifier never counts, so a
// Windows Ctrl Z is not also a ⌘ Z when a Mac browser reports both.
export type HistoryShortcut = "undo" | "redo";

export function historyShortcutFor(
  event: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean },
  platform: string | undefined | null
): HistoryShortcut | null {
  if (event.altKey) return null;
  const modifier = isApplePlatform(platform) ? event.metaKey : event.ctrlKey;
  if (!modifier) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey && !isApplePlatform(platform)) return "redo";
  return null;
}

// Shortcuts never fire while the user is typing or inside a dialog — the
// inspector's text fields have their own native undo, and a modal owns Z.
export function shortcutTargetIsEditable(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== "function") return false;
  const element = target as HTMLElement;
  return Boolean(element.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog'], [role='alertdialog']"));
}
