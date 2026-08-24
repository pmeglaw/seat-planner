# Seat Planner — design system pass, session handoff

**As of 24 Aug 2026.** Written to seed a fresh Claude session. Lives in the repo beside `NOTES.md` / `PASS1-TOKENS.md` / `AUDIT.md` / `DOCS-DIFF.md`. Update it when you tag a release — the same reflex that already gets you `/api/build-id` verification.

---

## 1. Situation

| | |
|---|---|
| App | `seat-planner` — Next.js App Router, React, Tailwind + CSS custom properties |
| Repos | `E:/code/seat-planner` (Windows), `~/code/seat-planner` (Mac), from `github.com/pmeglaw/seat-planner` |
| Plugin repo | `E:/code/claude-plugins` → `github.com/pmeglaw/claude-plugins`, private |
| Skill | `/design-system:ibm-design-language` **v1.1.0**, installed per-machine |
| Deploy | Vercel → `seats.megeredchianlaw.com`; `/api/build-id` returns the live commit SHA |
| App version | **v1.59.0** (merge `5cc1f93`) |

**Two standing facts that change how decisions get made:**

1. **No one has seen this app except the owner.** No change-management overhead, no staged rollouts, no user heads-ups. Merge on green checks. It also means **visual-vocabulary changes are free now and expensive later** — the reason PR-C and the type floor were done before granting access.
2. **There is no staging database.** Local dev points at live Supabase. **Two machines now hold live credentials.** The guard is the last unfinished pre-access item and the only one whose downside is data rather than time.

---

## 2. PR ledger

| PR | Tag | What it did |
|---|---|---|
| **#434 (PR-A)** | — | §5.2 focus token value fixes; removed hover ring from invalid drop targets; source test locking "no white text on raw `#FF5715`" |
| **#435 (PR-A2)** | v1.55.3 | Focus token follows the **surface**, not the page theme. Established `[data-chrome="dark"]` as the focus re-anchor marker |
| **#436** | v1.55.4 | Twin resolution — 29 `-rgb` twins deleted, every call site derives via `color-mix`. Zero `-rgb` tokens remain |
| **PR-B** | — | §3.1–3.8 renames, ~1,400 replacements, one commit per family. Introduced the `.sp-zone-chrome` / `.sp-zone-base` cascade. Fixed the `--sp-surface-disabled` regression it created; added `data-chrome="dark"` to the skip link |
| **#440 (PR-C)** | — | Marker vocabulary — the WCAG 1.4.1 pass. 36/36 pairs now differ on a non-hue channel |
| **#444** | **v1.59.0** | Type floor part 1 — 12px everywhere off the map canvas |

---

## 3. The two systems this work established

### The chrome zone (PR-B)

`.sp-zone-chrome` re-declares role values on dark-chrome region roots; `.sp-zone-base` re-enters for light islands inside them (filter chips, error cards, inspector status dot). `ViewerFindPalette.tsx:58` uses it in reverse — a dark island inside a light surface. **That bidirectional use is deliberate and sanctioned.**

**Two selectors mean "dark chrome"**: `[data-chrome="dark"]` owns focus re-anchoring (#435); `.sp-zone-chrome` owns role tokens (PR-B). A region with one and not the other reopens the 2.68:1 focus bug. The paired-marker scan enforces both directions.

### The marker vocabulary (PR-C)

Two independent axes, both readable in greyscale:

- **Fill = availability** — solid (occupied) · hollow, frosted 55% (open) · hatched (structurally unavailable)
- **Glyph = reason** — none · dot · ✓ · ✗

| State | Fill | Glyph |
|---|---|---|
| available | hollow | none |
| reserved | hollow | teal dot |
| assigned | solid (white/95) | dot |
| unavailable | hatched | none |
| target-valid | **underlying seat's fill** | ✓ |
| target-invalid | **underlying seat's fill** | ✗ + `cursor: not-allowed` |

Target modes preserve the underlying fill so the admin sees both *"is this legal"* and *"what's there"* mid-swap. `selected` / `search` / `draft-changed` are **modifiers layered on a base state**, not members of the availability set — that's why the axes have no slot for them.

**Borders carry zero semantic weight.** `group-hover:border` repaints every unselected pill on hover, so any meaning on a border is destroyed exactly when the user inspects the seat. The uniform hover repaint stays as an "interactive" affordance; never encode state there.

### The type floor (#444)

12px (`label-01`, 12/16) everywhere off the map canvas. Eyebrows converted from **size hierarchy to weight + colour** hierarchy. Shortcut tabs `w-12` → `w-16`.

**MARKS are exempt** — graphical elements governed by non-text contrast (3:1), not text sizing: D badge, ✓, ✗, marker AI chip, the five-site "AI" chrome badge, login-illustration "C05". Registry pinned in `desktop-seat-marker-system-source.test.mjs`.

---

## 4. Guards — the durable part

Seven checks. These encode decisions in a form that survives any context loss.

| Guard | Proves |
|---|---|
| `dangling-refs` | No `var(--x)` references an undefined property. Catches the characteristic rename bug: definition renamed, one use site missed, property silently falls back |
| `resolved-map` | Every custom property, `var()` chains **resolved to a literal**, compared before/after. Must resolve indirection — an earlier grader compared raw text and scored a correct build as broken |
| `zone-completeness.mjs` | Every token in the dark-theme `:root` block (42) is also in `.sp-zone-chrome`, or allowlisted with a non-empty, non-stale reason. 14 declared + 28 allowlisted |
| paired-marker scan | Every `.sp-zone-chrome` carrier also has `data-chrome="dark"`, and vice versa, in the same JSX tag |
| `scripts/marker-contrast.mjs` | Pairwise greyscale matrix (36/36) + contrast floors. JS port so it runs in `node --test` without a Python dependency |
| `desktop-seat-marker-system-source` | Glyph presence pinned per state + the MARKS registry |
| `tests/type-floor-source` | Per-file sub-12px ledger. **Doubles as the concepts graduation gate** — a file leaving `app/concepts/` lands in the scan and fails until the debt is paid |

### Known weakness: circumstantial allowlist reasons

Most allowlist reasons are claims about today's component tree — "no chrome mounts," "zero focusable descendants." That's exactly how `--sp-surface-disabled` went stale: the Ask Planner drawer *became* chrome in PR-B.

**Queued fix:** require each entry to declare a category. **Structural** (another mechanism owns it — `--sp-focus`, the four shadows) is permanently safe. **Circumstantial** needs mechanical verification instead of a comment.

---

## 5. Open work

### PR-2 — map-canvas zoom tier (go given, not built)

Labels are **marks** below a collision threshold and **text** at or above it. Below: current sizes, no floor. At or above: 12px minimum.

Approved mechanism: `textTierActive(seats, pxPerNormX, pxPerNormY)` — true iff text-tier footprints produce zero collisions over the actual seat set, using the pairwise predicate the nudge scorer already uses. **Derived at runtime, no hardcoded threshold.** Add seats that tighten pitch and the tier retreats by construction.

Three required changes:

1. **Stagger the transition** — width immediate, `font-size` +75ms, both 150ms (`moderate-01`), inside the existing `motion-reduce` guard. Doctrine: one axis at a time. Simultaneous would flash type overflowing an ungrown pill.
2. **Ship the deadband** — don't wait for QA. Detail zoom is discrete but **fit mode is not**; frame width is continuous under window resize, and fit is the default mode.
3. **Measure the transition frame rate** — ~68 markers transitioning `font-size` at once is 68 layout-triggering animations in one frame. Fallbacks: transform-based scaling, or width-only with an instant type step at the midpoint.

### SeatSheet — rulings given, queued behind PR-2

SVG plan text renders **~5.1–5.6px on a 390px phone** (derived; confirm live first). CSS title-block micro-print at 8.5px never scales at all.

**Below the single-column breakpoint the floor plan is a picture, not a document.** Strip labels from the SVG, list them beneath. Drop the title-block conceit at the same breakpoint. Responsive layout, not responsive type — one breakpoint decision, not two.

### Supabase Publish guard — not started

Audit every write path. The guard must **fail closed**: refuse live writes unless it can positively confirm production. Not "refuse when it detects local" — a missing variable should block, not permit.

**This is orthogonal to PR-2 and SeatSheet and can run in a parallel session.**

---

## 6. Measured values — don't re-derive

**Focus tokens:**

| | `#161616` | `#262626` | `#333333` | `#393939` |
|---|---|---|---|---|
| `#D23F0A` (light) | 3.84 | 3.21 | **2.68 FAIL** | **2.45 FAIL** |
| `#FF8A5C` (dark) | 7.79 | 6.52 | 5.44 | 4.97 |

`#FF8A5C` on light surfaces fails everywhere (2.32 / 2.11 / 1.90) — dark-surface only. PR-A's real win: `#FF682C` on white 2.89 → `#D23F0A` 4.71.

**Brand orange `#FF5715`:** white text 3.17 (fails) · black/ink 6.63 / 5.71 (pass) · as border 2.88 on layer-01, 2.59 on hover (fails).

**Status luminance collisions:** pending teal `#136A67` vs success green `#1D6E41` = **1.02:1**. Danger `#B3232C` vs success = **1.05:1**. Identical in greyscale — the reason the marker vocabulary can't lean on hue.

**Carbon's own light-theme status colours fail as drawn marks:** yellow 30 = 1.68 on white · orange 40 = 2.46 · green 50 passes at rest (3.35), **fails on a hovered row (2.74)**.

**The rule this keeps proving:** check a mark against the surface it lands on **when hovered**, not at rest.

**Map geometry:** "CW05" @12px extrabold = 33.9px → 48px pill. Tightest prod pitch 40.4px at a 1376px fit frame (0.0294 normalized). Threshold ≈ 1634px rendered frame.

---

## 7. Working-zoom finding

The map opens at **fit on every base, both surfaces**. Zoom does **not** persist — plain component state, resets on every load. **No telemetry.**

**But the threshold is a rendered-width fact, not a mode fact.** On a wide monitor the fit frame itself can exceed the threshold, so wide displays get readable names at rest once the tier lands. **Fit ≠ marks universally; fit = marks on common laptop widths.**

Consequence: on laptop widths, hover disclosure and the inspector are the **primary read path**, not a fallback, and should be resourced accordingly.

---

## 8. Working agreements — settled, don't re-litigate

- **No users → no change management.** Merge on green checks.
- **Value changes and renames go in separate PRs** — not for blast radius, for the no-op proof. A rename PR's only cheap check is that no computed value moved.
- **Disabled controls are WCAG-exempt** (1.4.3, 1.4.11). A contrast problem there is a *regression* or *zone-completeness* bug, not an a11y bug.
- **A regression the rename mechanism itself creates is in scope for the rename PR.**
- **Tests prove values, not assignment.** `resolved-map` and `dangling-refs` read CSS; they cannot see the DOM. Any PR changing *which elements get which classes* needs a live visual pass regardless of suite colour.
- **Severity frame is PAIRWISE, not per-state.** 27 of 36 marker pairs were indistinguishable in greyscale where the original audit reported "4 of 9 states."
- **Apply family rules to the whole family, and flag the sites not named.** Flagging is what makes expansion safe.
- **Map-canvas geometry and map-canvas type are ONE exemption decision.** The fixed boxes (46px pill, 14px badges, 26px avatars) are already off the 8px ladder by design.
- **Invoke the skill when the ANSWER comes from design doctrine** — not when the task merely happens inside a UI codebase. Spacing, type, colour, motion, status semantics, shell, patterns → yes. Auth, data safety, build config, deploy, performance → no.
- **Footer "last updated" dates are build stamps.** Confirmed false alarms on 2026-08-21 and 2026-08-24. Authoritative checks: IDL → `/whats-new`; Carbon → `npm view @carbon/react time --json` + the changelog.
- **Verify updates by loading the artifact, not by reading the repo.** A fresh subagent reading only the installed cache is the standard.

---

## 9. Parked

| Item | Size | Why |
|---|---|---|
| Circumstantial-allowlist verification | small | See §4 |
| Arbitrary spacing values | 442 | Invisible to users; maintenance only |
| Four near-identical greige hairlines | 4 | Needs an owner ruling |
| `--admin-diff-vacated-text`, `--admin-paper`, §3.7 reception rows | 3 | Doc errors found during PR-B, parked under old names. See `NOTES.md` |

---

## 10. Ready for first users

The design work is nearly out of runway. "Ready" means:

- [ ] **PR-2 landed** — the map's read path is settled, not provisional
- [ ] **SeatSheet landed** — `/my-seat` legible on a phone, which is where staff will open it
- [ ] **Publish guard landed, fail-closed** — the only item whose downside is data
- [ ] **Hover disclosure and the inspector are good**, because on laptop widths they are the primary read path — see §7. This has not been assessed as a first-class path yet
- [ ] **A decision about who goes first and what you want to learn from them** — a product question, not a design one

Everything in §9 can happen after people are using the app.

---

## 11. Skill state

`design-system` plugin **v1.1.0**, commit `49c64da`. Refreshed 24 Aug 2026 against `@carbon/react` 1.114.0.

**Verified negative** (recorded in `DOCS-DIFF.md`, referenced from `carbon-next.md` as the next refresh's baseline): across 1.112.0–1.114.0 — zero token renames, removals, or default value changes in skill scope; zero deprecations; every `enable-v12-*` flag still `enabled: false`; motion tokens unchanged; contrast trap table unchanged.

**Method for repeating:** diff `feature-flags.yml` between tags; read release bodies for the intervening minors only.

**Stance change added:** a v12 migration path now exists in tooling (`@carbon/upgrade` codemod, `v12.md`) even though v12 itself is unshipped. Preparation is no longer "wait" — it's "keep the semantic token layer clean, because that layer is what the codemod operates on."
