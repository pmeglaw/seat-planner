import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    // Shell shape language: flat, square corners on chrome/controls. The named
    // radius scale is zeroed globally; components that must stay rounded (seat
    // pills, avatars, dots) use arbitrary values or `rounded-full`, which this
    // scale does not touch.
    borderRadius: {
      none: "0px",
      sm: "0px",
      DEFAULT: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "9999px",
      "sp-sm": "var(--sp-radius-sm)",
      "sp-md": "var(--sp-radius-md)",
      "sp-lg": "var(--sp-radius-lg)",
      "sp-xl": "var(--sp-radius-xl)",
      "sp-sheet": "var(--sp-radius-sheet)",
      "sp-full": "var(--sp-radius-full)"
    },
    extend: {
      // Default border color follows the greige neutral ramp instead of
      // Tailwind cool gray-200 — recolors every unqualified `border` (2026-07-23).
      borderColor: {
        DEFAULT: "#E7E1D8"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "ui-monospace", "monospace"]
      },
      // Panel-slot tiers: sheet ≤899 (bottom sheet, non-modal), floating panel ≥900
      // over a full-bleed map (owner preference: no reserved dock gutter).
      screens: {
        panel: "900px"
      },
      colors: {
        brand: {
          DEFAULT: "#f97316",
          dark: "#c2410c"
        },
        sp: {
          "brand-ivory": "rgb(var(--sp-color-brand-ivory-rgb) / <alpha-value>)",
          "brand-paper": "rgb(var(--sp-color-brand-paper-rgb) / <alpha-value>)",
          "brand-copper": "rgb(var(--sp-color-brand-copper-rgb) / <alpha-value>)",
          "brand-accent": "rgb(var(--sp-color-brand-accent-rgb) / <alpha-value>)",
          "action-primary": "rgb(var(--sp-color-action-primary-rgb) / <alpha-value>)",
          "action-primary-hover": "rgb(var(--sp-color-action-primary-hover-rgb) / <alpha-value>)",
          "action-primary-pressed": "rgb(var(--sp-color-action-primary-pressed-rgb) / <alpha-value>)",
          primary: "rgb(var(--sp-color-text-primary-rgb) / <alpha-value>)",
          // These next entries point at the hex token directly — their -rgb
          // twins held stale values and were deleted (twin-resolution
          // 2026-08-21). Alpha modifiers (e.g. text-sp-secondary/50) are NOT
          // supported on them; zero call sites used one. Derive washes with
          // color-mix(in srgb, var(--…) N%, transparent) instead.
          secondary: "var(--sp-color-text-secondary)",
          muted: "var(--sp-color-text-muted)",
          disabled: "var(--sp-color-state-disabled)",
          canvas: "var(--sp-color-canvas)",
          workspace: "rgb(var(--sp-color-workspace-rgb) / <alpha-value>)",
          surface: "rgb(var(--sp-color-surface-rgb) / <alpha-value>)",
          "surface-raised": "rgb(var(--sp-color-surface-raised-rgb) / <alpha-value>)",
          subtle: "var(--sp-color-border-subtle)",
          strong: "var(--sp-color-border-strong)",
          selected: "rgb(var(--sp-color-state-selected-rgb) / <alpha-value>)",
          published: "rgb(var(--sp-color-state-published-rgb) / <alpha-value>)",
          draft: "rgb(var(--sp-color-state-draft-rgb) / <alpha-value>)",
          success: "rgb(var(--sp-color-state-success-rgb) / <alpha-value>)",
          warning: "rgb(var(--sp-color-state-warning-rgb) / <alpha-value>)",
          danger: "rgb(var(--sp-color-state-danger-rgb) / <alpha-value>)",
          info: "var(--sp-color-state-info)",
          search: "rgb(var(--sp-color-state-search-rgb) / <alpha-value>)"
        }
      },
      spacing: {
        "sp-1": "var(--sp-space-1)",
        "sp-2": "var(--sp-space-2)",
        "sp-3": "var(--sp-space-3)",
        "sp-4": "var(--sp-space-4)",
        "sp-5": "var(--sp-space-5)",
        "sp-6": "var(--sp-space-6)",
        "sp-7": "var(--sp-space-7)"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.16)",
        // Elevation tiers must be NAMED utilities: Tailwind v3 drops arbitrary
        // shadow-[var(--…)] candidates (box-shadow vs shadow-color ambiguity),
        // so that form silently ships box-shadow: none.
        "rail-overlay": "var(--admin-rail-overlay-shadow)",
        "elevation-2": "var(--admin-elevation-2-shadow)",
        "elevation-3": "var(--admin-elevation-3-shadow)",
        "elevation-4": "var(--admin-elevation-4-shadow)",
        panel: "var(--admin-shadow-panel)",
        "marker-selected": "var(--admin-marker-selected-shadow)",
        "marker-hover": "var(--admin-marker-hover-shadow)",
        "marker-ai": "var(--admin-marker-ai-shadow)",
        "sp-raised": "var(--sp-shadow-raised)",
        "sp-floating": "var(--sp-shadow-floating)",
        "sp-sheet": "var(--sp-shadow-sheet)",
        "sp-modal": "var(--sp-shadow-modal)"
      },
      transitionDuration: {
        "sp-fast": "var(--sp-duration-fast)",
        "sp-standard": "var(--sp-duration-standard)",
        "sp-deliberate": "var(--sp-duration-deliberate)"
      }
    }
  },
  plugins: []
};

export default config;
