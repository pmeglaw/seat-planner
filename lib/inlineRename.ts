// Inline rename resolution for the Management structured lists (departments,
// zones). PHASE3DS §1.25 / PHASE2UX §1G.4: the row swaps its name for a 40px
// field + Save (primary) · Cancel (ghost); Enter saves, Esc cancels, and blur
// VALIDATES — it never commits. The row calls this on every change and on
// blur: `unchanged` disables Save, `invalid` paints the helper under the field
// and disables Save, `valid` is the trimmed name the action receives. The
// create modal reuses the duplicate copy (original = null).
//
// Copy (specimen 03-panels-and-sheets.html line 203, owner 2026-09-05): the
// name quoted, the next step named — never a generic "already exists".

import { MAX_OPTION_NAME_LENGTH } from "@/lib/schemas";

export type OptionKind = "department" | "zone";

export type InlineRenameResolution =
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string }
  | { kind: "valid"; name: string };

export function duplicateNameMessage(kind: OptionKind, existingName: string): string {
  return `A ${kind} named “${existingName}” already exists. Rename it from the list instead.`;
}

export function resolveInlineRename({
  kind,
  draft,
  original,
  existing
}: {
  kind: OptionKind;
  draft: string;
  /** The row being renamed; null for the create modal. */
  original: string | null;
  /** Every name currently in the list (the original included). */
  existing: ReadonlyArray<string>;
}): InlineRenameResolution {
  const name = draft.trim();
  if (original !== null && name === original) return { kind: "unchanged" };
  if (name.length === 0) return { kind: "invalid", message: `Enter a ${kind} name.` };
  if (name.length > MAX_OPTION_NAME_LENGTH) {
    return { kind: "invalid", message: `Keep the ${kind} name to ${MAX_OPTION_NAME_LENGTH} characters or fewer.` };
  }
  const folded = name.toLocaleLowerCase();
  const clash = existing.find(candidate => candidate !== original && candidate.toLocaleLowerCase() === folded);
  if (clash !== undefined) return { kind: "invalid", message: duplicateNameMessage(kind, clash) };
  return { kind: "valid", name };
}
