import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapRedesignPreview } from "./MapRedesignPreview";

export const metadata: Metadata = {
  title: "Seat Planner · Map Redesign Preview (Counsel Ink)",
  description: "Prototype-only Counsel Ink map redesign preview: seat markers, docked inspector, and filter bar against real published seat data"
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function MapRedesignPreviewPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <MapRedesignPreview />;
}
