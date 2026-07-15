import Image from "next/image";
import Link from "next/link";

/**
 * The Shell chrome bar for admin sub-pages (Management, Settings).
 *
 * Mirrors the seat-map header (components/seat-map/SeatMap.tsx) exactly —
 * same 40px dark bar, brand chip, tool styling, and Viewer/Admin surface
 * shortcuts with the Carbon-style orange underline — so /admin,
 * /admin/management, and /admin/settings read as one continuous surface.
 * Stateless on purpose: map-only tools (search, undo/redo, publish) stay in
 * the map header; this bar only carries identity and navigation.
 */

const toolLink =
  "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[12.5px] font-medium leading-none text-[var(--admin-chrome-muted)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
const toolLinkActive =
  "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-[var(--admin-primary)] bg-[var(--admin-chrome-hover)] px-2.5 text-[12.5px] font-medium leading-none text-[var(--admin-chrome-text)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
const surfaceShortcut =
  "flex h-10 w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-[10px] font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

type AdminShellPage = "management" | "settings";

export function AdminShellBar({ page }: { page: AdminShellPage }) {
  return (
    /* z-50 matches the seat-map bar: the chrome tier sits above z-40 page
       overlays so scrolled content never paints over the pinned bar. */
    <header className="sticky top-0 z-50 flex h-10 shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-white">
          <Image src="/images/megeredchian-mark.png?v=tight" alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
        </span>
        {/* leading-[18px], not leading-none: truncate's overflow-hidden clips descenders (the g) at line-height 1. */}
        <div className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-[18px] sm:block">
          Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
        </div>
      </div>

      <span aria-hidden="true" className="mx-2.5 h-[22px] w-px shrink-0 bg-[var(--admin-chrome-border)]" />

      <nav aria-label="Admin sections" className="flex h-full min-w-0 items-center">
        <Link href="/admin" className={toolLink}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
            <path d="M3 5.5 8 3.5v11L3 16.5v-11ZM8 3.5l4 2v11l-4-2M12 5.5l5-2v11l-5 2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Seat map
        </Link>
        <Link
          href="/admin/management"
          aria-current={page === "management" ? "page" : undefined}
          className={page === "management" ? toolLinkActive : toolLink}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
            <circle cx="7" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.8 16v-.6a4.2 4.2 0 0 1 8.4 0v.6" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="14" cy="6.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 10.4a3.6 3.6 0 0 1 4.2 3.4v.6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Management
        </Link>
      </nav>

      <div className="ml-auto flex h-full shrink-0 items-center">
        <div className="hidden h-full items-center sm:flex">
          <Link
            href="/"
            aria-label="Open viewer surface"
            title="Viewer — published map"
            className={[surfaceShortcut, "border-transparent text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]"].join(" ")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Viewer
          </Link>
          <Link
            href="/admin"
            aria-current="true"
            title="Admin — draft planning"
            className={[surfaceShortcut, "border-[var(--admin-primary)] text-white"].join(" ")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="3.1" />
              <path d="M3.5 20v-1.4a4.6 4.6 0 0 1 4.6-4.6h1.6a4.6 4.6 0 0 1 2.3.6" />
              <path d="M14.5 18.4l2 2 4.2-4.6" />
            </svg>
            Admin
          </Link>
        </div>
        {/* The identity chip is the Settings entry — data utilities are
            management-adjacent, so they live behind this chip instead of a
            separate nav item. Labeled + aria-current on the settings page. */}
        <Link
          href="/admin/settings"
          aria-label="Open settings"
          aria-current={page === "settings" ? "page" : undefined}
          title="Settings — data utilities and recovery"
          className={[
            "mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-chrome-bg)]",
            page === "settings" ? "bg-white text-[var(--admin-primary)] ring-2 ring-[var(--admin-primary)]" : "bg-[var(--admin-primary)] text-[var(--admin-primary-ink)] hover:brightness-110"
          ].join(" ")}
        >
          A
        </Link>
      </div>
    </header>
  );
}
