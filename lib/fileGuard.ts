// Client-side guard for the two Settings file triggers (CSV import, snapshot
// restore). DECISIONS D6-b / frame invariant (owner 2026-09-03): the accepted
// type and the 5 MB limit are stated in the trigger's own label BEFORE a file
// is chosen, and every unhappy path is an inline error under the section
// before any tearsheet opens (PHASE2UX §1S.3–§1S.4, PHASE3DS §1.27). Content
// checks (missing columns, the snapshot's shape) stay with the parsers.

export type UploadKind = "csv" | "json";

export const UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

const EXTENSION: Record<UploadKind, string> = { csv: ".csv", json: ".json" };

/** The trigger's own words: ".csv up to 5 MB". */
export function describeUploadLimit(kind: UploadKind): string {
  return `${EXTENSION[kind]} up to 5 MB`;
}

const WRONG_TYPE: Record<UploadKind, string> = {
  csv: "Choose a .csv file.",
  json: "Choose a .json file — a file exported from this page."
};

const EMPTY: Record<UploadKind, string> = {
  csv: "The CSV is empty.",
  json: "Cannot restore an empty snapshot."
};

function megabytes(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/** Returns null when the file may be read, else the inline error to show. */
export function checkUpload(file: { name: string; size: number }, kind: UploadKind): string | null {
  if (!file.name.toLowerCase().endsWith(EXTENSION[kind])) return WRONG_TYPE[kind];
  if (file.size > UPLOAD_LIMIT_BYTES) return `This file is ${megabytes(file.size)} MB — the limit is 5 MB.`;
  if (file.size === 0) return EMPTY[kind];
  return null;
}
