/**
 * Display formatting for person names.
 *
 * Some seed/legacy employee records store `full_name` in ALL CAPS (e.g. "PATRICK",
 * "ALEX MEGERDCHIAN"). Rendering those verbatim reads as shouting — or a data bug.
 * `formatDisplayName` title-cases a name ONLY when it is entirely uppercase, so
 * already-natural names (including intentional casings like "van der Berg" or
 * "McDonald") are returned untouched and never mangled.
 */

function titleCaseWord(word: string): string {
  // Capitalize the first letter after each apostrophe / hyphen boundary so
  // "O'BRIEN" -> "O'Brien" and "ANNE-MARIE" -> "Anne-Marie".
  return word
    .toLowerCase()
    .replace(/(^|[’'\-])([a-z])/g, (_match, boundary, letter) => boundary + letter.toUpperCase());
}

export function formatDisplayName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";

  // Leave anything that already contains a lowercase letter exactly as entered.
  if (/[a-z]/.test(trimmed)) return trimmed;

  return trimmed
    .split(/(\s+)/) // keep the whitespace separators so spacing is preserved
    .map(segment => (/\s/.test(segment) ? segment : titleCaseWord(segment)))
    .join("");
}

/**
 * Display formatting for seat codes (e.g. "cw01" / "Cw01" -> "CW01").
 *
 * Seat codes are identifiers, not prose — unlike names they should always be
 * rendered in one canonical (uppercase) casing, regardless of how the label
 * was entered/stored. Never run seat codes through `formatDisplayName`,
 * which title-cases all-caps input and would mangle "CW01" into "Cw01".
 */
export function formatSeatCode(label: string | null | undefined): string {
  if (!label) return "";
  return label.trim().toUpperCase();
}
