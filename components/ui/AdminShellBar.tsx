import Image from "next/image";

/**
 * Identity-only chrome bar for the admin sub-pages (Management, Settings).
 *
 * v12 (2026-07-31 rail shell, Task 3): navigation and the account menu moved
 * to the left rail (components/ui/AppRail.tsx), which every /admin* page now
 * mounts directly. This bar's whole job is the brand block that anchors
 * every admin surface — no section nav, no Viewer shortcut, no account menu.
 * Stateless on purpose, same as before: it takes no props.
 *
 * The skip link moved to AppRail's `skipLink` prop (visual-pass fix,
 * 2026-07-31): it rendered here as this header's first child, which put it
 * behind all 7 rail controls in tab order — 8th stop instead of 1st,
 * defeating the point of a skip link. AppRail renders it before its own
 * hamburger, so it's the first focusable on the page.
 */
export function AdminShellBar() {
  return (
    /* z-50 matches the seat-map bar and the rail: the chrome tier sits above
       z-40 page overlays so scrolled content never paints over the pinned bar.
       pl-[3.75rem] = the fixed 3rem rail + the original 0.75rem inset: since
       the persistent shell, this bar is a full-width SIBLING of the rail
       (AppShell) rather than a child of a pl-12 page root, so it must clear
       the rail itself or the brand block renders underneath it. */
    <header className="sticky top-0 z-50 flex h-[var(--admin-chrome-h)] shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-[3.75rem] text-[var(--admin-chrome-text)]">
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
