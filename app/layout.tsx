import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
// Stylesheet order is a contract (redesign-v2 PHASE3DS §5 item 3, Phase 4 PR 1):
// the Tailwind preflight in globals.css sits UNDER the design system, then the
// two skill assets (never edited), the product semantic layer, the hand-built
// components, and last the temporary Phase 4 bridge (font variables + retired
// aliases, deleted per sweep PR).
import "./globals.css";
import "./styles/carbon-tokens.css";
import "./styles/sp-tokens.css";
import "./styles/carbon-components.css";
import "./styles/sp-components.css";
import "./styles/phase4-bridge.css";

// The woff2 files are vendored in app/fonts (see its README for provenance).
// next/font/google self-hosts too, but it downloads the binaries from
// fonts.gstatic.com at BUILD time — so a CDN hiccup failed CI and would fail a
// deploy. Reading them off disk removes that dependency.
//
// Each family mirrors the form Google was serving, so the rendering path is
// unchanged: sans is ONE variable file carrying the wght axis, mono is three
// static cuts (IBM Plex Mono has no variable release). Declaring the axis range
// is what makes it a variable face — without `weight`, the emitted @font-face
// has no font-weight descriptor and the axis is never exercised.
//
// The axis stops at 700, exactly as Google's did, so `font-extrabold` (800) on
// seat markers resolves to 700 here and in the previous build alike.
const plexSans = localFont({
  src: [{ path: "./fonts/ibm-plex-sans-latin-wght-normal.woff2", weight: "100 700", style: "normal" }],
  variable: "--font-sans",
  display: "swap"
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    // 600 exists for Reception's extension readout (46px/600 mono).
    { path: "./fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" }
  ],
  variable: "--font-mono",
  display: "swap"
});

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
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
