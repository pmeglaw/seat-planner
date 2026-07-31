import Image from "next/image";

/**
 * Identity-only chrome bar for the admin sub-pages (Management, Settings).
 *
 * v12 (2026-07-31 rail shell, Task 3): navigation and the account menu moved
 * to the left rail (components/ui/AppRail.tsx), which every /admin* page now
 * mounts directly. This bar's whole job is the skip link + brand block that
 * anchor every admin surface — no section nav, no Viewer shortcut, no
 * account menu. Stateless on purpose, same as before: it takes no props.
 */
export function AdminShellBar() {
  return (
    /* z-50 matches the seat-map bar and the rail: the chrome tier sits above
       z-40 page overlays so scrolled content never paints over the pinned bar. */
    <header className="sticky top-0 z-50 flex h-[var(--admin-chrome-h)] shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
      {/* Same skip affordance as the map surfaces: first focusable jumps the
          chrome straight to the page content (#202). */}
      <a
        href="#admin-subpage-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-11 focus:z-[60] focus:border focus:border-[var(--admin-primary)] focus:bg-[var(--admin-surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--admin-text-primary)]"
      >
        Skip to content
      </a>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
          <Image src="/images/megeredchian-mark.png?v=ma-2026" alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
        </span>
        {/* leading-[18px], not leading-none: truncate's overflow-hidden clips descenders (the g) at line-height 1. */}
        <div translate="no" className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-[18px] sm:block">
          Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
        </div>
      </div>
    </header>
  );
}
