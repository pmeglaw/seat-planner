import type { SeatWithEmployee } from "@/lib/types";

// PostgREST detects the PK/FK as one-to-one: an object, or null when absent.
// Only admin queries embed this relationship. Viewer paths never hydrate it.
export type PublishedSeatWithNotes = SeatWithEmployee & {
  private_note: { notes: string | null } | null;
};

export function hydratePublishedSeatNotes(rows: PublishedSeatWithNotes[]): SeatWithEmployee[] {
  return rows.map(({ private_note, ...seat }) => {
    if (!private_note || Array.isArray(private_note) ||
        !(private_note.notes === null || typeof private_note.notes === "string")) {
      throw new Error("Published note baseline is missing or invalid. Contact an administrator.");
    }
    return { ...seat, notes: private_note.notes };
  });
}
