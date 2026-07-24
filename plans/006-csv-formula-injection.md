# Plan 006: Neutralize CSV formula injection on export

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3119e16..HEAD -- lib/csv.ts tests/csv-import-export.test.mjs tests/csv-preview.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3119e16`, 2026-07-24

## Why this matters

`escapeCsvCell` quotes cells containing `"`, comma, or newline, but does not neutralize cells that **begin** with a formula character (`=`, `+`, `-`, `@`). When an admin opens the assignment-CSV export in Excel or Google Sheets, such a cell is evaluated as a formula (CSV/spreadsheet injection). The exported fields include `employee_name`, `position`, `department`, and `notes` — and those same fields are populated from **CSV import**, so a value can enter the system as data and leave as an executable formula with nobody ever typing it into a form. The authorship circle is small (admins only), which keeps likelihood low, but the import loop means it does not require an insider. This is the standard OWASP CSV-injection remediation: prefix at-risk cells with a single quote on export, and strip that guard quote on import so a round-trip is lossless.

## Current state

- `lib/csv.ts:184-188` — the escape helper (quoting only):
  ```ts
  function escapeCsvCell(value: unknown) {
    const text = String(value ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }
  ```
- `lib/csv.ts:190-196` — `stringifyCsv` calls `escapeCsvCell` for every header and cell.
- `lib/csv.ts:198-211` — `exportSeatsToAssignmentCsv` writes `employee_name`, `position`, `department`, `zone`, `notes`, etc. verbatim into the row objects.
- Import side (`lib/csv.ts`, the `parseCsvLine` / `validateRow` state machine, ~`:64-182`) — read it to find where a parsed field value is finalized; that is where a leading guard quote must be stripped on the way in. `app/actions.ts:645-665` invokes the import path.
- `tests/csv-import-export.test.mjs` — now imports the REAL `lib/csv.ts` via `importTsModule` (the inline-copy drift was fixed). No formula-injection case exists yet, so a fix would land uncovered.
- `tests/csv-preview.test.mjs` — imports the real parser; check whether it asserts on parsed field values (a leading-quote-strip change could touch its expectations).
- Repo conventions: pure `lib/` module, tests via `importTsModule`, constraint-stating comments.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `npm install`       | exit 0 (`npm install`, not `npm ci`) |
| Two files | `node --test tests/csv-import-export.test.mjs tests/csv-preview.test.mjs` | all pass (fast loop) |
| Tests     | `npm test`          | all pass (~400; 4-file local-env flake caveat) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint      | `npm run lint`      | exit 0 |

## Scope

**In scope**:
- `lib/csv.ts` (export guard + import strip)
- `tests/csv-import-export.test.mjs` (formula cases, both directions)

**Out of scope** (do NOT touch):
- The CSV header set / column order.
- `app/actions.ts` import path — the strip belongs in the parser so every caller benefits.
- Any change to the RFC-4180 quoting logic beyond adding the formula guard.

## Git workflow

- Branch: `advisor/006-csv-formula-injection`
- Commit style: conventional (e.g. `fix(csv): neutralize formula injection on export, strip guard on import`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the export guard

Modify `escapeCsvCell` in `lib/csv.ts` so a cell whose first character is a formula trigger is prefixed with a single quote **before** the existing quoting logic runs. Use a named constant for the trigger set so the import side can reference the same intent:

```ts
// OWASP CSV-injection guard: a cell starting with one of these is evaluated as
// a formula by Excel/Sheets. Prefix it with a single quote on export; strip
// that guard quote on import so a round-trip is lossless. The class also
// includes a leading TAB and CR, which some spreadsheet importers treat as
// formula lead-ins.
const CSV_FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

function escapeCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (CSV_FORMULA_TRIGGERS.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
```

Order matters: prefix first, then the standard quoting wraps the now-`'`-prefixed value correctly.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Strip the guard quote on import

Find where the parser finalizes a field value (in `parseCsvLine` or where `validateRow` reads raw fields — read `lib/csv.ts:64-182` to locate it). Strip **exactly one** leading `'` when it directly precedes a formula-trigger character, so a legitimately intended leading apostrophe on non-formula text is preserved:

```ts
// Undo the export-side formula guard (Step 1) so import(export(x)) === x.
function stripCsvFormulaGuard(value: string) {
  return value.startsWith("'") && /^[=+\-@\t\r]/.test(value.slice(1)) ? value.slice(1) : value;
}
```

Apply it at the single point where each imported cell value is produced. Do **not** strip on export and do not strip more than one quote.

**Verify**: `node --test tests/csv-import-export.test.mjs tests/csv-preview.test.mjs` → all pass (the existing round-trip assertions must still hold).

### Step 3: Add both-direction tests

In `tests/csv-import-export.test.mjs`, add cases (model on the existing export/round-trip tests in the file):

```js
// Export neutralizes a formula-leading name.
const csv = exportSeatsToAssignmentCsv([
  makeSeat({ employeeName: "=SUM(A1:A9)", notes: "+cmd", position: "-x", department: "@ref" })
]);
assert.match(csv, /'=SUM/);   // guarded
assert.match(csv, /'\+cmd/);
assert.match(csv, /'-x/);
assert.match(csv, /'@ref/);

// Round-trip: import(export(x)) recovers the original value (guard stripped).
const parsed = parseAssignmentCsv(csv);   // use the file's actual import entry point
assert.equal(parsed.rows[0].employee_name, "=SUM(A1:A9)");

// A legitimate leading apostrophe on ordinary text is preserved (not over-stripped).
assert.equal(stripOrParse("'hello"), "'hello");   // adapt to the real API
```

Use whatever seat-factory / import entry point the existing tests in this file already use (read them first — do not invent `makeSeat`/`parseAssignmentCsv` names; match the file). If `stripCsvFormulaGuard` is not exported, assert the round-trip through the public import function instead of unit-testing the helper.

**Verify**: `node --test tests/csv-import-export.test.mjs` → all pass including the new cases.

### Step 4: Full-suite gate

**Verify**: `npm test`, `npm run typecheck`, `npm run lint` → all exit 0.

## Test plan

- Export-guard cases for all four triggers, a round-trip lossless case, and a leading-apostrophe-preservation case, in `tests/csv-import-export.test.mjs`.
- Verification: the two-file run then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "CSV_FORMULA_TRIGGERS\|formula" lib/csv.ts` ≥ 2 (guard + strip present and commented)
- [ ] `node --test tests/csv-import-export.test.mjs` exits 0 with the new formula cases (`grep -c "SUM\|@ref" tests/csv-import-export.test.mjs` ≥ 2)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `escapeCsvCell` or the parser no longer matches the excerpts (drift).
- The import entry point does not have a single obvious per-cell finalization point — if the strip would have to be applied in multiple places, report the shape before scattering it.
- An existing round-trip test fails after Step 2 — that means the strip is too aggressive (stripping a legitimate apostrophe) or misplaced; fix the helper, do not loosen the test.

## Maintenance notes

- The export guard and import strip are a matched pair — changing the trigger set means changing both `CSV_FORMULA_TRIGGERS` uses in lockstep. Keep them referencing one constant if the parser can import it.
- Reviewers should scrutinize: the round-trip losslessness (a guarded export re-imported must equal the original) and that only one leading quote is ever stripped.
- Note for the executor: the regex literal `/^[=+\-@\t\r]/` contains a backslash-hyphen (escaped `-` inside the class) and `\t` `\r` (tab, carriage return). Type them as normal regex escapes in the source file; do not paste raw tab/CR bytes.
