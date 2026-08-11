import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { THEME_DARK, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

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

// App-wide theme boot (Reception handoff): html[data-theme] set to THEME_DARK
// is THE global theme switch — today only Reception's --r-* tokens react, so
// every other surface renders identically until it grows dark tokens. Runs
// synchronously before paint to avoid a light flash; suppressHydrationWarning
// on <html> covers the server-markup mismatch this deliberately creates. The
// key/value literals are interpolated from lib/theme.ts at build time so the
// boot replay and ThemeToggle can never disagree.
const THEME_BOOT_SCRIPT =
  `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='${THEME_DARK}')document.documentElement.dataset.theme='${THEME_DARK}'}catch(e){}`;

export const metadata: Metadata = {
  title: "Seat Planner",
  description: "Internal interactive office seating map"
};

// Matches the dark top chrome (--admin-chrome-bg) so mobile browser UI blends
// with the bar it sits against (#200).
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
