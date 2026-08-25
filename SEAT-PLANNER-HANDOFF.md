# Seat Planner — design system pass, session handoff

**As of 25 Aug 2026.** Written to seed a fresh Claude session. Lives in the repo beside `NOTES.md` / `PASS1-TOKENS.md` / `AUDIT.md` / `DOCS-DIFF.md`. Update it when you tag a release — the same reflex that already gets you `/api/build-id` verification.

---

## 1. Situation

| | |
|---|---|
| App | `seat-planner` — Next.js App Router, React, Tailwind + CSS custom properties |
| Repos | `E:/code/seat-planner` (Windows), `~/code/seat-planner` (Mac), from `github.com/pmeglaw/seat-planner` |
| Plugin repo | `E:/code/claude-plugins` → `github.com/pmeglaw/claude-plugins`, private |
| Skill | `/design-system:ibm-design-language` **v1.1.0**, installed per-machine |
| Deploy | Vercel → `seats.megeredchianlaw.com`; `/api/build-id` returns the live commit SHA |
| App version | **v1.61.0** (merge `eec4a42`) |

**Two standing facts that change how decisions get made:**

1. **No one has seen this app except the owner.** No change-management overhead, no staged rollouts, no user heads-ups. Merge on green checks. It also means **visual-vocabulary changes are free now and expensive later** — the reason PR-C and the type floor were done before granting access.
2. **There is no staging database.** Local dev points at live Supabase. **Two machines now hold live credentials.** The publish guard shipped fail-closed in #443 (v1.58.0); draft edits stay deliberately unguarded.

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
| **#443** | v1.58.0 | Publish guard, fail-closed prod attestation — positive proof (local DB / `VERCEL_ENV === "production"` / explicit opt-in) or `PUBLISH_BLOCKED`; `NODE_ENV` deliberately untrusted |
| **#445** | — | Test: fail if `.env.local` defines `VERCEL_ENV` (would forge the attestation) + §5/§10 corrections |
| **#446** | v1.60.0 | Type floor part 2 — map-canvas text tier at the collision threshold |
| **#447** | v1.61.0 | SeatSheet type floor — phone page below 880, plan text legible-or-absent above |

---

## 3. The systems this work established

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

**Two independent erasers, not one (found 2026-08-25).** The hover repaint is the one that was written down. The second is `statusToneClass` (`SeatMarker.tsx:269`): it collapses to `""` whenever `tokenMode` is `selected` or `prominent`, dropping `baseStatusToneClass` — border included — wholesale. `prominent` covers search hits, planner highlights, and every swap/move source or target (`:203`/`:210`), so **selecting a seat or matching a search erases the status border just as completely as hovering it**, and neither erasure is recoverable. Fill and glyph survive both because the state classes re-declare them and target modes explicitly preserve the underlying fill — that is the structural reason the two-axis vocabulary works and a border axis could not. Anyone re-litigating "could we put *one* thing on the border" has to defeat both erasers, not just the hover one.

**Dormant branches document behaviour that never runs — and that is how the border rule came to be understated.** `SeatMarker.tsx` forks on `adminMarker` in a dozen places, and **no caller passes `variant="admin"`** (`:182`; `SeatMap.tsx:3260` passes `"viewer"` by owner preference). The comment at `:383` used to say the hover border "applies only to unselected markers" — true of the `adminMarker` arm, which carries a real `selected ?` guard because its hover (`--sp-legend-hover-border` `#8E8276`) and selected (`--sp-legend-selected-border` → `#D23F0A`) tokens differ. The live viewer arm has **no guard and needs none**: hover and selected both resolve to `--sp-marker-active-edge` `#D46A24`, and the selected *ring* is a `ring-*` box-shadow that `group-hover:border` cannot reach. So the shipped repaint is unconditional across every unselected state, and the comment described the dormant branch's mechanism as if it were the rule's scope — narrowing it. Corrected in place 2026-08-25. **When editing an `adminMarker` arm, confirm which arm ships before believing its comment** (the `:182` note says this; the `:383` drift is what happens when it is not consulted).

**Same class, unrelated site: the admin map's zone hover-wash was dead code — removed 2026-08-25.** `SeatMap.tsx` declared a setter-less `hoverZone`, so `buildZoneWash` could only ever receive the pinned zone, and the comment above it described chip-hover behaviour that could not occur. Root cause was an owner ruling, not an oversight: #432 removed the admin canvas filter UI (zone chips included), so there was nothing to wire a setter to. Fixed by deleting the dead state; **v12 contract #8's chip-hover preview is viewer-only** (`ViewerSeatFinder.tsx`) by consequence of #432 — re-adding it to admin means re-adding chips, which re-litigates #432.

### The type floor (#444)

12px (`label-01`, 12/16) everywhere off the map canvas. Eyebrows converted from **size hierarchy to weight + colour** hierarchy. Shortcut tabs `w-12` → `w-16`.

**MARKS are exempt** — graphical elements governed by non-text contrast (3:1), not text sizing: D badge, ✓, ✗, marker AI chip, the five-site "AI" chrome badge, login-illustration "C05". Registry pinned in `desktop-seat-marker-system-source.test.mjs`.

**Sanctioned variant (ruled 2026-08-25, candidate B):** the Ask Planner card label (`SeatInspector.tsx:389`) holds eyebrow **metrics** — 12px semibold uppercase `tracking-[0.08em]`, matching `InspectorSectionLabel` (bold was a third emphasis device on already-uppercase, already-tracked words) — but keeps `--sp-ai-accent` **colour**: it marks an AI-touched surface, the same five-site vocabulary as the "AI" badge. Signal, not drift; consistency sweeps must not re-flag it. Condition measured per §6's hovered-surface rule: light `#8a3ffc` on hover wash `#f6f2ff` = **4.54:1** (pass at 12px), on white 5.00. Dark measured while at it: `#a56eff` on `#1f1f1f` rest 4.92, but on the dark hover wash composite (**4.31:1**) — pre-existing shortfall, parked in §9. Pinned beside the MARKS registry.

### The text tier (#446)

Map-canvas labels are **marks** below a runtime-derived collision threshold and **text** at or above it. `textTierActive` (`lib/seatCrowding.ts`) derives from the same scalar that feeds `clearanceFromScale` — **no hardcoded threshold**. Add seats that tighten pitch and the tier retreats by construction.

- **Staggered transition:** width immediate, `font-size` +75ms, both 150ms, inside the existing `motion-reduce` guard. One axis at a time — simultaneous would flash type overflowing an ungrown pill.
- **Hysteresis:** `TEXT_TIER_EXIT_SLACK_PX = 2`, jitter-sized, in **footprint px**. The originally approved slack (14) was fine-sounding until converted: ×~34 into frame width at pitch 0.0294 = ~477px of path-dependence. **Convert units before presenting a threshold for approval** — this lesson bit twice in one day (see SeatSheet).
- Measured band today: enter ~1633px rendered frame / exit ~1564. Transition measured 58.9fps across 68 markers (worst frame 33.3ms, at the resize relayout) — no transform fallback needed.
- Name-mode eyebrow follows the tier: 12px medium + opacity-90 at tier (measured 39.5px pill ≤ 40px obstacle — fits, not dropped).

### The SeatSheet outcome (#447)

**The durable finding: SVG plan text was illegible at every real width, not just phones.** The two-column layout caps the SVG at 613px, so the 10/11-viewBox-unit text rendered 9.58–10.54px at *every* viewport ≥881 — and 4.44px at 390 (worse than the 5.1 estimate). The "fine on desktop" assumption was false; the fix was incidental, the finding is what to keep. Owner re-ruled mid-pass: SVG plan text is **words, not drawing-convention marks** — make it legible or drop it.

What shipped:

- **Below 880** the plan is a picture: SVG text, zone-ref lines, and title block hidden; the info pane carries everything at ≥12px. CSS-only; the static server component survived.
- **At/above 880**, fontSize raised 10/11 → **13 viewBox units**, and the SVG text hides below 1133px viewports (1132 = 12.09px hidden / 1133 = 12.45px at the 613px cap). The measurement forced the branch: no single fontSize both fits the 52×27-unit boxes *and* covers 881px (that needs ~20.5 units), so the cap-only "raise it if it fits" framing would have silently shipped a sub-12 window across 881–1130. Owner picked raise-13 + hide-below-1133 once that hole was measured — the unit lesson applied.
- Four promotions at all widths (eyebrow, code-sub, fact-label, back link → 12px); notice states gained a visible "Issued for" line below 880 (the hidden title block was the only place the name appeared — "needs fixing, not noting").
- **Surviving sub-12 exemptions** (`SeatSheet.tsx` ledger 9 → 2): the title-block conceit — 8.5px label + 10px block — **desktop-only by owner ruling**: it hides below 880, and above it the drawing-sheet title block earns its micro-print on a large surface.
- A11y freebie: the SVG is `role="img"` + `aria-label`, so its `<text>` children were never in the AX tree — hiding them changed nothing for screen readers (verified live).
- Geometry test pins fontSize 13 ×3, the 1132 hide, the 880 drop, and the issued-for line; a comment couples the numbers — change one, re-measure all.

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

The type-floor arc (#444 / #446 / #447) and the publish guard (#443 / #445) are **complete and prod-verified**. The SeatInspector label ruling landed as candidate B — recorded in §3, pinned in `desktop-seat-marker-system-source.test.mjs`. One item remains.

### Hover disclosure + inspector as a first-class read path — assessed 2026-08-25, ruled

Assessed (findings F1–F8 in `docs/design-system/READ-PATH-ASSESSMENT.md`, #450) and the framing ruled: **hover is a browse affordance, not the find path** (owner ruling 2026-08-25, recorded in the assessment doc). Search/palette answers "where does X sit"; the inspector is the sanctioned read surface. F1/F2/F5 closed cheap under that ruling. **F4 fixed** (double name announce — `accessibleSeatName` gated on `hasHoverDisclosure`, pinned in `seat-map-components`). **F8 fixed** (dead admin hover-wash state removed; contract #8 chip-preview recorded viewer-only per #432 — see §3). Still open from the assessment: **F3/F6** rulings and a follow-on assessment of `ViewerFindPalette` as the first-class find path.

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

**Reframed by the read-path assessment, ruled 2026-08-25:** with 15 of 68 seats occupied, hover is a **browse** affordance — search/palette is the find path and the inspector is the read surface. "Primary read path" above stays true of the *surfaces* (marks at fit), but resourcing follows the ruling: palette and inspector first, hover disclosure stays a cue. See §5 and the assessment doc.

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
- **Parallel sessions get parallel worktrees:** `git worktree add ../seat-planner-side main`. Two agents in one working tree caused two incidents; both were caught by a human, neither by git.

---

## 9. Parked

| Item | Size | Why |
|---|---|---|
| Circumstantial-allowlist verification | small | See §4 |
| Arbitrary spacing values | 442 | Invisible to users; maintenance only |
| Four near-identical greige hairlines | 4 | Needs an owner ruling |
| `--admin-diff-vacated-text`, `--admin-paper`, §3.7 reception rows | 3 | Doc errors found during PR-B, parked under old names. See `NOTES.md` |
| Dark AI accent on its hover wash: 4.31:1 | 1 hex or 1 alpha | `#a56eff` over `rgba(138,63,252,.16)`-on-`#1f1f1f` misses 4.5 (rest passes at 4.92). Pre-existing, found while measuring the §3 sanctioned variant. Fix is lighten the dark accent OR thin the dark wash — needs an owner ruling; touching the accent hex touches all five AI sites |

---

## 10. Ready for first users

The design work is nearly out of runway. "Ready" means:

- [x] **PR-2 landed** (#446, v1.60.0) — the map's read path is settled, not provisional
- [x] **SeatSheet landed** (#447, v1.61.0) — `/my-seat` legible on a phone, which is where staff will open it
- [x] **Publish guard landed, fail-closed** (#443 + #445, v1.58.0) — the only item whose downside was data
- [x] **Hover disclosure and the inspector assessed + ruled** (2026-08-25) — hover is a browse affordance, inspector is the read surface, palette is the find path; F1/F2/F5 closed under the ruling. Remaining items (F3/F4/F6/F8, palette assessment) don't block first users — see §5
- [x] **SeatInspector label ruling** — candidate B, ruled + shipped 2026-08-25; recorded in §3, pinned in the marker-system source test
- [ ] **A decision about who goes first and what you want to learn from them** — a product question, not a design one

Everything in §9 can happen after people are using the app.

---

## 11. Skill state

`design-system` plugin **v1.1.0**, commit `49c64da`. Refreshed 24 Aug 2026 against `@carbon/react` 1.114.0.

**Verified negative** (recorded in `DOCS-DIFF.md`, referenced from `carbon-next.md` as the next refresh's baseline): across 1.112.0–1.114.0 — zero token renames, removals, or default value changes in skill scope; zero deprecations; every `enable-v12-*` flag still `enabled: false`; motion tokens unchanged; contrast trap table unchanged.

**Method for repeating:** diff `feature-flags.yml` between tags; read release bodies for the intervening minors only.

**Stance change added:** a v12 migration path now exists in tooling (`@carbon/upgrade` codemod, `v12.md`) even though v12 itself is unshipped. Preparation is no longer "wait" — it's "keep the semantic token layer clean, because that layer is what the codemod operates on."
