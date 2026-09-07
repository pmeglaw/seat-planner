import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
// The two Plex families live in app/fonts/plex.ts (one declaration, shared
// with app/global-error.tsx, which replaces <html> and needs them too).
import { plexFontClassName } from "@/app/fonts/plex";
// Stylesheet order is a contract (redesign-v2 PHASE3DS §5 item 3, Phase 4 PR 1):
// the Tailwind preflight in globals.css sits UNDER the design system, then the
// two skill assets (never edited), the product semantic layer, the hand-built
// components, and last the temporary Phase 4 bridge (font variables + retired
// aliases, deleted per sweep PR).
import "./globals.css";
import "./styles/carbon-tokens.css";
import "./styles/sp-tokens.css";
import "./styles/brand/megeredchian-law-tokens.css"; // brand layer: AFTER carbon + sp tokens, BEFORE components
import "./styles/carbon-components.css";
import "./styles/sp-components.css";
import "./styles/phase4-bridge.css";

// App-wide theme boot: replays the stored choice onto html[data-theme] and the
// derived html[data-carbon-theme] before paint (lib/theme.ts owns the script
// and the derivation; see its header for the three-state model). An empty
// store sets nothing — "system" — and the design system's OS-preference guard
// renders dark for a dark OS. suppressHydrationWarning on <html> covers the
// server-markup mismatch this deliberately creates.

export const metadata: Metadata = {
  title: "Seat Planner",
  description: "Internal interactive office seating map"
};

// Gray 100 — the header colour in both themes (PHASE3DS tier C) — so mobile
// browser UI blends with the bar it sits against (#200). The one hex outside
// the token files: Next's Viewport wants a string (ledgered in
// tests/phase4-token-layer-source.test.mjs).
export const viewport: Viewport = {
  themeColor: "#161616"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={plexFontClassName} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
