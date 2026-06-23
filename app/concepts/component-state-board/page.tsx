import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComponentStateBoard } from "./ComponentStateBoard";

export const metadata: Metadata = {
  title: "Seat Planner Component State Board v1",
  description: "Prototype-only component state board for Seat Planner design-system exploration"
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function ComponentStateBoardPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <ComponentStateBoard />;
}
