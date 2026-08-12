"use client";

// Prototype-only runoff: viewer hero in the two finalist archetypes.
// Fixture = the real 60-seat published snapshot; positions flow through the
// PRODUCTION transform pipeline (seatsToVisualSeats + pointToStyle) so markers
// land on the same chairs as the live viewer.
import localFont from "next/font/local";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  MAP_IMAGE_BLUR_DATA_URL,
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
import { pointToStyle } from "@/lib/seatMath";
import { FIXTURE_SEATS, FIXTURE_ZONES, type FixtureSeat } from "./fixtureSeats";

const geist = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-v13-grotesk",
  display: "swap"
});

const fraunces = localFont({
  src: "../fonts/fraunces-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-v13-serif",
  display: "swap"
});

const EASE = "cubic-bezier(0.32,0.72,0,1)";

type RunoffTheme = {
  id: "glass" | "editorial";
  name: string;
  displayFontVar: string;
  bodyFontVar: string;
  pageClass: string;
  backdrop: ReactNode;
  eyebrowClass: string;
  headingClass: string;
  bodyClass: string;
  // map card (double-bezel)
  shellClass: string;
  coreClass: string;
  // markers
  markerAssignedClass: string;
  markerAvailableClass: string;
  markerDimmedClass: string; // filtered-out state, both statuses
  // chips + find field (used by Task 3)
  chipClass: string;
  chipActiveClass: string;
  fieldLabelClass: string;
  fieldClass: string;
  toggleClass: string;
  toggleActiveClass: string;
};

const GLASS: RunoffTheme = {
  id: "glass",
  name: "Ethereal Glass",
  displayFontVar: "var(--font-v13-grotesk)",
  bodyFontVar: "var(--font-v13-grotesk)",
  pageClass: "bg-[#050505] text-white",
  backdrop: (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,87,21,0.22),transparent_65%)]" />
      <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,87,21,0.10),transparent_65%)]" />
    </div>
  ),
  eyebrowClass:
    "inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/70",
  headingClass: "text-4xl font-semibold tracking-tight text-white md:text-6xl",
  bodyClass: "text-base font-light leading-relaxed text-white/60",
  shellClass: "rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10",
  coreClass: "relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[#0b0b0d] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]",
  markerAssignedClass:
    "rounded-full border border-[#FF5715]/60 bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  markerAvailableClass:
    "rounded-full border border-white/25 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-white/70",
  markerDimmedClass: "opacity-25",
  chipClass:
    "rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  chipActiveClass:
    "rounded-full border border-[#FF5715]/70 bg-[#FF5715]/15 px-3 py-1.5 text-xs font-medium text-[#ffb694] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-white/50",
  fieldClass:
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  toggleClass:
    "rounded-full px-4 py-1.5 text-xs font-medium text-white/60 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  toggleActiveClass:
    "rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]"
};

const EDITORIAL: RunoffTheme = {
  id: "editorial",
  name: "Editorial Luxury",
  displayFontVar: "var(--font-v13-serif)",
  bodyFontVar: "var(--font-v13-grotesk)",
  pageClass: "bg-[#FDFBF7] text-[#2b2018]",
  backdrop: (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"
      }}
    />
  ),
  eyebrowClass:
    "inline-flex items-center rounded-full border border-[#2b2018]/15 bg-[#2b2018]/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a6f57]",
  headingClass: "text-4xl font-medium tracking-tight text-[#241a12] md:text-6xl",
  bodyClass: "text-base leading-relaxed text-[#5c4d3f]",
  shellClass: "rounded-[2rem] bg-[#2b2018]/[0.05] p-1.5 ring-1 ring-[#2b2018]/10",
  coreClass:
    "relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[#FFFEFB] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_20px_50px_-30px_rgba(43,32,24,0.35)]",
  markerAssignedClass:
    "rounded-full border border-[#2b2018]/30 bg-[#241a12] px-2 py-0.5 text-[10px] font-medium text-[#FDFBF7] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]",
  markerAvailableClass:
    "rounded-full border border-[#2b2018]/20 bg-[#FFFEFB]/90 px-2 py-0.5 text-[10px] font-medium text-[#6d5943] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]",
  markerDimmedClass: "opacity-25",
  chipClass:
    "rounded-full border border-[#2b2018]/15 bg-[#2b2018]/[0.04] px-3 py-1.5 text-xs font-medium text-[#6d5943] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]",
  chipActiveClass:
    "rounded-full border border-[#241a12] bg-[#241a12] px-3 py-1.5 text-xs font-medium text-[#FDFBF7] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a6f57]",
  fieldClass:
    "w-full rounded-2xl border border-[#2b2018]/15 bg-white px-4 py-3 text-[#241a12] placeholder:text-[#b3a08d] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]/50",
  toggleClass:
    "rounded-full px-4 py-1.5 text-xs font-medium text-[#8a6f57] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]",
  toggleActiveClass:
    "rounded-full bg-[#241a12] px-4 py-1.5 text-xs font-semibold text-[#FDFBF7] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]"
};

// Reveal-on-scroll with a reduced-motion guard. Reduced motion (or no
// IntersectionObserver) => content is simply visible; no translation, no blur.
// Copied verbatim from app/concepts/design-sampler/DesignSampler.tsx — concepts
// never import from each other, so this is a deliberate duplication.
function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"pending" | "revealed" | "static">("pending");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setState("static");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, state };
}

function Reveal({
  delayMs = 0,
  className,
  children
}: {
  delayMs?: number;
  className?: string;
  children: ReactNode;
}) {
  const { ref, state } = useReveal();
  const hidden = state === "pending";
  const style: CSSProperties =
    state === "static"
      ? {}
      : {
          transition: `transform 800ms ${EASE} ${delayMs}ms, opacity 800ms ${EASE} ${delayMs}ms`,
          transform: hidden ? "translateY(4rem)" : "translateY(0)",
          opacity: hidden ? 0 : 1
        };
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

export function ViewerV13() {
  const [themeId, setThemeId] = useState<"glass" | "editorial">("glass");
  const theme = themeId === "glass" ? GLASS : EDITORIAL;
  const visualSeats = useMemo(() => seatsToVisualSeats(FIXTURE_SEATS), []);
  // Task 3 adds: zone/status filter state + find query + filtering memo.

  return (
    <div
      className={`${geist.variable} ${fraunces.variable} relative min-h-[100dvh] ${theme.pageClass}`}
      style={{ fontFamily: theme.bodyFontVar }}
    >
      {theme.backdrop}
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 md:px-10 md:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={theme.eyebrowClass}>Viewer v13 — runoff prototype</p>
            <h1 className={`mt-4 ${theme.headingClass}`} style={{ fontFamily: theme.displayFontVar }}>
              Find anyone&apos;s seat in seconds.
            </h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-current/10 p-1" role="group" aria-label="Archetype">
            {([GLASS, EDITORIAL] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={themeId === t.id}
                onClick={() => setThemeId(t.id)}
                className={themeId === t.id ? theme.toggleActiveClass : theme.toggleClass}
                style={{ transition: `transform 500ms ${EASE}` }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </header>

        {/* Task 3 inserts: chips row + find field here */}

        <div className={theme.shellClass}>
          <div className={theme.coreClass}>
            <div className="relative w-full" style={{ aspectRatio: `${MAP_IMAGE_WIDTH} / ${MAP_IMAGE_HEIGHT}` }}>
              <Image
                src={MAP_IMAGE_SRC}
                alt="Office floor plan"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 1280px"
                placeholder="blur"
                blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                className="object-contain"
                draggable={false}
              />
              {visualSeats.map((seat) => (
                <button
                  key={seat.seat_key}
                  type="button"
                  aria-label={seat.full_name ? `${seat.label} — ${seat.full_name}` : `${seat.label} — open seat`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${seat.full_name ? theme.markerAssignedClass : theme.markerAvailableClass}`}
                  style={{ ...pointToStyle(seat), transition: `transform 400ms ${EASE}` }}
                >
                  {seat.full_name ? shortName(seat.full_name) : seat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : fullName;
}
