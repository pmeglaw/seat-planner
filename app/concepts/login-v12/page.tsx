import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginV12Preview } from "./LoginV12Preview";

export const metadata: Metadata = {
  title: "Seat Planner · Login in v12 (Carbon prediction §06)",
  description: "Prototype-only mock of the predicted Carbon v12 sign-in screen: fluid fields with the label inside, bottom rule only, brand mark at display scale. Static — no inputs, no auth.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function LoginV12PreviewPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <LoginV12Preview />;
}
