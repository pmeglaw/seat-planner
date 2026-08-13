import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoginV13 } from "./LoginV13";

export const metadata: Metadata = {
  title: "Seat Planner · Login v13 (glass concept)",
  description:
    "Prototype-only mock of the two-step progressive login in the Ethereal Glass language. Static — no auth, no network.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function LoginV13Page() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <LoginV13 />;
}
