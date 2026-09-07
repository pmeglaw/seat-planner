"use client";

import { useEffect } from "react";
import { ErrorGlyph } from "@/components/ui/ErrorGlyph";
import { plexFontClassName } from "@/app/fonts/plex";
import { applyThemeAttributes, THEME_BOOT_SCRIPT, THEME_DARK, THEME_LIGHT, THEME_STORAGE_KEY } from "@/lib/theme";
// The file replaces <html> entirely, so the root layout's stylesheets are not
// in the document: they are imported here in the same contracted order
// (PHASE3DS §5 item 3; app/layout.tsx). CSS and next/font/local are resolved
// at BUILD time — the boundary gains no runtime dependency it could fail on.
import "./globals.css";
import "./styles/carbon-tokens.css";
import "./styles/sp-tokens.css";
import "./styles/brand/megeredchian-law-tokens.css";
import "./styles/carbon-components.css";
import "./styles/sp-components.css";
import "./styles/phase4-bridge.css";

// Last-resort boundary: catches errors thrown by the ROOT layout itself, which
// app/error.tsx and the segment boundaries can never see (they render inside
// it). It replaces <html>, so it carries its own head: the stylesheets above,
// the Plex variables (app/fonts/plex.ts, shared with the root layout) and the
// theme boot script. The boundary is rendered on the CLIENT after the root
// layout throws, and a script inserted through dangerouslySetInnerHTML never
// executes there (the PR 5 capture found both themes rendering light) — so a
// mount effect replays the stored choice through the same derivation
// (lib/theme applyThemeAttributes); nothing stored → the system state decides
// (PHASE4BUILD §1 O-7). The inline script stays for the server-rendered path.
//
// Phase 4 PR 5: the route card in the design system (PHASE3DS §1.29 / sheet
// block 28) replaced the ten inline hex values this file carried while the
// token layer was unreachable from it. The tertiary sits on the WHITE card
// (layer-02), never layer-01 (PHASE4BUILD §1.22) — inline, because the sheet
// paints `.sp-route-card` layer-01 and a utility class loses to that later rule.
//
// As with the route boundaries, only `digest` is surfaced — in production Next
// has already replaced the thrown message with it, and the raw message would
// leak internals for no user benefit.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      stored = null;
    }
    applyThemeAttributes(document.documentElement, stored === THEME_DARK || stored === THEME_LIGHT ? stored : null);
  }, []);

  return (
    <html lang="en" className={plexFontClassName} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--sp-background)] px-6 py-12 text-[var(--sp-text-primary)]">
          <section className="sp-route-card w-full" style={{ background: "var(--sp-layer-02)" }}>
            <div className="cds-empty">
              <h2>
                <ErrorGlyph />
                The app could not start
              </h2>
              <p>
                Something failed before the page could render at all. The seating data is unchanged — this is a
                display problem, not a data one.
              </p>
              <div className="cds-empty-actions">
                <button type="button" className="cds-btn cds-btn--tertiary cds-btn--md" onClick={reset}>
                  Try again
                </button>
              </div>
              {error.digest ? <p className="sp-digest">Reference: {error.digest}</p> : null}
            </div>
          </section>
          <p className="sp-digest">seats.megeredchianlaw.com · internal use only</p>
        </main>
      </body>
    </html>
  );
}
