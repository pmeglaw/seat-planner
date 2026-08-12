import Link from "next/link";
import { preload } from "react-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { MAP_IMAGE_SRC } from "@/lib/mapLayoutTransform";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Warm the floor-plan raster while the user types their credentials: the
  // map page's own priority preload only starts at navigation, which is what
  // made the image visibly decode top-down right after sign-in.
  preload(MAP_IMAGE_SRC, { as: "image", fetchPriority: "low" });

  // A signed-in visitor (bookmark, back button, stale magic-link email) gets
  // a continue/sign-out card instead of a fresh credential form — the form
  // implied no session existed and silently replaced it on re-submit.
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    // Split screen (canvas 2a/2b): the brand column takes the remaining width
    // on the inverse background, the form column is a fixed 400px of white.
    // Below lg they stack — the brand block first, then the form.
    <main className="shell-theme flex min-h-screen flex-col lg:flex-row lg:items-stretch">
      <section className="flex flex-col bg-[var(--admin-chrome-bg)] px-8 pb-10 pt-12 lg:min-w-0 lg:flex-1 lg:px-14 lg:pb-11 lg:pt-14">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand
            mark, same intentional raw-img pattern as app/admin/page.tsx */}
        <img
          src="/images/megeredchian-mark.png?v=ma-2026"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="h-10 w-10 object-contain"
        />
        <p className="mt-10 text-[32px] font-normal leading-[1.08] tracking-[-0.025em] text-white lg:mt-auto lg:text-[44px]">
          Megeredchian&nbsp;Law
          <br />
          Seat Planner
        </p>
        <p className="mt-[18px] max-w-[300px] text-[14.5px] leading-[1.6] text-[var(--admin-chrome-muted)]">
          The internal seating map — who sits where, across every floor we occupy.
        </p>
        <p className="mt-[34px] font-mono text-[12px] leading-none text-[var(--admin-chrome-disabled)]">
          seats.megeredchianlaw.com · internal use only
        </p>
      </section>

      <section className="flex w-full flex-col bg-[var(--admin-surface)] px-6 py-10 sm:px-10 lg:w-[400px] lg:shrink-0 lg:px-10 lg:py-11">
        {user?.email ? (
          <div className="flex flex-1 flex-col">
            <h1 className="text-[26px] font-normal leading-[1.2] tracking-[-0.015em] text-[var(--admin-text-primary)]">
              Already signed in
            </h1>
            <p className="mt-2.5 text-[13px] text-[var(--admin-text-secondary)]">
              You’re signed in as <span className="font-semibold text-[var(--admin-text-primary)]">{user.email}</span>.
            </p>
            <Link
              href="/"
              className="mt-7 flex min-h-12 w-full items-center bg-[var(--admin-primary-cta)] px-[18px] text-[15px] font-semibold leading-none text-white transition-colors hover:bg-[var(--admin-primary-cta-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] focus-visible:ring-offset-2"
            >
              Continue to seat map
            </Link>
            <form action="/auth/signout" method="post" className="mt-0.5">
              <button
                type="submit"
                className="flex min-h-12 w-full items-center border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-[18px] text-[15px] font-medium leading-none text-[var(--admin-text-primary)] transition-colors hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] focus-visible:ring-offset-2"
              >
                Sign out
              </button>
            </form>
            <span className="min-h-8 flex-1" />
            <p className="text-[12.5px] leading-[1.6] text-[var(--admin-text-muted)]">
              Need help? Accounts are provisioned by the firm — ask an office admin.
            </p>
          </div>
        ) : (
          <LoginForm />
        )}
      </section>
    </main>
  );
}
