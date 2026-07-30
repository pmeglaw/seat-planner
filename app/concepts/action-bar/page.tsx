import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionBarPreview } from "./ActionBarPreview";

export const metadata: Metadata = {
  title: "Seat Planner · Floating action bar (Carbon prediction §02)",
  description: "Prototype-only mock of the contextual seat action bar that rides with the selection instead of living in the top chrome"
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function ActionBarPreviewPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <ActionBarPreview />;
}
