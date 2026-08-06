// Full-document navigation escape hatch. Three sanctioned callers, all cases
// where the client router is the wrong tool — this is still not a pattern for
// general in-app navigation (the rail's <Link> transitions stay soft):
//
// 1. Post-auth redirects (LoginForm, UpdatePasswordForm).
// 2. Deploy-skew fallback (AppRail via lib/deploySkew.ts): a stale tab's soft
//    navigation would fetch RSC from a newer deployment and dead-end into the
//    router's own delayed full-reload fallback, so the rail takes the full
//    load deliberately on the first click instead.
// 3. The rail's stalled-navigation watchdog (AppRail, #316): a soft nav whose
//    pathname hasn't committed after 4s is restarted as a full document load
//    — the same stall class as the auth racing pair below.
//
// LoginForm and UpdatePasswordForm land the user via window.location.assign,
// NOT router.push + router.refresh (the pair this replaced). Both reasons are
// auth-specific:
//
// - The session cookie just changed. A document load is the one navigation
//   that guarantees every layout and page re-renders against the new session;
//   push + refresh instead raced two overlapping client transitions for the
//   same route (refresh invalidates while push's commit is in flight).
// - That racing pair could wedge Next's client router — the same stall class
//   AppRail's nav watchdog backstops (#316) — parking the user on the
//   destination's loading skeleton until a manual reload. A pathname watchdog
//   cannot catch this variant (the URL flips before the content stalls), so
//   the fix is to skip the client router entirely. One full load per sign-in
//   is a fine price.
//
// Kept as a module so the jsdom component tests can swap it at bundle time
// (tests/helpers/renderComponent.mjs) — jsdom's Location is unforgeable, so
// window.location.assign cannot be stubbed in place.
export function assignLocation(href: string) {
  window.location.assign(href);
}
