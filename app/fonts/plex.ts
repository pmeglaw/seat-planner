import localFont from "next/font/local";

// The one declaration of the app's two typefaces (redesign-v2 Phase 4 PR 5,
// PHASE4BUILD §1 O-7). app/layout.tsx puts the variables on <html>;
// app/global-error.tsx — which replaces <html> entirely — needs the same
// families, so both import from here rather than each calling localFont.
//
// The woff2 files are vendored beside this module (see README.md for
// provenance). next/font/google self-hosts too, but it downloads the binaries
// from fonts.gstatic.com at BUILD time — so a CDN hiccup failed CI and would
// fail a deploy. Reading them off disk removes that dependency.
//
// Each family mirrors the form Google was serving, so the rendering path is
// unchanged: sans is ONE variable file carrying the wght axis, mono is three
// static cuts (IBM Plex Mono has no variable release). Declaring the axis range
// is what makes it a variable face — without `weight`, the emitted @font-face
// has no font-weight descriptor and the axis is never exercised.
//
// The axis stops at 700, exactly as Google's did, so `font-extrabold` (800) on
// seat markers resolves to 700 here and in the previous build alike.
export const plexSans = localFont({
  src: [{ path: "./ibm-plex-sans-latin-wght-normal.woff2", weight: "100 700", style: "normal" }],
  variable: "--font-sans",
  display: "swap"
});

export const plexMono = localFont({
  src: [
    { path: "./ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    // 600 exists for the Reception extension readout's row figures (code-02).
    { path: "./ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" }
  ],
  variable: "--font-mono",
  display: "swap"
});

// The className that puts both variables on <html>.
export const plexFontClassName = `${plexSans.variable} ${plexMono.variable}`;
