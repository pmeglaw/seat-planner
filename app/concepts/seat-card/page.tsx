import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeatSheetPreview } from "./SeatSheetPreview";

export const metadata: Metadata = {
  title: "Seat Planner · Seat Sheet (concept)",
  description:
    "Prototype-only concept: a new-hire seat assignment card styled as an architect's plan sheet — keyed callouts, dimension line, title block. Static fixture data, no auth.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function SeatSheetPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <SeatSheetPreview />;
}
