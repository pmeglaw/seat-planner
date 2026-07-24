# Plan 003: Close the control-character open redirect in `safeNextPath`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3119e16..HEAD -- lib/authMessages.ts lib/supabase/authRedirect.ts tests/auth-messages.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3119e16`, 2026-07-24

## Why this matters

`safeNextPath` is the app's only open-redirect guard for the post-login `next` parameter. It validates the **raw string** with two prefix checks, but the value is later consumed by `new URL(next, requestUrl.origin)` — and the WHATWG URL parser **strips ASCII tab/newline/carriage-return before parsing** and treats backslash as forward-slash in special-scheme URLs. So a `next` value that begins with a slash followed by a tab and then `//evil.example` (delivered percent-encoded — `searchParams.get` decodes it) passes both prefix checks and then re-parses as a protocol-relative URL: the victim completes a genuine sign-in on the real domain and is redirected to an attacker-chosen origin. Verified empirically at plan time on Node's URL implementation: a slash+tab+`/evil.com` string and a slash+newline+`/evil.com` string both pass the current guard and resolve to `https://evil.com/`. The value also survives the magic-link email round-trip (the login form embeds `next` into `emailRedirectTo`), so the crafted link can be delivered as a plausible "sign in to the seat planner" URL. No session token travels in the redirect, which caps severity — this is a phishing-grade open redirect, not a token leak.

## Current state

- `lib/authMessages.ts:42-45` — the entire guard:
  ```ts
  export function safeNextPath(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
    return value;
  }
  ```
- `lib/supabase/authRedirect.ts` — the consumer (both auth callback routes delegate here: `app/auth/callback/route.ts` and `app/auth/confirm/route.ts` are one-liners calling `completeAuthRedirect`):
  - line 18: `const next = safeNextPath(requestUrl.searchParams.get("next"));`
  - lines 26 and 35: `return NextResponse.redirect(new URL(next, requestUrl.origin));` — the sink where the stripped-character re-parse happens.
- `tests/auth-messages.test.mjs:53-59` — the existing pin (imports the REAL module via `importTsModule`), asserting only that `/admin` passes and that `https://…`, `//…`, a bare relative path, and `null` all return `/`. **No control-character or backslash case exists** — the gap is uncovered.
- Repo conventions: `lib/` modules are pure and dependency-free; tests import them through `tests/helpers/tsModuleLoader.mjs` (`importTsModule`); comments state the constraint the code can't show.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `npm install`       | exit 0 (`npm install`, not `npm ci`, on the maintainer's Windows box) |
| Tests     | `npm test`          | all pass (~400; known local-env flake on 4 harness-heavy files — `npm install` and retry before suspecting your change) |
| One file  | `node --test tests/auth-messages.test.mjs` | all pass (fast loop) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint      | `npm run lint`      | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `lib/authMessages.ts`
- `tests/auth-messages.test.mjs`

**Out of scope** (do NOT touch):
- `lib/supabase/authRedirect.ts` — the chokepoint fix in `safeNextPath` covers both routes; don't add a second guard there.
- `components/auth/LoginForm.tsx` — it forwards `next` into `emailRedirectTo`, but final consumption goes through `completeAuthRedirect` → `safeNextPath`, so the chokepoint covers it.
- `app/auth/*` routes, middleware.

## Git workflow

- Branch: `advisor/003-harden-safe-next-path`
- Commit style: conventional (e.g. `fix(auth): safeNextPath rejects control chars and re-validates origin`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the caller inventory

Run: `grep -rn "safeNextPath" app components lib tests --include="*.ts" --include="*.tsx" --include="*.mjs"`

Expected: the definition in `lib/authMessages.ts`, the single runtime caller in `lib/supabase/authRedirect.ts:18`, and the test file. If additional runtime callers exist, list them in your summary (the tightened guard is safe for any caller — a stricter pure function — but the reviewer should know the blast radius).

**Verify**: grep output matches the expectation (or the extra callers are recorded).

### Step 2: Harden the guard

Replace `safeNextPath` in `lib/authMessages.ts` with the version below. Two additions after the existing prefix checks: (a) reject any C0 control character, DEL, or backslash; (b) prove the value stays same-origin under the very parser the consumer uses.

The control-character regex must be the explicit unicode-escape class `[\u0000-\u001f\u007f\\]` — do **not** write a `[ -\\]` range (that is a printable-ASCII range from space to backslash and would wrongly reject `?`, digits, and `A`–`Z`).

```ts
export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  // The consumer re-parses this via `new URL(value, origin)`. The WHATWG
  // parser strips ASCII tab/newline/carriage-return anywhere in the input and
  // treats "\\" as "/" in special schemes, so a value like "/<TAB>//evil.example"
  // clears the prefix checks above and still resolves protocol-relative to a
  // foreign origin. Reject every C0 control, DEL, and backslash outright.
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  // Belt and suspenders: confirm the value stays same-origin under that parser.
  // The sentinel origin is arbitrary; only the origin equality matters.
  try {
    if (new URL(value, "https://sentinel.invalid").origin !== "https://sentinel.invalid") return "/";
  } catch {
    return "/";
  }
  return value;
}
```

Behavior contract to preserve: safe inputs are returned **unchanged** (not normalized), unsafe inputs return `"/"`. Do not change the function's signature or export shape.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Extend the pin test

In `tests/auth-messages.test.mjs`, extend the `"safeNextPath accepts local paths only"` test (or add a sibling test). Use JS string escapes (`\t`, `\n`, `\r`, `\\`) for the control/backslash cases — never paste a raw control byte into the source:

```js
// Positive: querystrings and hashes on local paths keep working unchanged.
assert.equal(safeNextPath("/admin?tab=people#top"), "/admin?tab=people#top");
// WHATWG-strip bypasses: a control character anywhere must reject.
assert.equal(safeNextPath("/\t//evil.example"), "/");
assert.equal(safeNextPath("/\n//evil.example"), "/");
assert.equal(safeNextPath("/\r//evil.example"), "/");
// Backslash is "/" to the URL parser in special schemes.
assert.equal(safeNextPath("/\\evil.example"), "/");
assert.equal(safeNextPath("/\\\\evil.example"), "/");
// A literal percent-encoded sequence is data, not structure — still a safe local path.
assert.equal(safeNextPath("/%09/notes"), "/%09/notes");
```

**Verify**: `node --test tests/auth-messages.test.mjs` → all pass. As proof the test bites: the control-character assertions MUST fail if you temporarily revert Step 2 (optional but recommended sanity check).

### Step 4: Full-suite gate

**Verify**: `npm test` → exit 0; `npm run lint` → exit 0.

## Test plan

- New cases in `tests/auth-messages.test.mjs` per Step 3 (bypass vectors + positive query/hash + percent-encoded-literal case), modeled on the existing `safeNextPath` test in the same file.
- Verification: the single-file run plus full `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/auth-messages.test.mjs` exits 0 and includes the new assertions (`grep -c "evil.example" tests/auth-messages.test.mjs` → ≥ 5)
- [ ] `grep -F "u0000" lib/authMessages.ts` returns the control-char class line (the reject-controls guard is present)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `safeNextPath` no longer matches the excerpt (someone already changed the guard).
- Step 1's grep reveals a caller that depends on `safeNextPath` *not* validating (e.g. one that passes already-encoded values expecting control chars back verbatim) — none is known, but if found, report before changing behavior.
- Any existing test fails after Step 2 for a reason other than the new strictness.

## Maintenance notes

- If a future feature needs cross-origin post-login redirects (none does today), the fix is an explicit allow-list in `safeNextPath` — never a loosening of these checks.
- Reviewers should scrutinize: that the sentinel-origin probe can't throw for legitimate paths (the try/catch returns `"/"` on parser failure, the safe default).
- Deferred, recorded in `plans/README.md`: `lib/supabase/authRedirect.ts` has no behavior test and is invisible to the coverage gate (the c8 config only counts imported files). A follow-up could test `completeAuthRedirect`'s three paths with injected doubles.
