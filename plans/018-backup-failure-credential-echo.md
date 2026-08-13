# Plan 018: Stop the backup script echoing the production DB credential on dump failure

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 985660a..HEAD -- scripts/backup-prod.mjs tests/backup-script-safety.test.mjs`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `985660a`, 2026-08-13

## Why this matters

`scripts/backup-prod.mjs` is the org's ONLY backup mechanism (Supabase Free
plan — no scheduled backups). On any dump failure, the catch block prints
`error.message` from `execFileSync` — and Node builds that message as
`Command failed: <binary> <...all args...>`, which includes
`--db-url postgresql://user:PASSWORD@host/db` verbatim. So every ordinary
failure (wrong password, network blip, CLI error) writes the production
Postgres credential — full read/write, bypassing RLS, the entire employee
directory — to stderr, terminal scrollback, and any pasted error report. The
comment directly above the line claims the opposite ("Never echo the command
line — it carries the database password"), and the existing source test's
regex only catches a *direct* `console.error(...dbUrl...)`, not this
indirection. Verified by live repro: an `execFileSync` failure's
`error.message` contained the full `--db-url` argument.

## Current state

- `scripts/backup-prod.mjs` — the backup script. The defect is the catch
  block at lines 113–116:

```js
  } catch (error) {
    // Never echo the command line — it carries the database password.
    fail(`The ${dump.name} dump failed. Nothing was verified; do not treat this run as a backup.\n${error.message}`);
  }
```

  `fail(message)` (lines 36–39) is `console.error(message); process.exit(1)`.
  The spawn at lines 108–112 passes
  `[cliEntry, "db", "dump", "--db-url", dbUrl, ...dump.args, "-f", file]`
  with `stdio: ["ignore", "inherit", "inherit"]` — so the Supabase CLI's own
  stderr already reaches the operator directly; `error.message` adds nothing
  except the argv echo.

- `tests/backup-script-safety.test.mjs` — existing safety suite. It has a
  `runScript(env)` helper (lines 19–30) that executes the script with a
  controlled env and captures `{ code, stderr }`, and it already uses a
  synthetic unreachable URL:

```js
const UNREACHABLE_DB_URL = "postgresql://user:pass@127.0.0.1:1/none";
```

  The relevant existing assertion (lines 57–59) is source-text only:

```js
  // The connection string carries the database password, so it must never be
  // echoed back — not in a log line and not in an error.
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*dbUrl/);
```

- Repo conventions: plain `node --test` assertions with
  `node:assert/strict`; tests explain *why* in comments. Model new test code
  on the two execution tests already in this file (lines 32–51).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if node_modules missing) | `npm install` | exit 0 (do NOT use `npm ci` — EPERMs on this Windows box) |
| This test file | `node --test tests/backup-script-safety.test.mjs` | all pass, 0 fail |
| Full unit suite | `npm test` | ~600+ pass / 0 fail (4 harness-heavy files can fail on node_modules drift — reinstall before suspecting your change) |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `scripts/backup-prod.mjs`
- `tests/backup-script-safety.test.mjs`

**Out of scope** (do NOT touch, even though they look related):
- The credential-passing mechanism itself (`--db-url` on the child argv).
  A separate recorded finding (S-04 in `plans/README.md`) covers argv
  visibility in the process table and was verdict'd "marginal — fix via
  child env if ever touched anyway". Do NOT expand this plan into that fix;
  the argv → env change touches the CLI invocation contract and needs its
  own verification against the Supabase CLI.
- The script's two existing safety properties: it must keep reading the URL
  from the process environment ONLY (never `.env.local`) and keep refusing
  to write inside the repo. `tests/backup-script-safety.test.mjs` pins both.
- `README.md` backup docs.

## Git workflow

- Branch: `advisor/018-backup-failure-credential-echo`
- Conventional commits, matching repo style (e.g. `fix(backup): never echo the connection string on dump failure`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the `error.message` interpolation with status-only text

In `scripts/backup-prod.mjs`, change the catch block (lines 113–116) so the
failure message carries the exit status but never `error.message`:

```js
  } catch (error) {
    // Never echo error.message here: execFileSync builds it as
    // "Command failed: <argv...>", which would print --db-url and the
    // database password it carries. The CLI's own stderr is inherited, so
    // the operator already saw the real diagnostics above this line.
    fail(`The ${dump.name} dump failed (exit status ${error.status ?? "unknown"}). Nothing was verified; do not treat this run as a backup.`);
  }
```

Two load-bearing details: keep the phrase `do not treat this run as a backup`
byte-identical (an existing test at
`tests/backup-script-safety.test.mjs:68` pins it with
`assert.match(source, /do not treat this run as a backup/)`), and use
`error.status` (the child's exit code on spawn-result errors), not
`error.code`.

**Verify**: `node --test tests/backup-script-safety.test.mjs` → all existing tests still pass.

### Step 2: Add an execution test that would have caught this

In `tests/backup-script-safety.test.mjs`, add one test using the existing
`runScript` helper. Use a URL with a distinctive canary password so the
assertion cannot false-pass on a generic word:

```js
test("a failed dump never echoes the connection string or its password", () => {
  // The dump itself must fail (unreachable host, port 1) AFTER the guards
  // pass, so this exercises the catch block in the dump loop — the path
  // where execFileSync's own error.message contains the full argv,
  // including --db-url. The canary password proves the credential is what
  // never surfaces, wherever the message text goes next.
  const canaryUrl = "postgresql://user:canary-sekret-77@127.0.0.1:1/none";
  const { code, stderr } = runScript({
    SUPABASE_DB_URL: canaryUrl,
    SEAT_PLANNER_BACKUP_DIR: path.join(ROOT, "..", "sp-backup-test")
  });
  assert.equal(code, 1, "an unreachable database must be a hard failure");
  assert.match(stderr, /dump failed/);
  assert.match(stderr, /do not treat this run as a backup/);
  assert.ok(!stderr.includes("canary-sekret-77"), "the database password must never appear in failure output");
  assert.ok(!stderr.includes(canaryUrl), "the connection string must never appear in failure output");
});
```

Note the destination dir: `path.join(ROOT, "..", "sp-backup-test")` is
outside the repo, so the repo-guard passes and execution reaches the dump
loop. The script creates that directory (`mkdirSync ... recursive`); that is
acceptable test residue outside the working tree, consistent with the
existing suite's use of the same path.

**Verify**: `node --test tests/backup-script-safety.test.mjs` → all pass,
including the new test. Then temporarily revert Step 1's change (restore the
`\n${error.message}` interpolation), rerun, and confirm the new test FAILS —
this proves the test detects the defect. Re-apply Step 1.

### Step 3: Strengthen the source pin

In the existing test `"the backup script never reads credentials from a file"`
(lines 53–60), extend the echo assertion so the indirect leak stays pinned at
the source level too. After the existing `doesNotMatch`, add:

```js
  assert.doesNotMatch(source, /error\.message/, "execFileSync error messages embed the full argv, --db-url included");
```

**Verify**: `node --test tests/backup-script-safety.test.mjs` → all pass.

### Step 4: Full gate

**Verify**: `npm test` → 0 fail. `npm run lint` → exit 0.

## Test plan

- New execution test (Step 2): failed dump with canary-password URL → exit 1,
  stderr carries the failure sentence, stderr contains neither the password
  nor the URL. Modeled on the two existing execution tests in the same file.
- Strengthened source pin (Step 3): `error.message` never referenced in the
  script.
- Mutation check (in Step 2's verify): reverting the fix makes the new test
  fail.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/backup-script-safety.test.mjs` exits 0; the new
      canary test exists and passes
- [ ] `grep -n "error.message" scripts/backup-prod.mjs` returns no matches
- [ ] `grep -c "do not treat this run as a backup" scripts/backup-prod.mjs` returns 1
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The catch block at `scripts/backup-prod.mjs:113-116` no longer matches the
  "Current state" excerpt.
- The new canary test fails AFTER Step 1 is applied — that means the
  credential reaches stderr through a second path (most likely the Supabase
  CLI itself echoing the URL on its inherited stderr). That is a bigger
  finding than this plan; report it rather than patching around it.
- The dump loop is never reached (exit before "dump failed") — the guard
  order changed and the test setup no longer matches the script.

## Maintenance notes

- If the argv→env change (S-04) is ever made, the canary test here is the
  regression net for it — it asserts on output, not mechanism, so it should
  survive unchanged.
- Reviewer: check that the failure message still tells the operator the run
  is NOT a backup — that sentence is the operationally load-bearing part.
- **Owner action, outside this plan**: if this script has EVER failed against
  production, treat the DB password as burned and rotate it in
  Supabase → Project Settings → Database, regardless of this fix landing.
