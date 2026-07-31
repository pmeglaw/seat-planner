"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PROTOTYPE ONLY — v12 left navigation rail (handoff §1), mocked so the
 * geometry, states and motion can be judged before any of it is wired into
 * app/admin/layout.tsx.
 *
 * COLLAPSED WIDTH DEVIATES FROM §1 BY OWNER INSTRUCTION: the handoff specifies
 * a 48px collapsed rail, but the top chrome stayed at its original height, so
 * the rail now tracks --admin-chrome-h (36px) — the match is structural, not a
 * coincidence, and the hamburger cell reads the same token so the two stay in
 * one column if the bar ever moves. Knock-on: §1's `padding: 0 15px` was sized
 * for 48px; at 36px the 3px edge + 15px + 18px icon overflows and the glyph
 * lands half-clipped, so the row's padding is state-dependent (see itemRow).
 *
 * FAITHFUL: 232px expanded · 240ms cubic-bezier(.2,0,.38,.9) width
 * transition · 48px items with a 3px left edge · 110ms background and
 * label-opacity fades · labels kept in the DOM so a collapsed rail is still
 * named for screen readers, plus `title` for pointer tooltips · the handoff's
 * icon paths at 17px / stroke-width 1.5 · the three responsive tiers (>=1200
 * free, 900-1199 forced collapsed, <900 overlay drawer with scrim + Escape +
 * focus return to the hamburger) · the 48px hamburger cell that lines the
 * header up with the collapsed rail column.
 *
 * DELIBERATELY ABSENT, because it belongs to step 2 proper: next/link
 * destinations, the unsaved-edits guard, the localStorage preference and its
 * no-flash hydration, and removal of the existing section navs. Items are
 * buttons that set the active row, so every state can be inspected without
 * navigating away from this page.
 *
 * NOT SHIPPED, per §1: the design file's rail footer (role dot + "switch").
 * Identity stays in AccountMenu.
 *
 * Colors come from the repo's own --admin-* tokens rather than the handoff's
 * raw hexes (owner call: match the live palette), so this reads slightly warmer
 * than the design file — chrome text #F7F6F2 not #f4f4f4, muted #B8AEA2 not
 * #a8a8a8, border rgba(255,255,255,.10) not .14. The 3px active edge and the
 * #262626 hover/active surface are unchanged.
 */

type RailTier = "drawer" | "forced-collapsed" | "free";

type RailItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

const ICON = "h-[17px] w-[17px] shrink-0";

const ITEMS: RailItem[] = [
  {
    key: "seat-map",
    label: "Seat map",
    href: "/admin",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={ICON}>
        <path
          d="M3 5.5 8 3.5v11L3 16.5v-11ZM8 3.5l4 2v11l-4-2M12 5.5l5-2v11l-5 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  },
  {
    key: "management",
    // A records table, deliberately NOT a person glyph — the header owns the
    // person icon (§4's People button), and the two must not read as twins.
    label: "Management",
    href: "/admin/management",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={ICON}>
        <rect x="3.5" y="4.5" width="13" height="11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M3.5 8.5h13M8 8.5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    key: "data",
    label: "Data",
    href: "/admin/settings",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={ICON}>
        <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.9 5.1l-1.5 1.5M6.6 13.4l-1.5 1.5M14.9 14.9l-1.5-1.5M6.6 6.6 5.1 5.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  },
  {
    key: "publish",
    label: "Publish",
    href: "/admin",
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={ICON}>
        <path d="M10 15.5V5m0 0 4 4m-4-4-4 4M4 3.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
];

const itemBase =
  "relative flex h-12 w-full items-center whitespace-nowrap border-l-[3px] text-left transition-colors duration-[110ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
// The row inside the button owns the horizontal padding so it can glide on the
// rail's 240ms curve while the button's hover colours stay on §1's 110ms — one
// element cannot carry two durations cleanly, and a padding that snapped
// mid-animation read as a stutter.
const itemRow =
  "flex h-full w-full items-center gap-[14px] transition-[padding] duration-[240ms] ease-[cubic-bezier(.2,0,.38,.9)]";
const itemRowExpanded = "px-[15px]";
// 6px puts the 18px icon cell exactly on the rail's midline once the 3px active
// edge is accounted for: 3 + 6 + 9 = 18, half of a 36px rail. (At §1's 48px the
// icon was never centred either — 3 + 15 + 9 = 27 against a midline of 24 — so
// this is a fix the narrower rail forced rather than a new compromise.)
const itemRowCollapsed = "px-[6px]";
const itemIdle = "border-l-transparent text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]";
const itemActive = "border-l-[var(--admin-primary)] bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)]";

export function NavRailPreview() {
  // User intent only. The effective width also depends on the tier below —
  // 900-1199 forces collapsed regardless of what the user asked for.
  const [open, setOpen] = useState(true);
  const [activeKey, setActiveKey] = useState("seat-map");
  const [tier, setTier] = useState<RailTier>("free");
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const drawer = window.matchMedia("(max-width: 899px)");
    const forced = window.matchMedia("(min-width: 900px) and (max-width: 1199px)");
    const sync = () => setTier(drawer.matches ? "drawer" : forced.matches ? "forced-collapsed" : "free");
    sync();
    drawer.addEventListener("change", sync);
    forced.addEventListener("change", sync);
    return () => {
      drawer.removeEventListener("change", sync);
      forced.removeEventListener("change", sync);
    };
  }, []);

  const isDrawer = tier === "drawer";
  const drawerOpen = isDrawer && open;
  // Below 900 the drawer is full width whenever it is shown; 900-1199 pins it
  // collapsed; above that the user's toggle wins.
  const expanded = isDrawer ? drawerOpen : tier === "forced-collapsed" ? false : open;

  const closeDrawer = useCallback(() => {
    setOpen(false);
    hamburgerRef.current?.focus();
  }, []);

  // §1's Esc rung. In production this slots into SeatMap's existing ladder
  // ABOVE seat-deselect, so Escape closes the drawer before it clears a
  // selection; here it stands alone.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Collapsed width IS the chrome bar's height, read from the same token.
  const railWidthClass = isDrawer || expanded ? "w-[232px]" : "w-[var(--admin-chrome-h)]";

  return (
    <div className="admin-theme flex min-h-screen flex-col bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
      {/* Mock chrome bar. Height tracks --admin-chrome-h, so this is the real
          36px bar the rail will sit under — and the hamburger cell reads the
          same token for its WIDTH, so the cell is square and sits exactly above
          the collapsed rail column no matter what the bar's height becomes. */}
      <header className="sticky top-0 z-[60] flex h-[var(--admin-chrome-h)] shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] text-[var(--admin-chrome-text)]">
        <button
          ref={hamburgerRef}
          type="button"
          onClick={() => setOpen(current => !current)}
          aria-label="Toggle navigation"
          aria-expanded={expanded}
          aria-controls="concept-nav-rail"
          title="Toggle navigation"
          className="flex h-full w-[var(--admin-chrome-h)] shrink-0 items-center justify-center text-[var(--admin-chrome-muted)] transition-colors duration-[110ms] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div translate="no" className="min-w-0 truncate pl-1 text-[12.5px] font-semibold leading-[18px]">
          Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
        </div>
        <span className="ml-auto pr-3 text-[11px] font-medium text-[var(--admin-chrome-muted)]">nav-rail mock · not the real shell</span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Scrim, drawer tier only. */}
        {drawerOpen && (
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeDrawer}
            className="fixed inset-x-0 bottom-0 top-[var(--admin-chrome-h)] z-40 cursor-default bg-black/45"
          />
        )}

        <nav
          id="concept-nav-rail"
          aria-label="Admin sections"
          data-nav-rail
          data-tier={tier}
          data-expanded={expanded}
          className={[
            "shrink-0 overflow-hidden border-r border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pt-2",
            "transition-[width,transform] duration-[240ms] ease-[cubic-bezier(.2,0,.38,.9)]",
            railWidthClass,
            isDrawer
              ? `fixed bottom-0 left-0 top-[var(--admin-chrome-h)] z-50 shadow-[8px_0_24px_rgba(0,0,0,.24)] ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`
              : "z-50"
          ].join(" ")}
        >
          {ITEMS.map(item => {
            const active = item.key === activeKey;
            return (
              <button
                key={item.key}
                type="button"
                data-nav-item={item.key}
                onClick={() => {
                  setActiveKey(item.key);
                  if (isDrawer) closeDrawer();
                }}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={[itemBase, active ? itemActive : itemIdle].join(" ")}
              >
                <span className={[itemRow, expanded ? itemRowExpanded : itemRowCollapsed].join(" ")}>
                  <span className="flex w-[18px] shrink-0 items-center justify-center">{item.icon}</span>
                  {/* Label stays mounted at every width — opacity only — so a
                      collapsed rail is still announced. */}
                  <span
                    className={[
                      "text-[14px] font-normal leading-[1.2] transition-opacity duration-[110ms]",
                      expanded ? "opacity-100" : "opacity-0"
                    ].join(" ")}
                  >
                    {item.label}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 p-6">
          <h1 className="text-lg font-semibold">Nav rail — v12 §1 mock</h1>
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-[var(--admin-text-secondary)]">
            Toggle with the hamburger. Resize the window to cross the tiers. Nothing here navigates, persists, or
            touches the admin shell.
          </p>

          <dl className="mt-5 grid max-w-[520px] grid-cols-[max-content_1fr] gap-x-6 gap-y-2 border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-sm">
            <dt className="font-semibold">Tier</dt>
            <dd className="font-mono text-[13px]">{tier}</dd>
            <dt className="font-semibold">Rail width</dt>
            <dd className="font-mono text-[13px]">{expanded ? "232px" : "36px — matches the chrome bar"}</dd>
            <dt className="font-semibold">Behaviour</dt>
            <dd className="text-[13px] text-[var(--admin-text-secondary)]">
              {tier === "drawer"
                ? "<900 — overlay drawer over a scrim; Escape closes and returns focus to the hamburger"
                : tier === "forced-collapsed"
                  ? "900–1199 — pinned collapsed; the toggle cannot expand it"
                  : "≥1200 — free; the toggle decides"}
            </dd>
          </dl>

          <h2 className="mt-8 text-sm font-semibold">Item states</h2>
          <p className="mt-1 text-[13px] text-[var(--admin-text-secondary)]">
            Rendered statically at 232px so idle, hover and active can be compared without chasing a pointer.
          </p>
          <div className="mt-3 w-[232px] border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] py-2">
            <div className={[itemBase, itemIdle, "pointer-events-none"].join(" ")}>
              <span className={[itemRow, itemRowExpanded].join(" ")}>
                <span className="flex w-[18px] shrink-0 items-center justify-center">{ITEMS[0].icon}</span>
                <span className="text-[14px] font-normal leading-[1.2]">Idle</span>
              </span>
            </div>
            <div className={[itemBase, "pointer-events-none border-l-transparent bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)]"].join(" ")}>
              <span className={[itemRow, itemRowExpanded].join(" ")}>
                <span className="flex w-[18px] shrink-0 items-center justify-center">{ITEMS[1].icon}</span>
                <span className="text-[14px] font-normal leading-[1.2]">Hover</span>
              </span>
            </div>
            <div className={[itemBase, itemActive, "pointer-events-none"].join(" ")}>
              <span className={[itemRow, itemRowExpanded].join(" ")}>
                <span className="flex w-[18px] shrink-0 items-center justify-center">{ITEMS[2].icon}</span>
                <span className="text-[14px] font-normal leading-[1.2]">Active</span>
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
