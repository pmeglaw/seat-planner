import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs (arrays), so we spread them
// directly — no FlatCompat/@eslint/eslintrc shim needed.
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      // design-sync build output + staged converter scripts (gitignored; absent in CI)
      "ds-bundle/**",
      ".ds-sync/**",
      // local scratch (screenshots, repro rigs, qa harness bundles) — gitignored,
      // absent in CI, and full of deliberately un-lintable throwaway code. With
      // it linted, `npm run gate` fails locally on files CI never sees.
      "output/**"
    ]
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Next 16 turns on react-hooks/set-state-in-effect, which flags calling
      // setState synchronously inside a useEffect. The app uses several
      // legitimate sync-in-effect patterns (URL error params, selection sync).
      // Keep it as a warning so the framework upgrade isn't blocked; revisit the
      // ~15 call sites deliberately rather than risk-refactoring them here.
      "react-hooks/set-state-in-effect": "warn"
    }
  }
];

export default eslintConfig;
