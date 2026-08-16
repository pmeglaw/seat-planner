import Link from "next/link";
import { preload } from "react-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { MAP_IMAGE_SRC } from "@/lib/mapLayoutTransform";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Warm the floor-plan raster while the user types their credentials: the
  // map page's own priority preload only starts at navigation, which is what
  // made the image visibly decode top-down right after sign-in. Design 1e
  // also RENDERS this exact URL as the brand panel's faded graphic, so the
  // decorative image and the warmed cache are one request.
  preload(MAP_IMAGE_SRC, { as: "image", fetchPriority: "low" });

  // A signed-in visitor (bookmark, back button, stale magic-link email) gets
  // a continue/sign-out card instead of a fresh credential form — the form
  // implied no session existed and silently replaced it on re-submit.
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Same "max updated_at over published seats IS the last publish moment"
  // reading the viewer uses (app/page.tsx) — publish_seat_map() re-inserts
  // every published row, so no extra table is exposed. Seats are RLS'd
  // `to authenticated`, so a signed-out visitor gets no rows (or no grant at
  // all); the status line then falls back to the pre-1e "internal use only"
  // tail rather than inventing a date.
  let lastPublishedLabel: string | null = null;
  try {
    const { data: latest } = await supabase
      .from("seats")
      .select("updated_at")
      .eq("layer", "published")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.updated_at) {
      lastPublishedLabel = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles"
      }).format(new Date(latest.updated_at));
    }
  } catch {
    // Unreachable database — the brand panel simply omits the publish date.
  }

  return (
    // Split screen (design 1e, Carbon v12 direction): dark brand panel left
    // (flex 1.2 — constant #161616 in BOTH themes), themed form pane right
    // (flex 1, form column 368px centered). Below lg they stack: the brand
    // panel collapses to a compact header (mark + wordmark + title) and the
    // floor-plan graphic / tagline / status furniture hides.
    <main className="login-theme flex min-h-screen flex-col bg-[var(--login-bg)] lg:flex-row lg:items-stretch">
      <section className="relative flex flex-col overflow-hidden bg-[var(--login-panel-bg)] p-8 lg:min-w-0 lg:flex-[1.2] lg:p-12">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand
              mark, same intentional raw-img pattern as app/admin/page.tsx */}
          <img
            src="/images/megeredchian-mark.png?v=ma-2026-128"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
          <span translate="no" className="text-[14px] font-semibold leading-none text-[var(--login-panel-text)]">
            Megeredchian Law
          </span>
        </div>

        {/* Faded floor plan with story details — decorative (the real map sits
            behind auth), so the whole cluster is hidden from AT and from the
            compact stacked header. */}
        <div aria-hidden="true" className="relative my-auto hidden w-[620px] max-w-full self-center lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative
              copy of the already-preloaded map raster; next/image would mint a
              second URL and defeat the shared warm-up above */}
          <img
            src={MAP_IMAGE_SRC}
            alt=""
            width={3822}
            height={1734}
            className="block h-auto w-full opacity-[0.16] invert [-webkit-mask-image:radial-gradient(85%_85%_at_50%_50%,#000_55%,transparent_100%)] [mask-image:radial-gradient(85%_85%_at_50%_50%,#000_55%,transparent_100%)]"
          />
          <span className="absolute left-[37%] top-[62%] h-2.5 w-2.5 rounded-full bg-[var(--login-accent)] shadow-[0_0_0_3px_rgba(184,82,7,0.35)] motion-safe:animate-[login-dot-pulse_2.4s_infinite]" />
          <span className="absolute left-[34%] top-[44%] h-[7px] w-[7px] rounded-full border-[1.5px] border-[var(--login-panel-outline)]" />
          <span
            translate="no"
            className="absolute left-[39%] top-[56%] font-mono text-[9px] font-semibold tracking-[0.4px] text-[var(--login-panel-text-faint)]"
          >
            C05
          </span>
        </div>

        <div className="mt-8 max-w-[520px] lg:mt-0">
          <span aria-hidden="true" className="mb-6 block h-[3px] w-12 bg-[var(--login-accent)]" />
          <h1 className="text-[42px] font-light leading-[1.2] text-[var(--login-panel-text)]">Seat Planner</h1>
          <p className="mt-3.5 hidden text-[15px] leading-[1.55] text-[var(--login-panel-text-soft)] lg:block">
            The internal seating map — who sits where,
            <br />
            across every floor we occupy.
          </p>
          <p className="mt-7 hidden items-center gap-2 font-mono text-[11px] leading-none text-[var(--login-panel-text-faint)] lg:flex">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--login-publish-dot)]" />
            <span translate="no">seats.megeredchianlaw.com</span>
            <span aria-hidden="true" className="text-[var(--login-panel-divider)]">
              ·
            </span>
            <span>{lastPublishedLabel ? `Published ${lastPublishedLabel}` : "internal use only"}</span>
          </p>
        </div>
      </section>

      <section className="grid flex-1 place-items-center bg-[var(--login-bg)] px-6 py-10 sm:px-10">
        {/* One-shot Carbon entrance (500ms, entrance curve) for whichever card
            renders; motion-safe: keeps reduced-motion visitors static. */}
        <div className="w-full max-w-[368px] motion-safe:animate-[login-rise-in_0.5s_cubic-bezier(0,0,0.38,0.9)_both]">
          {user?.email ? (
            <div className="flex flex-col">
              <h2 className="text-[28px] font-normal leading-[1.25] text-[var(--login-text-primary)]">
                Already signed in
              </h2>
              <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--login-text-secondary)]">
                You’re signed in as{" "}
                <span className="font-semibold text-[var(--login-text-primary)]">{user.email}</span>.
              </p>
              <Link
                href="/"
                className="mt-6 flex h-12 w-full items-center justify-between gap-3 bg-[var(--login-accent)] px-4 text-[13.5px] font-medium leading-none text-white hover:bg-[var(--login-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2"
              >
                Continue to seat map
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
                </svg>
              </Link>
              <form action="/auth/signout" method="post" className="mt-3">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center border border-[var(--login-border-strong)] bg-transparent px-4 text-[13px] leading-none text-[var(--login-text-primary)] transition-colors hover:bg-[var(--login-field-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                >
                  Sign out
                </button>
              </form>
              <p className="mt-[22px] text-[11px] leading-[1.5] text-[var(--login-text-tertiary)]">
                Trouble signing in? <span className="text-[var(--login-link)]">Contact the office administrator</span>{" "}
                — accounts are provisioned by the firm.
              </p>
            </div>
          ) : (
            <LoginForm />
          )}
        </div>
      </section>
    </main>
  );
}
