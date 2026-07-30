import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NavRailPreview } from "./NavRailPreview";

export const metadata: Metadata = {
  title: "Seat Planner · Nav Rail Preview (v12 §1)",
  description: "Prototype-only mock of the v12 left navigation rail: 48/232px widths, item states, and the three responsive tiers — no routing, no guard, no persistence"
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function NavRailPreviewPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <NavRailPreview />;
}
