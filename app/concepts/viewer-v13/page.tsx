import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewerV13 } from "./ViewerV13";

export const metadata: Metadata = {
  title: "Seat Planner · Viewer v13 runoff (Glass vs Editorial)",
  description:
    "Prototype-only viewer hero rendered in the two finalist archetypes with a live theme toggle. Static fixture content — no data, no auth.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function ViewerV13Page() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <ViewerV13 />;
}
