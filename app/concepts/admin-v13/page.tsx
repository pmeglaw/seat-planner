import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminV13 } from "./AdminV13";

export const metadata: Metadata = {
  title: "Seat Planner · Admin v13 (glass editor concept)",
  description:
    "Prototype-only mock of the admin editor in the Ethereal Glass language: rail, draft map, inspector, publish review. Static fixture content — no data, no auth, no mutations.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function AdminV13Page() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <AdminV13 />;
}
