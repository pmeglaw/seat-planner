"use client";

// Admin v13 — Ethereal Glass editor concept. Chrome (rail, top bar, draft map
// stage) lands in this task; inspector, unsaved pill, and publish-review
// dialog land in the next. Class-string vocabulary is copied verbatim from
// app/concepts/viewer-v13/ViewerV13.tsx wherever a matching field exists —
// concepts never import from each other, so this is a deliberate duplication.
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
import { FIXTURE_SEATS, type FixtureSeat } from "./fixtureSeats";

const geist = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-adm13-grotesk",
  display: "swap"
});

const EASE = "cubic-bezier(0.32,0.72,0,1)";

type AdminGlassTheme = {
  pageClass: string;
  backdrop: ReactNode;
  railClass: string;
  railItemClass: string;
  railItemActiveClass: string;
  topBarClass: string;
  eyebrowClass: string;
  headingClass: string;
  bodyClass: string;
  // map card (double-bezel)
  shellClass: string;
  coreClass: string;
  // markers
  markerAssignedClass: string;
  markerAvailableClass: string;
  markerSelectedClass: string;
  // status pill (Task 3 wires the two-state swap)
  pillClass: string;
  pillUnsavedClass: string;
  // buttons
  buttonPrimaryClass: string;
  buttonGhostClass: string;
  // inspector panel (Task 3)
  panelClass: string;
  fieldLabelClass: string;
  // publish-review dialog (Task 3)
  dialogOverlayClass: string;
  dialogClass: string;
  diffRowClass: string;
};

const ADMIN_GLASS: AdminGlassTheme = {
  pageClass: "bg-[#050505] text-white",
  backdrop: (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,122,31,0.22),transparent_65%)]" />
      <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,122,31,0.10),transparent_65%)]" />
    </div>
  ),
  railClass:
    "fixed left-0 inset-y-0 z-20 flex w-12 flex-col items-center gap-1 border-r border-white/10 bg-black/40 py-4 backdrop-blur-md",
  railItemClass:
    "flex h-9 w-9 items-center justify-center rounded-full text-white/50 outline-none transition-colors hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-[#FF7A1F]",
  railItemActiveClass:
    "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF7A1F]",
  topBarClass: "flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6",
  eyebrowClass:
    "inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/70",
  headingClass: "text-4xl font-semibold tracking-tight text-white md:text-6xl",
  bodyClass: "text-base font-light leading-relaxed text-white/60",
  shellClass: "rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10",
  coreClass: "relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[#0b0b0d] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]",
  markerAssignedClass:
    "rounded-full border border-[#FF7A1F]/60 bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A1F]",
  markerAvailableClass:
    "rounded-full border border-white/25 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-white/70",
  markerSelectedClass: "scale-110 ring-2 ring-[#FF7A1F] ring-offset-2 ring-offset-[#0b0b0d]",
  pillClass:
    "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF7A1F]",
  pillUnsavedClass:
    "inline-flex items-center gap-1.5 rounded-full border border-[#FF7A1F]/60 bg-[#FF7A1F]/15 px-3 py-1.5 text-xs font-medium text-[#ffb694] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF7A1F]",
  buttonPrimaryClass:
    "inline-flex items-center justify-center rounded-full bg-[#FF7A1F] px-5 py-2 text-sm font-semibold text-black outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#FF7A1F] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
  buttonGhostClass:
    "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white/70 outline-none transition-transform hover:text-white active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#FF7A1F]",
  panelClass:
    "rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] md:w-[360px]",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-white/50",
  dialogOverlayClass: "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm",
  dialogClass:
    "w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b0b0d] p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]",
  diffRowClass:
    "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70"
};

function MapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17.5" cy="8.5" r="2.25" />
      <path d="M15.5 14.25c2.5.25 4.5 2.1 4.5 4.75" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.6 6.6l1.8 1.8M17.6 15.6l1.8 1.8M3 12h2.5M18.5 12H21M4.6 17.4l1.8-1.8M17.6 8.4l1.8-1.8" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c.6 3.4 2.1 4.9 5.5 5.5-3.4.6-4.9 2.1-5.5 5.5-.6-3.4-2.1-4.9-5.5-5.5C9.9 7.9 11.4 6.4 12 3Z" />
      <path d="M18.5 15c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5Z" />
    </svg>
  );
}

type RailItem = {
  key: string;
  label: string;
  icon: () => ReactNode;
  active: boolean;
};

const RAIL_ITEMS: RailItem[] = [
  { key: "map", label: "Map", icon: MapIcon, active: true },
  { key: "people", label: "People", icon: PeopleIcon, active: false },
  { key: "settings", label: "Settings", icon: SettingsIcon, active: false },
  { key: "ask-planner", label: "Ask Planner", icon: SparkleIcon, active: false }
];

// Reveal-on-scroll with a reduced-motion guard. Reduced motion (or no
// IntersectionObserver) => content is simply visible; no translation, no blur.
// Copied verbatim from app/concepts/viewer-v13/ViewerV13.tsx — concepts
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

export function AdminV13() {
  const visualSeats = useMemo(() => seatsToVisualSeats(FIXTURE_SEATS), []);
  const [selectedSeatKey, setSelectedSeatKey] = useState<string | null>(null);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedSeat = useMemo(
    () => visualSeats.find((seat) => seat.seat_key === selectedSeatKey) ?? null,
    [visualSeats, selectedSeatKey]
  );

  // Marker buttons are always mounted (independent of selection state), so
  // returning focus to one on close is a direct, synchronous DOM lookup —
  // no effect/RAF needed, unlike the dialog's open-focus below which targets
  // an element that doesn't exist until it mounts.
  function closeInspector() {
    const key = selectedSeatKey;
    setSelectedSeatKey(null);
    if (key) {
      document.querySelector<HTMLButtonElement>(`[data-seat-key="${key}"]`)?.focus();
    }
  }

  function handleMockAction() {
    setHasUnsavedEdits(true);
  }

  function openPublishReview(trigger: HTMLButtonElement) {
    dialogTriggerRef.current = trigger;
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    dialogTriggerRef.current?.focus();
  }

  function handlePublish() {
    setHasUnsavedEdits(false);
    closeDialog();
  }

  return (
    <div
      className={`${geist.variable} relative min-h-[100dvh] ${ADMIN_GLASS.pageClass}`}
      style={{ fontFamily: "var(--font-adm13-grotesk)" }}
    >
      {ADMIN_GLASS.backdrop}

      <nav aria-label="Admin sections" className={ADMIN_GLASS.railClass}>
        {RAIL_ITEMS.map((item) => (
          <div key={item.key} className="relative flex w-full items-center justify-center">
            {item.active ? (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#FF7A1F]"
              />
            ) : null}
            <button
              type="button"
              aria-label={item.label}
              aria-current={item.active ? "page" : undefined}
              className={item.active ? ADMIN_GLASS.railItemActiveClass : ADMIN_GLASS.railItemClass}
            >
              <item.icon />
            </button>
          </div>
        ))}
      </nav>

      <main className="relative pl-12">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 md:px-10 md:py-16">
          <Reveal delayMs={0}>
            <header className={ADMIN_GLASS.topBarClass}>
              <div>
                <p className={ADMIN_GLASS.eyebrowClass}>ADMIN V13 — GLASS EDITOR CONCEPT</p>
                <h1 className={`mt-4 ${ADMIN_GLASS.headingClass}`}>Draft floor plan.</h1>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    if (hasUnsavedEdits) openPublishReview(event.currentTarget);
                  }}
                  className={hasUnsavedEdits ? ADMIN_GLASS.pillUnsavedClass : ADMIN_GLASS.pillClass}
                >
                  {hasUnsavedEdits ? "2 unsaved edits · not visible to viewers" : "Published · draft in sync"}
                </button>
                <button
                  type="button"
                  onClick={(event) => openPublishReview(event.currentTarget)}
                  className={ADMIN_GLASS.buttonPrimaryClass}
                >
                  Publish
                </button>
              </div>
            </header>
          </Reveal>

          <Reveal delayMs={100}>
            <p className={`${ADMIN_GLASS.bodyClass} text-sm`}>
              Draft layer — edits here never reach viewers until publish.
            </p>
          </Reveal>

          <Reveal delayMs={200}>
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className={`${ADMIN_GLASS.shellClass} md:flex-1`}>
                <div className={ADMIN_GLASS.coreClass}>
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
                    {visualSeats.map((seat) => {
                      const isSelected = selectedSeatKey === seat.seat_key;
                      const statusClass = seat.full_name
                        ? ADMIN_GLASS.markerAssignedClass
                        : ADMIN_GLASS.markerAvailableClass;
                      return (
                        <button
                          key={seat.seat_key}
                          type="button"
                          data-seat-key={seat.seat_key}
                          aria-label={seat.full_name ? `${seat.label} — ${seat.full_name}` : `${seat.label} — open seat`}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedSeatKey(seat.seat_key)}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 hover:scale-110 ${statusClass}${
                            isSelected ? ` ${ADMIN_GLASS.markerSelectedClass}` : ""
                          }`}
                          style={{ ...pointToStyle(seat), transition: `transform 400ms ${EASE}` }}
                        >
                          {seat.full_name ? shortName(seat.full_name) : seat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {selectedSeat ? (
                <InspectorPanel seat={selectedSeat} onClose={closeInspector} onMockAction={handleMockAction} />
              ) : null}
            </div>
          </Reveal>
        </div>
      </main>

      {dialogOpen ? <PublishReviewDialog onKeepEditing={closeDialog} onPublish={handlePublish} /> : null}
    </div>
  );
}

function InspectorPanel({
  seat,
  onClose,
  onMockAction
}: {
  seat: FixtureSeat;
  onClose: () => void;
  onMockAction: () => void;
}) {
  // Reuses useReveal's IntersectionObserver + reduced-motion mechanics (the
  // file's existing entry-animation helper) rather than the <Reveal> wrapper,
  // because Reveal hardcodes a translateY recipe and this panel needs
  // translate-x per the design brief.
  const { ref, state } = useReveal();
  const hidden = state === "pending";
  const style: CSSProperties =
    state === "static"
      ? {}
      : {
          transition: `transform 400ms ${EASE}, opacity 400ms ${EASE}`,
          transform: hidden ? "translateX(2rem)" : "translateX(0)",
          opacity: hidden ? 0 : 1
        };

  return (
    <div ref={ref} style={style} className={`${ADMIN_GLASS.panelClass} flex flex-col gap-5`}>
      <div className="flex items-start justify-between gap-3">
        <span className={ADMIN_GLASS.eyebrowClass}>
          {seat.label} · {seat.zone}
        </span>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 outline-none transition-colors hover:bg-white/5 hover:text-white/80 focus-visible:ring-2 focus-visible:ring-[#FF7A1F]"
        >
          ×
        </button>
      </div>

      <p className="text-xl font-semibold text-white">{seat.full_name ?? "Open seat"}</p>

      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <dt className={ADMIN_GLASS.fieldLabelClass}>Position</dt>
          <dd className="text-sm text-white/70">{seat.position ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className={ADMIN_GLASS.fieldLabelClass}>Extension</dt>
          <dd className="text-sm text-white/70">{seat.phone_extension ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className={ADMIN_GLASS.fieldLabelClass}>Department</dt>
          <dd className="text-sm text-white/70">{seat.emp_department ?? "—"}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={onMockAction} className={ADMIN_GLASS.buttonPrimaryClass}>
          Reassign seat
        </button>
        <button type="button" onClick={onMockAction} className={ADMIN_GLASS.buttonGhostClass}>
          Clear assignment
        </button>
      </div>
    </div>
  );
}

function PublishReviewDialog({
  onKeepEditing,
  onPublish
}: {
  onKeepEditing: () => void;
  onPublish: () => void;
}) {
  const { ref, state } = useReveal();

  // Move focus into the dialog on mount. Not a setState-in-effect (only a DOM
  // focus() call), so it doesn't add to the file's one known eslint warning.
  useEffect(() => {
    ref.current?.focus();
  }, [ref]);

  // Esc closes from anywhere inside the dialog. Subscribing to an external
  // event and calling setState from its callback (not from the effect body)
  // is the pattern react-hooks/set-state-in-effect explicitly allows.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onKeepEditing();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onKeepEditing]);

  const hidden = state === "pending";
  const style: CSSProperties =
    state === "static"
      ? {}
      : {
          transition: `transform 300ms ${EASE}, opacity 300ms ${EASE}`,
          transform: hidden ? "scale(0.96)" : "scale(1)",
          opacity: hidden ? 0 : 1
        };

  return (
    <div className={ADMIN_GLASS.dialogOverlayClass}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-v13-publish-review-heading"
        style={style}
        className={ADMIN_GLASS.dialogClass}
      >
        <h2 id="admin-v13-publish-review-heading" className="text-xl font-semibold text-white">
          Review before publishing
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          <div className={ADMIN_GLASS.diffRowClass}>
            <span>W07 — assign Patrick M.</span>
            <span aria-hidden className="font-semibold text-[#FF7A1F]">+</span>
          </div>
          <div className={ADMIN_GLASS.diffRowClass}>
            <span>SE03 — clear assignment</span>
            <span aria-hidden className="font-semibold text-white/50">−</span>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onKeepEditing} className={ADMIN_GLASS.buttonGhostClass}>
            Keep editing
          </button>
          <button type="button" onClick={onPublish} className={ADMIN_GLASS.buttonPrimaryClass}>
            Publish to viewers
          </button>
        </div>
      </div>
    </div>
  );
}

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : fullName;
}
