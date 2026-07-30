import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InspectorPreview } from "./InspectorPreview";

export const metadata: Metadata = {
  title: "Seat Planner · Docked Inspector Preview (v12 §2)",
  description: "Prototype-only mock of the v12 docked inspector: in-flow 288px light panel, one-line header, fixed action row, slim body — no server actions, no guard, no real data"
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function InspectorPreviewPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <InspectorPreview />;
}
