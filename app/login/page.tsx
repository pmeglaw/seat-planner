import { preload } from "react-dom";
import { LoginForm } from "@/components/auth/LoginForm";
import { MAP_IMAGE_SRC } from "@/lib/mapLayoutTransform";

export default function LoginPage() {
  // Warm the floor-plan raster while the user types their credentials: the
  // map page's own priority preload only starts at navigation, which is what
  // made the image visibly decode top-down right after sign-in.
  preload(MAP_IMAGE_SRC, { as: "image", fetchPriority: "low" });
  return (
    <main className="shell-theme flex min-h-screen flex-col bg-[var(--admin-chrome-bg)] px-6 pb-8 pt-10 sm:px-12 lg:px-[9vw]">
      <div className="mx-auto flex w-full max-w-[1110px] flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-20">
        <section className="w-full max-w-[440px] shrink-0 lg:max-w-[340px]">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center bg-[var(--admin-primary)] text-[22px] font-semibold text-[var(--admin-primary-ink)]"
          >
            M
          </span>
          <p className="mt-5 text-[28px] font-semibold leading-9 text-[var(--admin-chrome-text)] sm:text-[34px] sm:leading-[42px]">
            Megeredchian Law
            <br />
            Seat Planner
          </p>
          <p className="mt-5 max-w-[320px] text-[15px] leading-snug text-[var(--admin-chrome-muted)]">
            The internal seating map — who sits where, across every floor we occupy.
          </p>
        </section>

        <LoginForm />
      </div>

      <p className="mt-10 shrink-0 font-mono text-[11px] text-[var(--admin-chrome-muted)]">
        seats.megeredchianlaw.com · internal use only
      </p>
    </main>
  );
}
