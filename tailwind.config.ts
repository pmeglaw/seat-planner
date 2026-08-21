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
        // Every entry points at the hex token directly — the -rgb channel
        // twins were fully deleted (twin-resolution 2026-08-21 + PASS1 §4.1).
        // Alpha modifiers (e.g. text-sp-secondary/50) are NOT supported here;
        // derive washes with color-mix(in srgb, var(--…) N%, transparent).
        // Utility names keep their pre-PASS1 keys (bg-sp-surface, …) — only
        // the vars behind them were renamed; key renames are a Pass-2 call.
        sp: {
          "brand-paper": "var(--sp-brand-subtle)",
          "brand-accent": "var(--sp-brand)",
          "action-primary": "var(--sp-button-primary)",
          "action-primary-hover": "var(--sp-button-primary-hover)",
          "action-primary-pressed": "var(--sp-button-primary-active)",
          primary: "var(--sp-text-primary)",
          secondary: "var(--sp-text-secondary)",
          muted: "var(--sp-text-helper)",
          disabled: "var(--sp-surface-disabled)",
          canvas: "var(--sp-background)",
          surface: "var(--sp-layer-01)",
          "surface-raised": "var(--sp-layer-02)",
          subtle: "var(--sp-border-subtle)",
          strong: "var(--sp-border-strong)",
          selected: "var(--sp-selection)",
          published: "var(--sp-status-published-strong)",
          draft: "var(--sp-status-draft-strong)",
          success: "var(--sp-status-success-strong)",
          warning: "var(--sp-status-pending-strong)",
          danger: "var(--sp-status-danger-strong)",
          info: "var(--sp-status-neutral-strong)",
          search: "var(--sp-status-search-text)"
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
