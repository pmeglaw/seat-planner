import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      // Panel-slot tiers from the redesign architecture: sheet ≤899 (bottom sheet,
      // non-modal), overlay 900–1139 (floats over the canvas), dock ≥1140 (reserved
      // column — canvas pixel dimensions stay constant, INV-6).
      screens: {
        panel: "900px",
        dock: "1140px"
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
          secondary: "rgb(var(--sp-color-text-secondary-rgb) / <alpha-value>)",
          muted: "rgb(var(--sp-color-text-muted-rgb) / <alpha-value>)",
          disabled: "rgb(var(--sp-color-state-disabled-rgb) / <alpha-value>)",
          canvas: "rgb(var(--sp-color-canvas-rgb) / <alpha-value>)",
          workspace: "rgb(var(--sp-color-workspace-rgb) / <alpha-value>)",
          "map-workspace": "rgb(var(--sp-color-map-workspace-rgb) / <alpha-value>)",
          surface: "rgb(var(--sp-color-surface-rgb) / <alpha-value>)",
          "surface-raised": "rgb(var(--sp-color-surface-raised-rgb) / <alpha-value>)",
          subtle: "rgb(var(--sp-color-border-subtle-rgb) / <alpha-value>)",
          strong: "rgb(var(--sp-color-border-strong-rgb) / <alpha-value>)",
          selected: "rgb(var(--sp-color-state-selected-rgb) / <alpha-value>)",
          published: "rgb(var(--sp-color-state-published-rgb) / <alpha-value>)",
          draft: "rgb(var(--sp-color-state-draft-rgb) / <alpha-value>)",
          success: "rgb(var(--sp-color-state-success-rgb) / <alpha-value>)",
          warning: "rgb(var(--sp-color-state-warning-rgb) / <alpha-value>)",
          danger: "rgb(var(--sp-color-state-danger-rgb) / <alpha-value>)",
          info: "rgb(var(--sp-color-state-info-rgb) / <alpha-value>)",
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
      borderRadius: {
        "sp-sm": "var(--sp-radius-sm)",
        "sp-md": "var(--sp-radius-md)",
        "sp-lg": "var(--sp-radius-lg)",
        "sp-xl": "var(--sp-radius-xl)",
        "sp-sheet": "var(--sp-radius-sheet)",
        "sp-full": "var(--sp-radius-full)"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.16)",
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
