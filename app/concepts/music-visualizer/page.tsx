import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MusicVisualizer } from "./MusicVisualizer";

export const metadata: Metadata = {
  title: "Seat Planner · PRISM Music Visualizer",
  description:
    "Prototype-only real-time audio visualizer: a spectrum tunnel, orbiting particle field and beat-reactive aperture driven by the microphone, an uploaded file, or a synthesised demo track.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function MusicVisualizerPage() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <MusicVisualizer />;
}
