import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignSampler } from "./DesignSampler";

export const metadata: Metadata = {
  title: "Seat Planner · Design sampler (archetype pick)",
  description:
    "Prototype-only side-by-side of three visual archetypes (Ethereal Glass, Editorial Luxury, Soft Structuralism) over the same component set. Static fixture content — no data, no auth.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function DesignSamplerPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <DesignSampler />;
}
