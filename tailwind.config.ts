import type { Config } from "tailwindcss";

// Tailwind supplies layout utilities only. Every colour, shadow, radius and
// duration it exposes is a var() into the semantic token layer
// (app/styles/sp-tokens.css) — no literal values here
// (tests/phase4-token-layer-source.test.mjs). The named keys below are the
// ones the shipped components still consume; each retires with the component
// PR that stops using it (redesign-v2 Phase 4). `shadow-sp` in particular is a
// bridge — depth is layers in the design system — and must be gone by the end
// of PR 5.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    // Carbon: zero radius on boxes. The named scale is zeroed globally; the
    // only rounded things are tags and marks (`rounded-full`).
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
      sp: "var(--sp-radius)",
      "sp-tag": "var(--sp-radius-tag)"
    },
    extend: {
      // Default border colour follows the token layer — recolors every
      // unqualified `border`.
      borderColor: {
        DEFAULT: "var(--sp-border-subtle)"
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
        // Alpha modifiers (e.g. text-sp-secondary/50) are NOT supported here;
        // derive washes with color-mix(in srgb, var(--…) N%, transparent).
        sp: {
          "action-primary": "var(--sp-button-primary)",
          "action-primary-hover": "var(--sp-button-primary-hover)",
          "action-primary-pressed": "var(--sp-button-primary-active)",
          primary: "var(--sp-text-primary)",
          secondary: "var(--sp-text-secondary)",
          muted: "var(--sp-text-helper)",
          disabled: "var(--sp-button-disabled)",
          canvas: "var(--sp-background)",
          surface: "var(--sp-layer-01)",
          "surface-raised": "var(--sp-layer-02)",
          subtle: "var(--sp-border-subtle)",
          strong: "var(--sp-border-strong)",
          selected: "var(--sp-layer-selected)",
          published: "var(--sp-status-success-mark)",
          draft: "var(--sp-status-draft-mark)",
          success: "var(--sp-status-success-mark)",
          warning: "var(--sp-status-warning-mark)",
          danger: "var(--sp-status-error-mark)",
          info: "var(--sp-status-info-mark)",
          search: "var(--sp-status-search-text)"
        }
      },
      boxShadow: {
        // ONE named shadow utility. Tailwind v3 drops arbitrary
        // shadow-[var(--…)] candidates (box-shadow vs shadow-color ambiguity),
        // so a var-backed shadow must be a named key. Bridge: retires by PR 5.
        sp: "var(--sp-shadow)"
      },
      transitionDuration: {
        "sp-fast": "var(--sp-duration-fast-01)",
        "sp-standard": "var(--sp-duration-fast-02)",
        "sp-deliberate": "var(--sp-duration-moderate-02)"
      }
    }
  },
  plugins: []
};

export default config;
