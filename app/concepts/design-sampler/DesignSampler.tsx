"use client";

// Prototype-only archetype sampler. Fixture content, no data reads, no auth.
// Fonts are vendored beside the concepts (../fonts) — see fonts/README.md for
// why next/font/google is banned and why the weight ranges must stay declared.
import localFont from "next/font/local";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MAP_IMAGE_BLUR_DATA_URL, MAP_IMAGE_SRC } from "@/lib/mapLayoutTransform";

const geist = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sampler-grotesk",
  display: "swap"
});

const fraunces = localFont({
  src: "../fonts/fraunces-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sampler-serif",
  display: "swap"
});

const jakarta = localFont({
  src: "../fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  variable: "--font-sampler-soft",
  display: "swap"
});

// The skill's signature easing — used for every transition on this page.
const EASE = "cubic-bezier(0.32,0.72,0,1)";

// Decorative seat cluster for the map-crop card. Positions are hand-placed
// percentages within the CROP, not saved seat coordinates — this samples the
// pill styling, it does not exercise seatMath/calibration.
const FIXTURE_PILLS = [
  { id: "s1", label: "A. Petrosyan", left: "22%", top: "34%", occupied: true },
  { id: "s2", label: "M. Delgado", left: "41%", top: "28%", occupied: true },
  { id: "s3", label: "Open", left: "58%", top: "42%", occupied: false },
  { id: "s4", label: "K. Nakamura", left: "35%", top: "58%", occupied: true },
  { id: "s5", label: "Open", left: "63%", top: "66%", occupied: false },
  { id: "s6", label: "R. Okafor", left: "78%", top: "31%", occupied: true }
];

type ArchetypeTheme = {
  id: string;
  name: string;
  tagline: string;
  fontVar: string; // CSS var for the display font of this archetype
  bodyFontVar: string;
  // Section-level
  sectionClass: string;
  backdrop: ReactNode; // orbs / grain / nothing — absolutely positioned, pointer-events-none
  // Type
  eyebrowClass: string;
  headingClass: string;
  bodyClass: string;
  // Double-bezel card (outer shell / inner core)
  shellClass: string;
  coreClass: string;
  cardTitleClass: string;
  cardMetaClass: string;
  // CTA (island button + button-in-button icon)
  ctaClass: string;
  ctaIconClass: string;
  // Field
  fieldLabelClass: string;
  fieldClass: string;
  // Seat pills
  pillOccupiedClass: string;
  pillOpenClass: string;
  footnote: string;
};

const ETHEREAL_GLASS: ArchetypeTheme = {
  id: "ethereal-glass",
  name: "Ethereal Glass",
  tagline: "OLED black, mesh glow, hairline glass",
  fontVar: "var(--font-sampler-grotesk)",
  bodyFontVar: "var(--font-sampler-grotesk)",
  sectionClass: "relative overflow-hidden bg-[#050505] text-white",
  backdrop: (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(129,74,255,0.28),transparent_65%)]" />
      <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_65%)]" />
    </div>
  ),
  eyebrowClass:
    "inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/70",
  headingClass: "text-5xl font-semibold tracking-tight text-white md:text-7xl",
  bodyClass: "text-base font-light leading-relaxed text-white/60",
  shellClass: "rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10",
  coreClass:
    "rounded-[calc(2rem-0.375rem)] bg-[#0b0b0d] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]",
  cardTitleClass: "text-lg font-medium text-white",
  cardMetaClass: "text-sm text-white/50",
  ctaClass:
    "group inline-flex items-center gap-3 rounded-full bg-white py-3 pl-6 pr-2 text-sm font-medium text-black transition-transform active:scale-[0.98]",
  ctaIconClass:
    "flex h-8 w-8 items-center justify-center rounded-full bg-black/10 transition-transform group-hover:-translate-y-[1px] group-hover:translate-x-1 group-hover:scale-105",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-white/50",
  fieldClass:
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus-visible:ring-2 focus-visible:ring-white/60",
  pillOccupiedClass:
    "rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white",
  pillOpenClass:
    "rounded-full border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200",
  footnote:
    "Deviation from the archetype recipe: card backdrop-blur is omitted — these cards scroll with the page, and blur on scrolling content is a frame-cost the perf guardrail bans."
};

const EDITORIAL_LUXURY: ArchetypeTheme = {
  id: "editorial-luxury",
  name: "Editorial Luxury",
  tagline: "Warm cream, high-contrast serif, film grain",
  fontVar: "var(--font-sampler-serif)",
  bodyFontVar: "var(--font-sampler-soft)",
  sectionClass: "relative overflow-hidden bg-[#FDFBF7] text-[#2b2018]",
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
  headingClass: "text-5xl font-medium tracking-tight text-[#241a12] md:text-7xl",
  bodyClass: "text-base leading-relaxed text-[#5c4d3f]",
  shellClass: "rounded-[2rem] bg-[#2b2018]/[0.05] p-1.5 ring-1 ring-[#2b2018]/10",
  coreClass:
    "rounded-[calc(2rem-0.375rem)] bg-[#FFFEFB] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_20px_50px_-30px_rgba(43,32,24,0.35)]",
  cardTitleClass: "text-lg font-medium text-[#241a12]",
  cardMetaClass: "text-sm text-[#8a6f57]",
  ctaClass:
    "group inline-flex items-center gap-3 rounded-full bg-[#241a12] py-3 pl-6 pr-2 text-sm font-medium text-[#FDFBF7] transition-transform active:scale-[0.98]",
  ctaIconClass:
    "flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:-translate-y-[1px] group-hover:translate-x-1 group-hover:scale-105",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a6f57]",
  fieldClass:
    "w-full rounded-2xl border border-[#2b2018]/15 bg-white px-4 py-3 text-[#241a12] placeholder:text-[#b3a08d] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]/50",
  pillOccupiedClass:
    "rounded-full border border-[#2b2018]/20 bg-[#FFFEFB]/90 px-2.5 py-1 text-[11px] font-medium text-[#241a12]",
  pillOpenClass:
    "rounded-full border border-[#8a6f57]/40 bg-[#f3ead9] px-2.5 py-1 text-[11px] font-medium text-[#6d5943]",
  footnote:
    "Grain is a static SVG tile inside this section (not the skill's fixed full-viewport overlay) so archetypes don't bleed into each other on one page."
};

const SOFT_STRUCTURALISM: ArchetypeTheme = {
  id: "soft-structuralism",
  name: "Soft Structuralism",
  tagline: "Silver white, massive grotesk, diffused float",
  fontVar: "var(--font-sampler-soft)",
  bodyFontVar: "var(--font-sampler-soft)",
  sectionClass: "relative overflow-hidden bg-[#f5f5f6] text-[#17181c]",
  backdrop: null,
  eyebrowClass:
    "inline-flex items-center rounded-full bg-[#17181c]/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#585b63]",
  headingClass: "text-5xl font-extrabold tracking-tight text-[#101115] md:text-7xl",
  bodyClass: "text-base leading-relaxed text-[#585b63]",
  shellClass: "rounded-[2rem] bg-white/70 p-1.5 ring-1 ring-black/5",
  coreClass:
    "rounded-[calc(2rem-0.375rem)] bg-white p-6 shadow-[0_32px_80px_-40px_rgba(23,24,28,0.35)]",
  cardTitleClass: "text-lg font-semibold text-[#101115]",
  cardMetaClass: "text-sm text-[#8a8d95]",
  ctaClass:
    "group inline-flex items-center gap-3 rounded-full bg-[#101115] py-3 pl-6 pr-2 text-sm font-semibold text-white transition-transform active:scale-[0.98]",
  ctaIconClass:
    "flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:-translate-y-[1px] group-hover:translate-x-1 group-hover:scale-105",
  fieldLabelClass: "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8d95]",
  fieldClass:
    "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[#101115] placeholder:text-[#b0b2b8] outline-none focus-visible:ring-2 focus-visible:ring-[#101115]/40",
  pillOccupiedClass:
    "rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#101115] shadow-[0_10px_24px_-12px_rgba(23,24,28,0.45)]",
  pillOpenClass:
    "rounded-full bg-[#e6f4ee] px-2.5 py-1 text-[11px] font-semibold text-[#1b7a55]",
  footnote: "No texture layer by design — this archetype carries depth through shadow diffusion alone."
};

const THEMES = [ETHEREAL_GLASS, EDITORIAL_LUXURY, SOFT_STRUCTURALISM];

// Reveal-on-scroll with a reduced-motion guard. Reduced motion (or no
// IntersectionObserver) => content is simply visible; no translation, no blur.
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

function Reveal({ delayMs = 0, children }: { delayMs?: number; children: ReactNode }) {
  const { ref, state } = useReveal();
  const hidden = state === "pending";
  const style: CSSProperties =
    state === "static"
      ? {}
      : {
          transition: `transform 800ms ${EASE} ${delayMs}ms, opacity 800ms ${EASE} ${delayMs}ms, filter 800ms ${EASE} ${delayMs}ms`,
          transform: hidden ? "translateY(4rem)" : "translateY(0)",
          opacity: hidden ? 0 : 1,
          filter: hidden ? "blur(12px)" : "blur(0)"
        };
  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  );
}

function ArrowUpRight() {
  // Ultra-light inline stroke — no icon library (thick-stroke sets are banned).
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M4 12 12 4M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchetypeSection({ theme, index }: { theme: ArchetypeTheme; index: number }) {
  return (
    <section
      id={theme.id}
      aria-labelledby={`${theme.id}-heading`}
      className={`${theme.sectionClass} px-4 py-24 md:px-12 md:py-40`}
      style={{ fontFamily: theme.bodyFontVar }}
    >
      {theme.backdrop}
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-16">
        {/* 1 — type specimen */}
        <Reveal>
          <p className={theme.eyebrowClass}>{`Archetype 0${index + 1} — ${theme.name}`}</p>
          <h2 id={`${theme.id}-heading`} className={`mt-6 ${theme.headingClass}`} style={{ fontFamily: theme.fontVar }}>
            Find anyone&apos;s seat in seconds.
          </h2>
          <p className={`mt-6 max-w-xl ${theme.bodyClass}`}>
            {theme.tagline}. The same six components render in every archetype below — judge the
            language, not the layout.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* 2 — map crop with seat pills (asymmetric bento: wide card) */}
          <Reveal delayMs={100}>
            <div className={`${theme.shellClass} md:col-span-12`}>
              <div className={`${theme.coreClass} relative overflow-hidden !p-0`}>
                <div className="relative aspect-[16/7] w-full">
                  <Image
                    src={MAP_IMAGE_SRC}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 1152px"
                    placeholder="blur"
                    blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                    className="object-cover"
                    style={{ objectPosition: "38% 42%" }}
                  />
                  {FIXTURE_PILLS.map((pill) => (
                    <span
                      key={pill.id}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 ${pill.occupied ? theme.pillOccupiedClass : theme.pillOpenClass}`}
                      style={{ left: pill.left, top: pill.top }}
                    >
                      {pill.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          {/* 3 — double-bezel employee card */}
          <Reveal delayMs={150}>
            <div className={`${theme.shellClass} h-full md:col-span-5`}>
              <div className={`${theme.coreClass} flex h-full flex-col gap-4`}>
                <p className={theme.eyebrowClass}>Seat 214 — Litigation</p>
                <div>
                  <p className={theme.cardTitleClass} style={{ fontFamily: theme.fontVar }}>
                    Maren Delgado
                  </p>
                  <p className={theme.cardMetaClass}>Senior Paralegal · Zone B · ext. 4172</p>
                </div>
                <p className={theme.bodyClass}>
                  Double-bezel: outer shell tray, inner core plate, concentric radii.
                </p>
              </div>
            </div>
          </Reveal>

          {/* 4 + 5 — CTA and login field */}
          <Reveal delayMs={200}>
            <div className={`${theme.shellClass} h-full md:col-span-7`}>
              <div className={`${theme.coreClass} flex h-full flex-col justify-between gap-8`}>
                <div className="flex flex-col gap-2">
                  <label htmlFor={`${theme.id}-email`} className={theme.fieldLabelClass}>
                    Work email
                  </label>
                  <input
                    id={`${theme.id}-email`}
                    type="email"
                    placeholder="you@megeredchianlaw.com"
                    autoComplete="off"
                    className={theme.fieldClass}
                    style={{ transition: `box-shadow 500ms ${EASE}, border-color 500ms ${EASE}` }}
                  />
                </div>
                <div>
                  <button type="button" className={theme.ctaClass} style={{ transition: `transform 500ms ${EASE}` }}>
                    Continue
                    <span className={theme.ctaIconClass} style={{ transition: `transform 500ms ${EASE}` }}>
                      <ArrowUpRight />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* 6 — motion note + deviation footnote */}
        <Reveal delayMs={250}>
          <p className={`max-w-2xl text-sm ${theme.bodyClass}`}>
            Motion: 800ms {EASE} fade-up reveals, staggered 100–250ms; press = scale 0.98; icon
            drifts on hover. Reduced-motion renders everything static. {theme.footnote}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export function DesignSampler() {
  return (
    <div className={`${geist.variable} ${fraunces.variable} ${jakarta.variable} min-h-[100dvh]`}>
      <header className="bg-[#050505] px-4 pb-4 pt-10 text-white md:px-12">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-white/60" style={{ fontFamily: "var(--font-sampler-grotesk)" }}>
            Design sampler — prototype only, fixture content
          </p>
          <nav aria-label="Archetypes" className="flex gap-2">
            {THEMES.map((theme) => (
              <a
                key={theme.id}
                href={`#${theme.id}`}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60"
                style={{ fontFamily: "var(--font-sampler-grotesk)" }}
              >
                {theme.name}
              </a>
            ))}
          </nav>
        </div>
      </header>
      {THEMES.map((theme, index) => (
        <ArchetypeSection key={theme.id} theme={theme} index={index} />
      ))}
    </div>
  );
}
