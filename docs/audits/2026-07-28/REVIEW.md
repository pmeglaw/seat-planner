# Office Seat Planner — Production Readiness Review

**Date:** 2026-07-28
**Reviewer:** independent audit pass, fresh-eyes (project guidance documents deliberately excluded as evidence)
**Commit reviewed:** `f32721b` (branch `main`, clean working tree)
**Method:** static reading of every migration, action and guard; a live click-through in three authentication contexts against a **local** Supabase stack; direct protocol-level attacks against PostgREST and the Next.js server-action endpoints.

> **Production was never contacted.** All testing ran against a disposable local Supabase container (`127.0.0.1:54321`) with a synthetic 67-person / 90-seat dataset. No source file was modified and nothing was committed.

---

## 1. Executive summary

**Overall grade: B−**

| Category | Weight | Grade | Points |
| --- | --- | --- | --- |
| Security Assessment | 30% | B | 3.0 |
| User Experience (UX/UI) | 20% | B | 3.0 |
| Code Quality & Architecture | 20% | B− | 2.7 |
| Performance & Scalability | 15% | B− | 2.7 |
| Infrastructure & Deployment | 15% | C+ | 2.3 |

Weighted arithmetic: `(0.30 × 3.0) + (0.20 × 3.0) + (0.20 × 2.7) + (0.15 × 2.7) + (0.15 × 2.3)`
`= 0.90 + 0.60 + 0.54 + 0.405 + 0.345 = 2.79` → **B−**

**The automatic-F rule was not invoked.** No authorization bypass, no RLS gap and no exposed service-role key was found. I tested for all three directly rather than inferring them, and each test is reproduced below.

**Verdict for a non-engineer.** The part of this application that would hurt you most if it failed — the wall between an ordinary staff member and the ability to read or rewrite the seating map — is genuinely well built, and I was unable to get through it from any direction I tried. An employee with a normal account cannot see unpublished plans, cannot promote themselves to administrator, and cannot change the map even by calling the server directly with the browser bypassed entirely. What is missing is the outer layer of hardening that a production application holding staff data is expected to carry: the site sends none of the standard browser-protection headers, and the login session token is readable by any JavaScript running on the page. Neither is exploitable on its own today, but together they mean a single future scripting mistake would escalate straight to account takeover rather than being contained. The remaining issues are quality-of-life and scale problems — most notably that the map silently stops drawing seats past a thousand, showing an incomplete floor plan with no warning at all. This is a solid, careful codebase that needs a hardening pass, not a rescue.

**Findings by severity (at review time):** 0 Critical · 2 High · 6 Medium · 5 Low · 7 Unverified.

**Status as of 2026-07-28**, after the remediation work that followed:

| ID | Title | Status |
| --- | --- | --- |
| SEC-01 | No security response headers | **Fixed** — PR #267, verified live on production |
| SEC-02 | Session cookie readable by JavaScript | **Partly fixed** — PR #268 set `Secure` (verified on production); still script-readable, and the session-lifetime lever needs a paid Supabase plan |
| PERF-01 | Map silently truncated at 1,000 seats | **Fixed** — PR #269, 2,030 of 2,030 seats now render |
| PERF-02 | Markers re-rendered on every pointer move | **Partly fixed** — PR #270, measured −11%; the parent-side per-seat work still dominates |
| SEC-03 | Viewers can read colleague emails | **Closed, accepted** — the premise was mistaken; it is a deliberate viewer feature |

> **Grades describe the state at review time (commit `f32721b`)** and are deliberately **not** restated as fixes land, so the audit record and the remediation record stay separable. Remaining open: SEC-04, UX-01, UX-02, CODE-01…05, PERF-03, PERF-04, INFRA-01…03, plus the Unverified list.

---

## 2. Top 10 fixes, ranked

| # | ID | Title | Severity | Effort | Why it is ranked here |
| --- | --- | --- | --- | --- | --- |
| 1 | SEC-01 | No security response headers at all (no CSP, X-Frame-Options, Referrer-Policy, X-Content-Type-Options, Permissions-Policy) | High | S | Cheapest high-value fix in the report. One config block closes clickjacking, MIME-sniffing and referrer leakage, and gives the XSS-free codebase a backstop it currently lacks. Ranked first because effort is hours and it compounds with SEC-02. |
| 2 | SEC-02 | Supabase session cookie is readable by JavaScript (`httpOnly=false`) | High | M | Turns any future XSS into full session takeover of an admin account. Cannot be fixed by a flag flip — needs the SSR cookie strategy revisited — so it needs starting early even though SEC-01 lands first. |
| 3 | PERF-01 | Map silently renders only 1,000 seats; the rest vanish with no warning | Medium | S | The only finding where a user is actively misled by a wrong answer rather than inconvenienced. An incomplete floor plan that looks complete is worse than an error. Small fix (explicit count check + banner). |
| ~~4~~ | SEC-03 | ~~Every viewer can read all colleagues' email addresses~~ | ~~Medium~~ **Informational** | — | **CLOSED — accepted 2026-07-28.** The premise was wrong: the viewer deliberately displays colleague email in the seat Contact panel, so this is a working feature, not incidental exposure. See the finding for the correction and the two options if the calculus changes. |
| 5 | CODE-01 | No schema validation at any trust boundary (no zod/yup/valibot) | Medium | M | Currently saved by Postgres constraints, not by the application. Every new action inherits the risk. Ranked mid because nothing is broken today — this is about the next twenty changes, not this one. |
| 6 | INFRA-01 | README steers all local development at the production database while a working local stack exists | Medium | S | A documentation fix that removes a standing chance of someone publishing to production from a laptop. Near-zero effort, meaningful blast-radius reduction. |
| 7 | CODE-02 | `SeatMap.tsx` is a single 3,871-line client component with ~49 `useState` and ~40 `useEffect` | Medium | L | The root cause behind PERF-02 and most future regression risk, but a genuine refactor. Ranked below the quick wins precisely because it is large. |
| 8 | PERF-02 | Seat markers are not memoized; every `pointermove` re-renders all markers | Medium | M | Measured at ~32 ms per drag frame at scale (~31 fps). Degrades the primary admin interaction. Partly fixable independently of CODE-02 via `React.memo`. |
| 9 | UX-01 | No loading or Suspense boundaries anywhere; pre-hydration clicks are silently dropped | Low | M | Navigation feels blocking and the login button ignores early clicks — I hit this myself and lost a test run to it. Real polish gap, no data risk. |
| 10 | INFRA-02 | App-level "snapshot" is not a database backup, and nothing documents the difference | Low | S | Cheap to document, expensive to discover during an incident. Ranked last only because it is latent. |

---

## 3. Category sections

### A. User Experience (UX/UI) — **B**

Keyboard access and responsive behaviour are better than most production applications of this size, and every destructive action is gated behind a review step. The gaps are the absence of any loading state and a map that misleads at scale.

**What is genuinely good**

- **Keyboard traversal is properly engineered, not retrofitted.** Tabbing from a cold load hits `Skip to seat map` first, then filters, search, account, floor selector, the map region, seat markers, zoom controls and the people list — and **all 14 stops I sampled had a visible focus ring**. See `screenshots/viewer-keyboard-focus.png`. The marker layer uses a roving `tabIndex` with arrow-key navigation (`components/seat-map/SeatMap.tsx:1109-1128`, wired at `:3282,:3332`) rather than making 90 markers individually tabbable.
- **Seat markers narrate their full state** to assistive technology via a composed `aria-label` (`components/seat-map/SeatMarker.tsx:464`), e.g. "C01 Adele Marchetti. Assigned seat."
- **No horizontal overflow at any tested width.** Measured `scrollWidth === clientWidth` at 390 / 768 / 1024 / 1440 px (`screenshots/viewer-responsive-*.png`).
- **All five admin dialogs are real dialogs** — `role="dialog"` plus `aria-modal="true"` plus focus trapping via `useDialogFocus` (`components/seat-map/SeatMap.tsx:387-391`, dialogs at `:3438,:3482,:3645,:3789,:3821`).
- **Error boundaries are written for humans.** `app/admin/error.tsx:57-60` explicitly reassures: "Nothing was published, and the draft map is exactly as the last successful save left it."
- **Destructive actions all have review-before-mutate**: CSV import (`components/admin-settings/DataUtilitiesPanel.tsx:171-204`), snapshot restore (`:219-223`), draft reset (`:232-239`), seat delete (`components/seat-map/SeatMap.tsx:2076-2079`), department/zone delete and employee deactivate (`components/admin-management/AdminManagementPanel.tsx:438-444,502-507,552-557`), and publish (`components/seat-map/SeatMap.tsx:2125-2147`).
- Measured **CLS between 0.023 and 0.035** across all dataset sizes — comfortably inside the 0.1 "good" threshold.

#### [UX-01] No loading or Suspense boundaries; pre-hydration clicks are silently dropped
**Severity:** Low
**Evidence:** A glob over `app/**` returns **no** `loading.tsx`, `not-found.tsx` or `global-error.tsx` — only `app/error.tsx` and `app/admin/error.tsx`. `grep -r "<Suspense"` across `app/` and `components/` returns **zero matches**. Every page is `dynamic = "force-dynamic"` with `revalidate = 0` (`app/page.tsx:7-8`, `app/admin/page.tsx:6-7`, `app/admin/management/page.tsx:6-7`, `app/admin/settings/page.tsx:6-7`), so each navigation blocks on up to six sequential Supabase round-trips with no skeleton. Separately, I reproduced a silent input loss: clicking **Sign in** after `domcontentloaded` but before hydration does nothing at all — no feedback, no queued submit. My first automated run failed on exactly this and only passed once I waited for `networkidle` plus 800 ms.
**Impact:** Users on slow connections see a blank or stale screen with no progress indication, and an early click on the primary login button is silently discarded, which reads as "the site is broken".
**Fix:** Add route-level skeletons and disable the submit control until hydrated.
```tsx
// app/loading.tsx (new) — and app/admin/loading.tsx
export default function Loading() {
  return <div className="min-h-screen animate-pulse bg-[var(--admin-bg)]" aria-busy="true" aria-live="polite" />;
}
```
```tsx
// components/auth/LoginForm.tsx — gate the button on hydration
const [hydrated, setHydrated] = useState(false);
useEffect(() => setHydrated(true), []);
// ...
<button type="submit" disabled={!hydrated || pending}>{pending ? "Signing in…" : "Sign in"}</button>
```
**Effort:** M

#### [UX-02] Management forms carry no client-side validation affordances
**Severity:** Low
**Evidence:** `components/admin-management/AdminManagementPanel.tsx` contains **no** `required`, `maxLength`, `minLength` or `pattern` attributes anywhere in its 1,196 lines. The only typed field is `type="email"` at `:808`, and because submission runs through `type="button"` click handlers (`:827`) rather than a form submit, native browser validation never fires. The sole client gate is a disabled-button check on trimmed non-emptiness (`:827,:843,:861,:902,:915`).
**Impact:** Field-length and format errors surface only after a server round-trip, as generic messages.
**Fix:** Add `required` / `maxLength={120}` to the name and department inputs and surface per-field messages; pair with CODE-01 so client and server share one schema.
**Effort:** S

---

### B. Security Assessment — **B**

This is the strongest part of the application. Two independent enforcement layers exist and **both were verified live under attack**, not assumed. The grade is held to B by the complete absence of transport-layer hardening.

> **Grade-cap rule explicitly considered and not applied.** The brief caps Security at F for any confirmed authorization bypass, RLS gap or exposed service key. I tested for each: viewer reads and writes against every table, viewer invocation of all eight mutating RPCs, viewer and anonymous replay of captured server actions, and a full grep of the production bundle for service-role material. None were found. The cap does not apply.

**What is genuinely good**

- **RLS is enabled on all 7 public tables** with 21 policies, every one scoped `TO authenticated` (verified against `pg_policies` in the live database, not read from migration text). `anon` holds **no** SELECT/INSERT/UPDATE/DELETE on any table.
- **Every one of the 21 exported server actions calls `requireAdmin()` as its first statement** (`app/actions.ts:26-46`, applied at `:95,:237,:299,:356,:428,:483,:516,:545,:557,:572,:588,:602,:617,:632,:645,:679,:714,:762,:780,:822`). `tests/require-admin-guard-source.test.mjs` enumerates the exports by AST so a new unguarded action fails CI.
- **Verified live — viewer cannot read draft data.** With a real viewer JWT: draft seats `[]`, live `employees` `[]`, `publish_events` `[]`, `profiles` returns only the caller's own row.
- **Verified live — viewer cannot write.** Insert seat → `42501`; write `published_employees` → `42501`; self-promote to admin → **role unchanged**; update/delete a published seat → **row unchanged, 90 seats intact**.
  *Detection note:* the self-promote and published-seat writes returned **HTTP 204**, because PostgREST returns 204 when an RLS `USING` clause matches zero rows. A denied UPDATE is indistinguishable from a successful one by status code alone. Every result here was confirmed against the database, not inferred from the response code — anyone re-running these checks should do the same.
- **Verified live — every mutating RPC rejects a viewer:** `publish_seat_map`, `update_draft_seat`, `restore_draft_snapshot`, `reset_draft_seats_to_published`, `import_assignments_csv`, `delete_department`, `deactivate_employee`, `swap_draft_seat_assignments` all return `Admin permission required.`
- **Verified live — server-action replay is rejected.** I captured three real admin action POSTs (`updateSeatAction`, `restoreDraftSnapshotAction`, `publishSeatMapAction`) with their action IDs and bodies, then replayed them verbatim from an authenticated viewer session: all three returned `Admin permission required.`; anonymous returned `You must be signed in.` Database unchanged. Repeated against the **production build** using action IDs lifted from the client bundle — same rejection. See `screenshots/viewer-action-replay.png`.
- **No draft leak into any viewer payload.** I planted a canary (draft seat `ZZCANARYDRAFT`, note `canary-note-do-not-leak`, employee `Canary DraftOnly`) and scanned every served HTML payload across 18 route × context combinations. The canary appears **only** under an admin session on the three admin routes. The admin pages return the denial view *before* fetching (`app/admin/page.tsx:12-40`), so the viewer's payload contains no seat data at all.
- **No service-role material in the client bundle.** Greps over `.next/static` for `service_role`, `SUPABASE_SERVICE`, `SERVICE_ROLE_KEY`, `VERCEL_OIDC_TOKEN` and `SEAT_PLANNER_E2E_PASSWORD` all returned **0 files**. The real `OPENAI_API_KEY` value from `.env.local` appears in **0 client and 0 server** files. The only inlined Supabase URL was the local one. (`sk-` matched only `mask-type` and `ask-planner`; `supabase.co` matched a wildcard allowlist inside `supabase-js`.)
- **XSS: clean.** Stored `<script>alert(1)</script>`, `<img src=x onerror=alert(2)>`, `'; DROP TABLE seats;--`, a 500-character name and a Unicode/emoji name, then loaded the viewer map, admin map and Management. **Zero dialogs fired, zero page errors**, and the script tag renders as literal visible text on every surface. `seats` still had all 180 rows. There is no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` anywhere in `app/`, `lib/` or `components/`. See `screenshots/*-xss-render-*.png`.
- **CSV formula injection is guarded on export and losslessly reversed on import** (`lib/csv.ts:197-204` and `:103-105`). Verified: `=cmd|calc` exports as `'=cmd|calc` and re-imports as `=cmd|calc` with zero issues.
- **CSV import is transactional.** A two-row batch with a valid row 1 and an invalid row 2 left row 1's seat **byte-identical** (md5 compared before/after) and returned `Row 3: Unknown seat label 'NO_SUCH_SEAT_XYZ'.` An all-valid batch applied. Malformed headers and a non-CSV binary file both rejected with `Missing required columns: …`.
- **The open-redirect on `?next=` is properly defended** — `safeNextPath` (`lib/authMessages.ts:42-54`) rejects non-`/`-prefixed, `//`-prefixed, control-character and cross-origin-resolving values.
- **Production hides error internals.** Server-action failures return a digest only — `1:E{"digest":"3978590940"}` — with no message, stack or filesystem path. (Dev mode does expose full stacks with absolute paths; this is Next.js default behaviour and **not** a production finding.)
- **Sign-out is POST-only** (`app/auth/signout/route.ts:10-15`), so it cannot fire from a prefetch or an `<img>` tag.
- **The concurrency fence works.** A write carrying a stale `updated_at` was rejected with SQLSTATE `MLS02` and the message "Seat C03 changed in another session after it was loaded. Reload to pick up the latest draft, then try again.", leaving the row untouched; the same write with the current timestamp applied.

#### [SEC-01] No security response headers are sent at all
**Severity:** High — **REMEDIATED 2026-07-28** (see Remediation log, section 5)
**Evidence:** `next.config.js` (14 lines, read in full) defines **no** `headers()` function. There is **no `vercel.json`** in the repository. Confirmed against the running production build:
```
$ curl -sI http://localhost:3001/login | grep -iE "content-security|x-frame|strict-transport|referrer-policy|permissions-policy|x-content-type"
(no output)
```
No `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` or `Permissions-Policy`.
**Impact:** The app can be framed by any origin (clickjacking against admin controls such as Publish and Delete); responses are MIME-sniffable; full URLs leak to third parties via `Referer`. Most importantly there is no CSP to contain a scripting flaw — which matters because the session cookie is JavaScript-readable (SEC-02).
**Fix:**
```js
// next.config.js
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",       // tighten to a nonce once verified
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ") }
];

const nextConfig = {
  outputFileTracingRoot: __dirname,
  images: { localPatterns: [{ pathname: "/images/office-floor-plan.webp", search: "?v=map-v2-warm-1911x867" }] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};
module.exports = nextConfig;
```
Ship CSP as `Content-Security-Policy-Report-Only` first and check the console on `/admin`, since Next.js injects inline bootstrap scripts.
**Effort:** S

#### [SEC-02] The Supabase session cookie is readable by JavaScript
**Severity:** High
**Evidence:** After signing in against the production build, the browser context reported exactly one auth cookie:
```
sb-127-auth-token  httpOnly=false  secure=false  sameSite=Lax
```
`httpOnly=false` means any script on the page can read the access and refresh tokens via `document.cookie`. This follows from `@supabase/ssr`'s `createBrowserClient` (`lib/supabase/client.ts:11`) sharing one cookie store with the server client (`lib/supabase/server.ts:19-34`) — the browser half must read it.

**CONFIRMED ON PRODUCTION 2026-07-28** (read-only: signed in, inspected cookie attributes, signed out; no application data read or written). This resolves what the review originally listed as unverified, and the answer is worse than assumed:

```
sb-<project>-auth-token
  httpOnly=false   secure=false   sameSite=Lax
  domain=seats.megeredchianlaw.com   path=/
  expires=2027-09-01  (~13 months)   valueLength=2553
document.cookie exposes: ["sb-<project>-auth-token"]
```

Three things this establishes beyond the original finding:

1. **`Secure` is NOT set in production.** The local `secure=false` was not a localhost artefact. A session cookie on an HTTPS-only site is missing the flag that stops it being transmitted over plain HTTP. The HSTS header now shipped by SEC-01 mitigates this for any browser that has visited before, but a first-ever visit over `http://`, or a client with no HSTS state, would send the token in cleartext.
2. **The cookie is written client-side, not by the server.** The only `Set-Cookie` header observed in the whole flow was Cloudflare's `__cf_bm` from Supabase — which is itself `HttpOnly; Secure; SameSite=None`. The app's auth cookie never appears in a `Set-Cookie` response, confirming it is written through `document.cookie`. That is *why* `httpOnly` cannot simply be switched on.
3. **The token is long-lived** — roughly 13 months, and 2,553 bytes, i.e. the full session including the refresh token.
**Impact:** Any successful script injection escalates immediately to full session theft, including an admin session that can publish and delete. Combined with SEC-01's missing CSP there is no second line of defence. The codebase is XSS-free today, so this is a latent multiplier rather than an active breach — which is why it is High and not Critical.
**Fix:** No single flag resolves this. Revised now that production behaviour is confirmed:

1. ~~Confirm `Secure` is set in production~~ — **done; it is not.** Superseded by step 2.
2. **Set `Secure` (highest value, lowest risk).** `@supabase/ssr` accepts `cookieOptions` on every client factory. Because the cookie is written client-side, it must be set on the **browser** client, not only the server one:
```ts
// lib/supabase/client.ts
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase environment variables.");
  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      // document.cookie cannot set httpOnly, but Secure and SameSite it can.
      // Guarded so http://localhost dev still works — a Secure cookie is
      // silently dropped on a plain-http origin.
      secure: typeof location !== "undefined" && location.protocol === "https:",
      sameSite: "lax",
      path: "/"
    }
  });
}
```
Mirror the same `cookieOptions` in `lib/supabase/server.ts:19` and `lib/supabase/middleware.ts:20` so a server-side refresh cannot rewrite the cookie without the flag.
2b. **DONE 2026-07-28** — shipped as PR #268 (merged). `cookieOptions` added to all three client factories via `lib/supabase/cookieOptions.ts`. Verified pre-merge: `secure=false` over plain http (required, or the browser silently discards the cookie and login breaks) and `secure=true` over https, with sign-in, reload persistence, server-side refresh and sign-out all working in both. **Confirmed live on production 2026-07-28** (read-only sign-in, attribute inspection, sign-out):

```
sb-<project>-auth-token
  secure=true   httpOnly=false   sameSite=Lax   path=/
  expires=2027-09-01   valueLength=2553
```

App verified working after the change: viewer map renders, sign-out clears the cookie. **This closes the cleartext-transmission path only.** `document.cookie` still exposes the token and the ~13-month lifetime is unchanged — both confirmed still true on production after the fix.
3. ~~**Shorten the lifetime** via Supabase → Authentication → Sessions.~~ **BLOCKED 2026-07-28** — the owner reports session-lifetime controls require a paid Supabase plan, which is not available. Note this is the *only* step that shortens the window on an already-stolen token: cookie `maxAge` would not help, because a token lifted from `document.cookie` stays valid server-side regardless of what the victim's browser does with its copy. Whether refresh-token rotation (which would make a stolen refresh token single-use) is enabled on this project is **unverified** — it needs the Auth dashboard.
4. **Split the cookies** so the refresh token is server-only (`httpOnly`) and only a short-lived access token is script-readable. This is a real auth-flow change, not a config edit — and with step 3 blocked, it becomes the only remaining way to bound the damage of a stolen session.
5. SEC-01's CSP is deployed, but it keeps `script-src 'unsafe-inline'`, so it does **not** by itself prevent the theft this finding describes. **Tightening `script-src` to a per-request nonce** attacks the precondition rather than the consequence, needs no paid plan, and does not touch the auth flow — making it the lower-risk of the two remaining code-level options.

Verify sign-in, refresh and sign-out end-to-end after any change here — this is the highest-regression-risk fix in the report. A `Secure` cookie is silently discarded over plain HTTP, so a careless version of step 2 breaks local development with no error message.
**Effort:** M

#### [SEC-03] Every authenticated viewer can read all colleagues' email addresses
**Severity:** ~~Medium~~ → **Informational — ACCEPTED by the owner, 2026-07-28.** See the decision at the end of this finding; the original severity rested on a mistaken premise, corrected below.
**Evidence:** The snapshot policy is unconditional — `published_employees_select_authenticated … USING (true)` (`supabase/migrations/20260708230000_published_employee_snapshot.sql:44-48`, confirmed in `pg_policies`). The viewer page selects every column (`app/page.tsx:39-43`: `.from("published_employees").select("*")`). Reproduced with a viewer JWT:
```
GET /rest/v1/published_employees?select=full_name,email
[{"full_name":"Adele Marchetti","email":"adele.marchetti27@megeredchianlaw.test"}, …]
```
The `email` column was added to the snapshot by `supabase/migrations/20260710120000_employee_email.sql:12`.
**Correction to the original finding (2026-07-28).** The review claimed this data travels to viewers "whether or not the UI displays it". **That was wrong, and I verified it against the code before proposing any change.** The viewer *does* display colleague email: `components/seat-map/ViewerSeatFinder.tsx:1370` renders `SeatInspector`, whose read-only branch (`canEdit={false}`, `headingId="published-contact-heading"`, labelled "Published assignment") renders a **Contact** section containing `selectedSeat.employee?.email` and `phone_extension` (`components/seat-map/SeatInspector.tsx:1442-1451`). Clicking a seat to get that person's contact details is a deliberate, working feature — not incidental over-exposure.

**What remains true:** the viewer page payload carries **every** active employee's address on every load (`app/page.tsx:39-49`), whether or not any seat is opened. The exposure is bulk-shipping, not the feature itself.

**Impact (revised):** Any authenticated account can retrieve the full staff directory including email. Every such account belongs to staff, and colleague email is ordinary internal directory data those users can obtain by other means. The residual risk is that a single compromised viewer session yields the whole directory in one request rather than one address per deliberate click.

**Decision — ACCEPTED, owner, 2026-07-28.** Showing colleague email to authenticated staff is the intended purpose of the directory. No code change. Recorded here so the next reviewer does not re-raise it as a defect.

**If the calculus ever changes**, two options in increasing cost:
1. *Fetch on demand* — drop `email` from the viewer's page query and load one person's contact through a server action when a seat is opened. Keeps the feature; reduces exposure from the whole directory per page load to one address per click. Costs a round-trip and a loading state in the Contact panel.
2. *Remove for viewers* — `.select("id,full_name,position,department,phone_extension,avatar_url,active")` in `app/page.tsx`, admins unaffected. One line, but it deletes a feature staff may rely on. Column-level control via a viewer-facing view that omits `email` would be stronger than trimming the select.

**Effort:** n/a (accepted)

#### [SEC-04] Dependency vulnerabilities: 9 high, all development-only
**Severity:** Low
**Evidence:** `npm audit` reports `{"high":9,"critical":0,"total":9}` — every one in the `eslint` → `minimatch` → `brace-expansion` chain (`brace-expansion`: DoS via unbounded expansion). All are `devDependencies` (`package.json:34-54`); the four runtime dependencies (`@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`) are clean.
**Impact:** No production runtime exposure. CI build time only.
**Fix:** Track upstream; do not force a global `brace-expansion` v5 override, which breaks eslint's own resolution. Re-check when `eslint-config-next` moves to minimatch 10.
**Effort:** S

---

### C. Performance & Scalability — **B−**

Load performance is good and the database scales cleanly. The grade is held down by one correctness-shaped scaling failure and a render architecture that fights the primary interaction.

**Measured** (production build, local Supabase, 1440×900, `screenshots/scale-*.png`):

| Dataset | Route | Navigation | TTFB | LCP | CLS | DOM nodes | Markers rendered |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 90 seats | `/` | 851 ms | 155 ms | 220 ms | 0.023 | 1,115 | 90 |
| 90 seats | `/admin` | 894 ms | 181 ms | 268 ms | 0.035 | 654 | 92 |
| 500 seats | `/` | 1,050 ms | 206 ms | 388 ms | 0.025 | 2,856 | 500 |
| 500 seats | `/admin` | 1,136 ms | 227 ms | 312 ms | 0.035 | 2,809 | 502 |
| 2,000 seats | `/` | 1,318 ms | 233 ms | 320 ms | 0.025 | 4,852 | **1,000** |
| 2,000 seats | `/admin` | 1,494 ms | 290 ms | 376 ms | 0.035 | 5,322 | **1,002** |

LCP stays under 400 ms and CLS under 0.04 throughout; navigation grows sub-linearly (851 → 1,494 ms for a 22× dataset). **Where it breaks is not latency — it is completeness at 1,000 rows.**

**What is genuinely good**

- LCP and CLS are well inside "good" thresholds at every size tested.
- The floor-plan raster is preloaded during login (`app/login/page.tsx:13`) so it is warm before the map mounts.
- Expensive geometry is memoized and deliberately cache-stable in the default view (`components/seat-map/SeatMap.tsx:2398-2453`).
- Panning avoids React entirely, mutating `scrollLeft`/`scrollTop` through a ref (`components/seat-map/SeatMap.tsx:1567-1579`).
- Row-security predicates on the hot tables use the `(SELECT app_private.is_admin())` InitPlan form, so the helper runs **once per query** rather than once per row (`supabase/migrations/005_policy_advisor_cleanup.sql:9-75`).

#### [PERF-01] The map silently renders only 1,000 seats
**Severity:** Medium
**Evidence:** With 2,000 draft and 2,000 published seats in the database, the viewer rendered **1,000** markers and the admin map **1,002** — measured by counting `button[aria-pressed]` in the live DOM. No error, no console warning, no UI indication. The cap is PostgREST's row ceiling (`supabase/config.toml:18`: `max_rows = 1000`). The application has no defence: `app/page.tsx:33-37` and `app/admin/page.tsx:42-52` issue unbounded `.select()` calls with no `.limit()`, no `.range()` pagination and no `count` request — the only `.limit()` in `app/actions.ts` is the publish-history page size at `:788`.
**Impact:** Past 1,000 seats the floor plan is **wrong while looking right**. Half the office silently disappears; an admin could publish a map believing it complete. Today's 90 seats are far from the ceiling, so this is latent — but it fails silently rather than loudly, which makes it the finding most likely to cause a real incident later.
**Fix:** Request an exact count and fail loudly on truncation.
```ts
// app/page.tsx
const { data: seatRows, error: seatsError, count } = await supabase
  .from("seats")
  .select("*", { count: "exact" })
  .eq("layer", "published")
  .order("label");

if (count != null && seatRows && count > seatRows.length) {
  throw new Error(
    `Seat map truncated: ${seatRows.length} of ${count} seats returned. ` +
    `Raise the PostgREST max-rows limit or paginate before publishing.`
  );
}
```
Apply the same guard in `app/admin/page.tsx` and `app/actions.ts:64-84` (`getDraftMapPayload`). Longer term, paginate with `.range()`. **Note:** the 1,000 figure comes from the *local* `config.toml`; the production project's API row limit is a dashboard setting I cannot see (Appendix E) — the missing application-side guard is the finding either way.
**Effort:** S

#### [PERF-02] Seat markers re-render on every pointer move during a drag
**Severity:** Medium
**Evidence:** `SeatMarker` is a plain function component with **no `React.memo`** (`components/seat-map/SeatMarker.tsx:134`), rendered from an inline `.map()` over all seats (`components/seat-map/SeatMap.tsx:3290-3337`). `handleMapPointerMove` calls `setLocalSeats` on **every** `pointermove` (`:1956-1966`), replacing the array identity — so the entire 3,871-line component re-renders, the per-marker loop re-runs `matchesFilters`, `getMarkerViewportPlacement` and `getOfficePlateLayout` for every seat (`:3291-3299`), and memos keyed on `localSeats` recompute (`:988-996`, `:2444-2453`). Measured: **25 pointer moves took 801 ms — 32 ms per frame (~31 fps)** at scale.
**Impact:** Dragging a seat feels heavy on the primary admin workflow, and cost grows with seat count.
**Fix:** Memoize the marker and keep drag position out of the shared array.
```tsx
// components/seat-map/SeatMarker.tsx
export const SeatMarker = React.memo(function SeatMarker(props: SeatMarkerProps) {
  /* …unchanged… */
}, (a, b) =>
  a.seat.id === b.seat.id &&
  a.seat.x === b.seat.x && a.seat.y === b.seat.y &&
  a.seat.status === b.seat.status && a.seat.label === b.seat.label &&
  a.seat.employee_id === b.seat.employee_id &&
  a.isSelected === b.isSelected && a.tabIndex === b.tabIndex && a.isDimmed === b.isDimmed
);
```
Then hold the in-flight drag in a separate `draggingSeat` state that only the dragged marker consumes, and commit into `localSeats` once on pointer-up. Verify with the React Profiler that a drag frame updates one marker, not all of them.
**Effort:** M

#### [PERF-03] Client JavaScript is ~1.45 MB across chunks, largely one component
**Severity:** Low
**Evidence:** `.next/static/**/*.js` totals **1,453 KB**; largest chunks 242 KB, 222 KB, 134 KB, 113 KB, 110 KB. Both entry pages are thin servers handing everything to large client components: `app/page.tsx` (91 lines) → `ViewerSeatFinder` (1,365 lines, `"use client"` at `:1`); `app/admin/page.tsx` (100 lines) → `SeatMap` (3,871 lines, `"use client"` at `:1`).
**Impact:** Slower first load on constrained connections, especially for viewers who need only a read-only map.
**Fix:** `next/dynamic` the admin-only subtrees (`AskPlannerDrawer`, the five dialogs) with `ssr: false` so viewers never download them; split `SeatMap` per CODE-02.
**Effort:** M

#### [PERF-04] Department and zone policies evaluate their helper per row
**Severity:** Low
**Evidence:** `department_options` and `zone_options` policies call `app_private.is_admin()` bare, without the `(SELECT …)` wrapper (`supabase/migrations/009_v105_management_csv_cleanup.sql:56,63,70,78,85,92,99,107`; confirmed in `pg_policies`). Every other table uses the InitPlan-cached form.
**Impact:** Negligible now — 7 departments and 8 zones. It becomes a real cost only if these tables grow substantially, and it is an inconsistency that invites copying.
**Fix:** `using ((select app_private.is_admin()))` in a new migration, matching the other five tables.
**Effort:** S

---

### D. Code Quality & Architecture — **B−**

Type discipline and test coverage are excellent and unusual for a private application. The architecture is undermined by one enormous component, hand-maintained database types, and no validation library at the boundaries.

**What is genuinely good**

- **Zero TypeScript escape hatches.** Across every `.ts`/`.tsx` in `app/`, `lib/` and `components/`: no `: any`, no `as any`, no `@ts-ignore`, no `@ts-expect-error`, no non-null assertions. `strict: true` (`tsconfig.json:11`). This is rare and worth protecting.
- **Zero `TODO`/`FIXME`/`HACK`/`XXX`** in tracked source or migrations.
- **70 test files, 10,692 lines**, spanning behaviour tests, jsdom component tests, real-browser Playwright tests, an authenticated e2e publish tier, and — notably — **a PGlite tier that applies the real migrations and executes the actual RPCs** (`tests/rpc-execution.test.mjs`, `tests/rls-execution.test.mjs` via `tests/helpers/pgHarness.mjs`). Transaction guarantees are verified against real SQL, not grepped.
- **CI gates lint, typecheck, coverage floors, build, and three Playwright tiers** on every PR and push to `main` (`.github/workflows/ci.yml:14-124`), including an authenticated tier against a throwaway Supabase (`:99-110`).
- **Multi-row mutations consistently go through transactional RPCs** rather than sequential client calls — `update_draft_seat`, `swap_draft_seat_assignments`, `import_assignments_csv`, `restore_draft_snapshot`, `publish_seat_map`, `reset_draft_seats_to_published`, plus the management functions.
- **Comments explain *why*, and are unusually high-value** — e.g. `app/actions.ts:336-340` records that thrown errors get digest-stripped in production, which is why validation failures are returned rather than thrown. That is institutional knowledge captured at the point of use.
- Only **8 `eslint-disable` comments** in the whole tree, all single-line and narrowly scoped.

#### [CODE-01] No schema validation at any trust boundary
**Severity:** Medium
**Evidence:** No `zod`, `yup` or `valibot` in `package.json:27-54` and zero imports anywhere. Validation is `lib/validators.ts` — 36 lines providing `assertNonEmpty`, `normalizeSeatStatus` and a coordinate clamp. Server actions accept structurally-typed objects and forward them largely unchecked: `createEmployeeAction` (`app/actions.ts:476-506`) validates only that `fullName` is non-empty; `position`, `department`, `phoneExtension` and `email` are trimmed and passed straight through. `email` is never format-checked in TypeScript, and `supabase/migrations/20260710120000_employee_email.sql` adds no `CHECK` constraint. TypeScript types are **compile-time only** — an action invoked over the wire (which I demonstrated is possible) receives whatever the caller sends.
**Impact:** Malformed data is caught by Postgres constraints if one happens to exist and otherwise stored as-is. Errors surface as raw database messages rather than field-level feedback. Every new action must remember to hand-validate.
**Fix:** Introduce a schema layer and parse at the action boundary.
```ts
// lib/schemas.ts (new)
import { z } from "zod";

export const employeeInput = z.object({
  fullName: z.string().trim().min(1, "Employee name is required.").max(120),
  position: z.string().trim().max(120).nullish(),
  department: z.string().trim().max(120).nullish(),
  phoneExtension: z.string().trim().max(20).nullish(),
  email: z.string().trim().email("Enter a valid email address.").max(254).nullish().or(z.literal(""))
});
```
```diff
 export async function createEmployeeAction(input: {…}) {
   const supabase = await requireAdmin();
-  const fullName = assertNonEmpty(input.fullName, "Employee name");
-  const department = normalizeOptionalText(input.department);
+  const parsed = employeeInput.safeParse(input);
+  if (!parsed.success) {
+    return { ok: false as const, code: "VALIDATION" as const, message: parsed.error.issues[0].message };
+  }
+  const { fullName } = parsed.data;
+  const department = normalizeOptionalText(parsed.data.department);
```
Reuse the same schemas client-side to close UX-02. Note the existing convention: **return** validation failures rather than throwing, so the message survives production digest-stripping (`app/actions.ts:336-340`).
**Effort:** M

#### [CODE-02] `SeatMap.tsx` is a 3,871-line client component
**Severity:** Medium
**Evidence:** `components/seat-map/SeatMap.tsx` is 3,871 lines — **~18% of the entire 21,589-line source tree** — as a single exported function beginning at `:285`. It holds roughly **49 `useState`**, **40 `useEffect`**, 20 `useMemo`, 20 `useRef` and 9 `useCallback`, plus five dialogs, all drag logic, filtering, publish review and the whole render tree. It contains 4 of the project's 8 `eslint-disable` comments (`:416,:883,:893,:1668`, all `react-hooks/exhaustive-deps`). Relatedly, `eslint.config.mjs:25` demotes `react-hooks/set-state-in-effect` to a non-blocking `warn` for ~15 sync-in-effect sites.
**Impact:** Every admin-map change carries whole-file regression risk; the file is hard to review, hard to test in isolation, and directly causes PERF-02. The four suppressed dependency-array warnings are exactly the class of bug that produces stale-closure defects.
**Fix:** Extract along seams that already exist, without changing behaviour:
1. `useSeatDrag()` — drag state and pointer handlers (`:1944-2013`).
2. `useSeatSelection()` — selection, roving tabindex, keyboard nav (`:1109-1128`).
3. `usePublishReview()` — publish diff and dialog state (`:2125-2147`).
4. Move each of the five dialogs into its own component under `components/seat-map/dialogs/`.
Extract one hook per PR with the browser tier green between each. The existing Playwright SeatMap tier makes this refactor genuinely safe.
**Effort:** L

#### [CODE-03] Database types are hand-written and can drift silently
**Severity:** Low
**Evidence:** No generated types file exists — a glob for `*types*` under `lib/`, `supabase/` and `types/` returns only the hand-written `lib/types.ts`. It is currently accurate (I verified `zone`, `is_custom`, `phone_extension`, `email` and `updated_at` against the migrations), but the drift risk is visible in the type itself: `zone` and `is_custom` are optional (`lib/types.ts:50,53`) while every sibling column is required, because they were later `ALTER TABLE` additions. Rows are cast rather than parsed (`app/page.tsx:46`, `app/admin/page.tsx:88-92`), so a schema change surfaces at runtime, not at compile time.
**Impact:** A migration that renames or drops a column type-checks clean and fails in production.
**Fix:** Generate and commit types, then gate on freshness:
```bash
npx supabase gen types typescript --local > lib/database.types.ts
```
Add a CI step that regenerates and fails on `git diff --exit-code lib/database.types.ts`, and type the clients with `createServerClient<Database>(…)`.
**Effort:** M

#### [CODE-04] Coverage floors cover `lib/` only; one module is unreachable
**Severity:** Low
**Evidence:** `.c8rc.json:3-4` sets `"all": false` with `include: ["lib/**/*.ts"]`, so the 90/95/80 floors enforced by `npm run coverage:check` (`package.json:25`) never measure `app/` or `components/` — including the 3,871-line `SeatMap.tsx` and all 21 server actions. Separately, `lib/seatClusters.ts` has **zero production import sites**; its only reference is its own test (`tests/seat-clusters.test.mjs:10`), whose comment concedes it is kept "for potential future scale work" (`:65`). Dead code that also inflates the coverage denominator.
**Impact:** The headline coverage number describes the best-tested third of the codebase. Server actions are covered by source-assertion tests but not execution coverage.
**Fix:** Delete `lib/seatClusters.ts` and its test, then extend the c8 include to `app/actions.ts` with its own floor before widening further.
**Effort:** S

#### [CODE-05] Migration history carries 11 placeholder files and a dual numbering scheme
**Severity:** Low
**Evidence:** `supabase/migrations/` holds 45 files: 12 legacy `00N_*` plus 33 timestamped. **Eleven are no-ops** whose body is literally `select 1;` — including two byte-identical pairs (`20260506235849_placeholder.sql` / `20260520235335_placeholder.sql`, md5 `0642f7fd…`; and `20260506223948_…` / `20260507000032_…`, md5 `3f06c94b…`). Four more reconcile PR #32's ledger while the real bodies live in the `20260616000x00_*` files. There are **no down/rollback files** anywhere; `20260724150000_reset_draft_staged_writes.sql:1-3` supersedes an earlier migration rather than reverting it.
**Impact:** A newcomer cannot tell which file is authoritative without diffing. Forward-only with no rollback means a bad migration must be fixed by another migration under incident pressure.
**Fix:** Add `supabase/migrations/README.md` explaining the shim convention and naming the authoritative file for each duplicated pair; adopt a `-- Rollback:` comment block in every new migration.
**Effort:** S

---

### E. Infrastructure & Deployment — **C+**

CI is genuinely strong. The grade reflects that most of this category — Vercel settings, environment scoping, preview exposure, backups, monitoring, access control — is **not visible from the repository**, and the parts I can see contain a documented practice that puts production at avoidable risk.

**What is genuinely good**

- **Every gate that matters runs on every PR and push to `main`** (`.github/workflows/ci.yml:26-38`): `npm ci`, lint, typecheck, `coverage:check` with enforced floors, and a production build.
- **Three separate Playwright tiers in CI** (`:57-64,:115-116`), including authenticated publish-flow tests against a real local Supabase (`:99-110`).
- **The seed script is deliberately incapable of touching a hosted database** — it shells through `docker exec` with no connection string, and the header explains that this is the point (`scripts/seed-local-db.mjs:1-10,28-31`). Auto-seeding is disabled in `config.toml` specifically because it had previously seeded internet-reachable preview branches with repo-committed passwords. That is a real past incident, correctly fixed.
- **Migrations are applied by integration rather than by hand**, keeping schema changes tied to merges.

#### [INFRA-01] The README directs all local development at the production database
**Severity:** Medium
**Evidence:** `README.md:19-23` states: "**Local dev writes to PRODUCTION.** `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at the live Supabase project — there is no dev or staging database… treat any local publish as a production deploy." This is **contradicted by the repository itself**: `package.json:21-23` ships `db:start`, `db:seed` and `db:stop`; `scripts/seed-local-db.mjs` exists specifically to seed it; and CI's `e2e-auth` job already runs the full authenticated suite against exactly such a stack (`.github/workflows/ci.yml:99-100`). I confirmed the local path works end-to-end in this review: `npx supabase start` applied all 45 migrations cleanly and the app ran against it with a one-line env override, `.env.local` untouched. The README documents 6 of 17 scripts and omits the entire local-database workflow.
**Impact:** Every developer follows the documented path and points a live application at production data, one click away from `publishSeatMapAction` overwriting the real map. The safe path exists, is CI-proven, and is invisible in the documentation.
**Fix:** Replace the warning with the local workflow and keep the caution scoped to the case where it applies.
```diff
-> ⚠️ **Local dev writes to PRODUCTION.** `.env.local` points
-> `NEXT_PUBLIC_SUPABASE_URL` at the live Supabase project — there is no dev or
-> staging database.
+## Local development (recommended)
+
+Run against a disposable local Supabase stack — never production:
+
+    npm run db:start   # applies every migration in supabase/migrations
+    npm run db:seed    # creates local admin + viewer accounts
+    npm run dev        # http://localhost:3000
+
+`npm run db:start` prints a local API URL and anon key. Put them in `.env.local`,
+or export them for a single run — process environment variables take precedence:
+
+    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
+    NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npm run dev
+
+> ⚠️ Only if you deliberately point `.env.local` at the live project does local
+> dev write to PRODUCTION — and then **Publish updates the live map for real
+> viewers.** Prefer the local stack for all routine work.
```
Also document `test:db`, `test:ct`, `test:browser`, `test:e2e`, `test:e2e:auth`, `coverage` and `coverage:check`.
**Effort:** S

#### [INFRA-02] The app-level snapshot is not a database backup
**Severity:** Low
**Evidence:** `/admin/settings` offers JSON snapshot export and `restoreDraftSnapshotAction` (`app/actions.ts:704-752`), and the page describes itself as "Import, export, and recovery tools" (`app/admin/settings/page.tsx:56-58`). Its actual scope is narrow: it restores **draft seats and employees only** (`:719-720`), never the published layer, `publish_events`, `profiles` or auth users. Nothing in the UI or README states this, and no documentation of Supabase PITR or a tested restore path exists anywhere in the repository.
**Impact:** "Recovery tools" invites treating the snapshot as a backup. In a real data-loss event it would restore a fraction of the system, discovered mid-incident.
**Fix:** Retitle the panel "Draft working-copy snapshots", add one line stating it does not back up the published map or user accounts and is not a substitute for database backups, and record the real backup and restore procedure in the README. Then actually rehearse a Supabase restore once and note the date.
**Effort:** S

#### [INFRA-03] Next.js 16 deprecation warning on every build and boot
**Severity:** Low
**Evidence:** Emitted by both `npm run dev` and `npm run build`:
```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```
`middleware.ts:1-12` still uses the old convention, and the build output labels the entry `ƒ Proxy (Middleware)`.
**Impact:** None today; the session-refresh layer breaks on a future major upgrade.
**Fix:** Rename `middleware.ts` → `proxy.ts` and rename the export per the Next.js migration note, then confirm session refresh still works across all three contexts.
**Effort:** S

---

## 4. Appendices

### Appendix A — Route × role matrix

Captured live against the dev server; 18 combinations, screenshots in `screenshots/`. Every response was HTTP 200 (Next.js renders auth failures rather than returning 401/403). **Zero console errors and zero failed network requests across all 18.**

| Route | Anonymous | Viewer | Admin |
| --- | --- | --- | --- |
| `/` | → `/login?next=/`, h1 "Sign in" | 200, h1 "Seat Planner — office map", published data only | 200, same as viewer |
| `/admin` | → `/login?next=/admin` | 200, h1 "**Admin access required**", **no seat/employee data in payload** | 200, h1 "Seat Planner — admin map", draft data |
| `/admin/management` | → `/login?next=/admin/management` | 200, h1 "Admin access required", no data | 200, h1 "Management" |
| `/admin/settings` | → `/login?next=/admin/settings` | 200, h1 "Admin access required", no data | 200, h1 "Settings" |
| `/login` | 200, sign-in form | 200, "Already signed in" card | 200, "Already signed in" card |
| `/concepts/map-redesign` | **200 in dev**, **404 in production build** | same | same |
| `/concepts/component-state-board` | **404 in production build** | same | same |
| `/auth/signout` | POST-only, 303 → `/login` | same | same |
| `/auth/confirm`, `/auth/callback` | GET, redirect to `next` or `/login?error=…` | same | same |

**Draft-leak canary result:** `ZZCANARYDRAFT`, `canary-note-do-not-leak` and `Canary DraftOnly` appear **only** in the three admin routes under an admin session — never in anonymous or viewer payloads.

**Protection location:** page bodies via `getAdminPageContext` (`lib/adminPageGuard.ts:8-25`), not middleware. `middleware.ts` only refreshes the session cookie. This is acceptable **because** the admin pages return the denial view before issuing any data query (`app/admin/page.tsx:12-40`, `app/admin/management/page.tsx:25-36`, `app/admin/settings/page.tsx:12-23`) and RLS independently denies the data.

### Appendix B — Server action inventory and authorization status

All 21 exported actions live in `app/actions.ts`, the **only** file in the repository containing `"use server"`. Every one calls `requireAdmin()` (`app/actions.ts:26-46`) as its first statement — verified by reading each, and enforced in CI by `tests/require-admin-guard-source.test.mjs` (AST-based).

| Action | Line | Writes | `requireAdmin()` first? | Live viewer replay |
| --- | --- | --- | --- | --- |
| `askPlannerAction` | 92 | none (read-only) | yes `:95` | — |
| `createSeatAction` | 231 | `seats` (draft), `zone_options` | yes `:237` | — |
| `moveSeatAction` | 292 | `seats` (draft, fenced) | yes `:299` | — |
| `updateSeatAction` | 341 | RPC `update_draft_seat` | yes `:356` | **rejected** |
| `swapSeatAssignmentsAction` | 421 | RPC `swap_draft_seat_assignments` | yes `:428` | RPC rejected |
| `createEmployeeAction` | 476 | `employees`, `department_options` | yes `:483` | — |
| `updateEmployeeAction` | 508 | `employees`, `department_options` | yes `:516` | — |
| `deleteEmployeeAction` | 544 | RPC `deactivate_employee` | yes `:545` | RPC rejected |
| `createDepartmentAction` | 556 | `department_options` | yes `:557` | — |
| `renameDepartmentAction` | 571 | RPC `rename_department` | yes `:572` | — |
| `deleteDepartmentAction` | 587 | RPC `delete_department` | yes `:588` | RPC rejected |
| `createZoneAction` | 601 | `zone_options` | yes `:602` | — |
| `renameZoneAction` | 616 | RPC `rename_zone` | yes `:617` | — |
| `deleteZoneAction` | 631 | RPC `delete_zone` | yes `:632` | — |
| `deleteSeatAction` | 644 | `seats` (draft, custom only) | yes `:645` | — |
| `importAssignmentsCsvAction` | 678 | RPC `import_assignments_csv` | yes `:679` | RPC rejected |
| `restoreDraftSnapshotAction` | 704 | RPC `restore_draft_snapshot` | yes `:714` | **rejected** |
| `resetDraftToPublishedAction` | 754 | RPC `reset_draft_seats_to_published` | yes `:762` | RPC rejected |
| `getPublishHistoryAction` | 779 | none (read) | yes `:780` | — |
| `publishSeatMapAction` | 821 | RPC `publish_seat_map` | yes `:822` | **rejected** |
| *(route handlers)* `app/auth/{confirm,callback,signout}/route.ts` | — | auth session only | n/a — pre-auth by design | anonymous → `You must be signed in.` |

"rejected" = I captured that action's real POST from an admin session and replayed it verbatim from an authenticated viewer session; the server returned `Admin permission required.` and the database was unchanged. Repeated against the production build via bundle-extracted action IDs — same result, digest-only error body.

### Appendix C — Data model and RLS policies

Read from `pg_policies` in the running database, not from migration text. RLS is **enabled on all 7 tables** (`relrowsecurity = true`); none uses `FORCE` (irrelevant here — PostgREST connects as `authenticated`, never the table owner).

| Table | Command | Policy | `USING` | `WITH CHECK` |
| --- | --- | --- | --- | --- |
| `seats` | SELECT | `seats_select_published_or_admin` | `layer = 'published' OR (SELECT app_private.is_admin())` | — |
| `seats` | INSERT | `seats_insert_admin_only` | — | `(SELECT app_private.is_admin())` |
| `seats` | UPDATE | `seats_update_admin_only` | `(SELECT app_private.is_admin())` | `(SELECT app_private.is_admin())` |
| `seats` | DELETE | `seats_delete_admin_only` | `(SELECT app_private.is_admin())` | — |
| `employees` | SELECT | `employees_select_authenticated` | `(SELECT app_private.is_admin())` | — |
| `employees` | INSERT/UPDATE/DELETE | `*_admin_only` | `(SELECT app_private.is_admin())` | `(SELECT app_private.is_admin())` |
| `published_employees` | SELECT | `published_employees_select_authenticated` | **`true`** | — |
| `published_employees` | INSERT/UPDATE/DELETE | *(none — writes denied)* | — | — |
| `profiles` | SELECT | `profiles_select_own_or_admin` | `id = (SELECT auth.uid()) OR (SELECT app_private.is_admin())` | — |
| `profiles` | UPDATE | `profiles_update_admin_only` | `(SELECT app_private.is_admin())` | `(SELECT app_private.is_admin())` |
| `profiles` | INSERT/DELETE | *(none — denied; rows created by `SECURITY DEFINER` trigger)* | — | — |
| `publish_events` | SELECT/INSERT | `*_admin_only` | `(SELECT app_private.is_admin())` | `(SELECT app_private.is_admin())` |
| `department_options` | SELECT | `department_options_select_authenticated` | `active = true OR app_private.is_admin()` (unwrapped) | — |
| `department_options` | INSERT/UPDATE/DELETE | `*_admin_only` | `app_private.is_admin()` (unwrapped) | `app_private.is_admin()` |
| `zone_options` | *(identical to `department_options`)* | | (unwrapped) | |

"unwrapped" = per-row helper evaluation, see PERF-04.

**Grants.** `anon` holds only `REFERENCES, TRIGGER, TRUNCATE` on 6 tables (platform defaults) — **no** SELECT/INSERT/UPDATE/DELETE, and no route reaches TRUNCATE. `authenticated` and `service_role` hold full DML on all 7, gated entirely by RLS (`supabase/migrations/20260727190000_declare_table_grants.sql:48-56`) — the documented Supabase model.

**Function privileges.** `anon` can execute **no** business function. All eight mutating RPCs are `SECURITY INVOKER` (so RLS applies to the caller) *and* each independently raises `Admin permission required.` The one `SECURITY DEFINER` path, `app_private.publish_seat_map()`, checks `app_private.is_admin()` before writing (`supabase/migrations/20260708230000_published_employee_snapshot.sql:65-67`). Two layers, both verified live.

**Publish atomicity.** `publish_seat_map()` performs delete-published → insert-from-draft → replace `published_employees` → insert `publish_events` in a **single plpgsql function**, therefore one transaction. A mid-publish failure rolls back entirely; a half-published map is not reachable. The `where true` on the delete is required by Supabase's `pg-safeupdate` and is deliberate (`:106-108`). Audit trail: `publish_events(published_by, seat_count, change_summary, created_at)`, admin-readable via `getPublishHistoryAction` (`app/actions.ts:779-819`). **There is no rollback-to-previous-publish feature** — the only recovery is re-publishing a corrected draft.

### Appendix D — Environment and commands used

```
# Local stack (Docker Desktop had to be started first)
npx supabase start                 # applied all 45 migrations cleanly
npm run db:seed                    # local admin + viewer accounts
docker exec -i supabase_db_seat-planner psql -U postgres -d postgres -f - \
  < <scratchpad>/seed-review-data.sql    # scaled to review volumes

# App against LOCAL only — process env overrides .env.local, which was never edited
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npm run dev      # :3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npm run build
PORT=3001 ... npm run start                                     # :3001 production build

npm audit                          # 9 high, all devDependencies
```

Seeded dataset: **90 draft / 90 published seats, 67 active employees, 60 assigned, 30 unassigned seats, 7 unseated people, 7 departments, 8 zones**, one admin and one viewer account. Driver scripts (route matrix, action replay, XSS render, scale test) were written to a scratchpad directory, never to the repository.

**Verified correct in the README:** every command in its Scripts table exists, and `.env.local.example`, `docs/magic-link-auth.md` and `BASELINE_NOTES.md` are all present. The inaccuracy is the omission described in INFRA-01, not a broken command.

### Appendix E — Unverified items

Each of these could not be settled from the repository or local testing. None is assumed either way in the grades above; Infrastructure's C+ reflects this uncertainty rather than assuming the worst.

1. ~~**Production cookie attributes.**~~ **RESOLVED 2026-07-28** — verified against production: `httpOnly=false`, **`secure=false`**, `sameSite=Lax`, ~13-month expiry, and the cookie is written client-side (no `Set-Cookie` header). Folded into SEC-02, whose fix section is revised accordingly.
2. ~~**Production security headers.**~~ **RESOLVED 2026-07-28** — production originally served only `Strict-Transport-Security: max-age=63072000` (Vercel-set) plus `X-Powered-By: Next.js`. SEC-01 was fixed, merged as PR #267 and verified live; all six headers now present and `X-Powered-By` removed. See the Remediation log in section 5.
3. **Production PostgREST row limit.** The 1,000-row cap I measured comes from local `supabase/config.toml:18`. The hosted project's API row limit is a dashboard setting. Needs Supabase → Settings → API → Max rows. **The missing application-side guard (PERF-01) stands regardless.**
4. **Preview-deployment exposure.** No `vercel.json` and no branch configuration in the repository. Whether preview URLs are publicly reachable and whether they point at the production Supabase project is the single highest-value unverified item — an unlisted preview of an HR-adjacent app is a real exposure. Needs Vercel → Project → Deployment Protection, plus preview env-var scoping.
5. **Environment-variable scoping across Production/Preview/Development**, and confirmation that no secret is exposed as `NEXT_PUBLIC_*` in the Vercel dashboard. The repository is clean (`.env.local.example` lists only the two client-safe values and two server-only values), and the built bundle is clean — but dashboard state is invisible to me.
6. **Backups, PITR and a tested restore path.** Nothing in the repository documents them. Needs Supabase → Database → Backups, and ideally one rehearsed restore.
7. **Rate limiting on auth and write actions; error tracking; uptime monitoring; log retention; branch protection on `main`; Vercel/Supabase/GitHub org access control; cost and quota headroom.** No repository evidence of any. Each needs the corresponding dashboard.

Additional items not reached in this pass, listed so they are not mistaken for passes: offline and slow-3G behaviour, session expiry mid-edit, the two-tab conflict path **through the UI** (the fence itself is verified at the RPC layer), snapshot restore round-trip through the UI, print/PDF output, tablet touch-drag, and a formal Lighthouse run (Core Web Vitals were instead measured directly via `PerformanceObserver` and are reported in section C).

---

## 5. Remediation log

### SEC-01 — security response headers — **fixed 2026-07-28**

**Changed:** `next.config.js` only. One `async headers()` entry applying to `/:path*`. `outputFileTracingRoot` and `images.localPatterns` are unchanged.

Headers now served on every route and static asset:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:;
  connect-src 'self' http://127.0.0.1:54321; frame-ancestors 'none';
  base-uri 'self'; form-action 'self'; object-src 'none'
```

**Three decisions worth knowing:**

- **`connect-src` is derived from `NEXT_PUBLIC_SUPABASE_URL`,** not hardcoded, so local and production work from one definition (verified resolving to `http://127.0.0.1:54321` locally). A missing or malformed value falls back to `https://*.supabase.co` — looser but never a broken page.
- **CSP is enforced in production only.** `next dev` needs `eval` and an HMR websocket that this policy forbids; applying it there breaks fast refresh while protecting nobody. Verified: dev serves `X-Frame-Options` but no CSP.
- **CSP was enforced directly, not shipped as Report-Only** as originally recommended, because runtime verification came back completely clean — see below. Report-Only would have delayed real protection with no information gained.
- **`script-src` keeps `'unsafe-inline'`,** which the App Router requires for its inline RSC-streaming scripts absent a per-request nonce. This is an honest limitation: it means the CSP does **not** stop injected inline script. What it does enforce is `frame-ancestors`, `base-uri`, `form-action`, `object-src` and `connect-src` — which block clickjacking, base-tag hijacking, form exfiltration, plugin embedding, and exfiltration to an attacker-controlled origin. Tightening to a nonce is a separate, larger change.
- **HSTS omits `preload`** deliberately: preload-list submission is effectively irreversible and belongs to the domain owner, not to a default.

**Verification performed** (production build against the local stack):

| Check | Result |
| --- | --- |
| Headers present on `/login` and on a static asset | all 6 present |
| `connect-src` resolved from env | `http://127.0.0.1:54321` |
| Admin sign-in through the browser | OK, landed on `/` |
| Viewer map render | 90 markers, floor-plan image loaded |
| Admin map render | 92 markers |
| CSV export `blob:` path | blob URL created OK |
| CSP violations (console + `securitypolicyviolation` DOM event) | **none** |
| Other console errors | **none** |
| Framing from a foreign origin | **blocked** — child frame committed `chrome-error://chromewebdata/` (`screenshots/csp-framing-blocked.png`) |
| Dev mode CSP absent (HMR safe) | confirmed — 0 CSP headers, `X-Frame-Options` still `DENY` |
| `npm run lint` | 0 errors (26 pre-existing warnings) |
| `npm run typecheck` | pass |
| `npm test` | **558 passed, 0 failed** |
| `npm run build` | pass |

**Note on one verification of mine that was inconclusive first time:** an initial framing test reported the iframe as "opaque", which proves nothing — a cross-origin frame is opaque under the same-origin policy whether or not framing was refused. The decisive signal is the child frame's committed URL, re-tested above.

**Still open from the SEC-01 family:** confirm production actually serves these headers after deploy (`curl -sI https://seats.megeredchianlaw.com/`), since Vercel may add or override at the edge — Appendix E item 2.
