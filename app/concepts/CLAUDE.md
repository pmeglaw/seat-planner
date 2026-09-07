# app/concepts/ — prototype-only design surfaces

None of these routes are part of the shipped viewer/admin flows:

- `component-state-board` — design-system state matrix (has its own vendored fonts directory, see its README)
- `login-v12` — static Carbon-v12 sign-in mock
- `map-redesign` — Counsel Ink markers + docked inspector over real published seats
- `my-seat-preview` — the real `/my-seat` sheet fed with fixtures
- `seat-card` — seat sheet concept
- `music-visualizer` — PRISM (Web Audio + canvas); the only concept route with its own security-header exception, explained where it lives in `next.config.js`

## Gate contract

Each page carries its own `prototypesEnabled()` gate **and** `robots: { index: false, follow: false }`. Without `SEAT_PLANNER_ENABLE_PROTOTYPES=true` the gate fires and the browser lands on the app's 404 screen — but because these pages are statically prerendered the HTTP *status* stays 200 (a genuinely missing URL does return a real 404), so the per-page noindex is what actually keeps them out of crawlers. Keep both on every new concept page.

That flag must be set at **build** time to reach them via `npm run start` — setting it at request time only works in dev.
