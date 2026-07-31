# v12 Slice 1 — AI Token Family + Publish CTA Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Carbon v12 handoff's slice 1 — the new Carbon-for-AI token family and the Publish button's move from accent `#FF5715` + ink to CTA `#D23F0A` + white (owner decision 2a) — with every contrast comment in `globals.css` re-measured and true.

**Architecture:** Pure token/styling slice. New `--admin-ai-*` custom properties join the `.admin-theme, .shell-theme` block in `app/globals.css`; one named boxShadow utility joins `tailwind.config.ts` (arbitrary `shadow-[var(--…)]` silently fails in Tailwind v3 — see existing config comment). The Publish button in `SeatMap.tsx` re-points from `--admin-primary`/ink to the existing `--admin-primary-cta` ladder. No new components, no behavior change.

**Tech Stack:** Next.js App Router, Tailwind v3 (semantic CSS custom properties), plain Node test runner.

## Global Constraints (from handoff README + CLAUDE.md)

- **AI blue is reserved exclusively for AI presence** — this slice only *defines* the family; no non-AI surface may consume it, ever.
- Accent `#FF5715` keeps: active underline, selected seat ring, search highlight, focus ring (owner decision 2026-07-31 — stays, does NOT follow Publish to `#D23F0A`).
- `SeatMarker` visuals and `lib/mapLayoutTransform.ts` untouched (pinned by `tests/desktop-seat-marker-system-source.test.mjs`).
- `ViewerSeatFinder.tsx` gets zero AI references (pinned by `tests/accessibility-source.test.mjs`).
- AA floors: body text ≥ 4.5:1, graphics ≥ 3:1. White never on `#FF5715` or `#F1C21B`.
- Do not install `@carbon/react`.
- CI is paused until 2026-08-01 — a PR with no checks is NOT a passing PR; the full gate must run locally.
- Branch per slice; `main` stays green.

---

### Task 1: AI token family (`globals.css` + `tailwind.config.ts`)

**Files:**
- Modify: `app/globals.css` (insert after `--admin-chrome-info-text: #78a9ff;`, currently line 294)
- Modify: `tailwind.config.ts` (boxShadow map, after `"marker-hover"` entry, currently line 98)

**Interfaces:**
- Produces: `--admin-ai-border`, `--admin-ai-text`, `--admin-ai-rgb`, `--admin-ai-aura`, `--admin-ai-marker-aura`, `--admin-ai-ring`, `--admin-ai-ring-soft`, `--admin-marker-ai-shadow`, `--admin-ai-chrome-text`, `--admin-ai-chrome-border`, `--admin-ai-panel-border`, `--admin-ai-glow`, `--admin-ai-row`; Tailwind utility `shadow-marker-ai`. Slices 4/7 (inspector AI row, Ask Planner drawer, planner-highlight marker state) consume these names verbatim.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/v12-slice1-tokens
```

- [ ] **Step 2: Verify measured contrast ratios before writing them into comments**

Run this exact script; the comment in Step 3 must carry ITS numbers, not the plan's, if they differ:

```bash
node -e "
const L=h=>{const c=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const cr=(a,b)=>{const[x,y]=[L(a),L(b)].sort((p,q)=>q-p);return((x+.05)/(y+.05)).toFixed(2)};
console.log('0043ce/ffffff',cr('0043ce','ffffff'));
console.log('0043ce/F7F6F2',cr('0043ce','F7F6F2'));
console.log('4589ff/ffffff',cr('4589ff','ffffff'));
console.log('78a9ff/161616',cr('78a9ff','161616'));
console.log('78a9ff/262626',cr('78a9ff','262626'));
console.log('ffffff/D23F0A',cr('ffffff','D23F0A'));
console.log('161616/ffffff',cr('161616','ffffff'));
"
```

Expected (pre-computed): `#0043ce` on white ≈ 7.46, on `#F7F6F2` ≈ 6.90; `#4589ff` on white ≈ 3.35 (graphics-only); `#78a9ff` on `#161616` ≈ 7.69, on `#262626` ≈ 6.43; white on `#D23F0A` ≈ 4.71; ink on white ≈ 16.45.

- [ ] **Step 3: Insert the AI family in `app/globals.css`**

Directly after `--admin-chrome-info-text: #78a9ff;` (inside the `.admin-theme, .shell-theme` block), insert:

```css

  /* Carbon-for-AI family (v12 handoff, 2026-07-31). Reserved EXCLUSIVELY for
     AI presence — Ask Planner chip/drawer and the planner-highlight seat
     state. Never a status hue, never the brand. Light pair: text #0043ce =
     7.46:1 on white, 6.90:1 on #F7F6F2; border #4589ff = 3.35:1 on white
     (graphics ≥3:1, not for text). Dark-chrome pair: #78a9ff = 7.69:1 on
     #161616, 6.43:1 on #262626. Measured 2026-07-31. */
  --admin-ai-border: #4589ff;
  --admin-ai-text: #0043ce;
  --admin-ai-rgb: 69 137 255;
  --admin-ai-aura: linear-gradient(180deg, rgba(69, 137, 255, 0.12), rgba(255, 255, 255, 0) 70%);
  --admin-ai-marker-aura: linear-gradient(180deg, rgba(69, 137, 255, 0.14), rgba(255, 255, 255, 0) 60%);
  --admin-ai-ring: rgba(69, 137, 255, 0.45);
  --admin-ai-ring-soft: rgba(69, 137, 255, 0.18);
  --admin-marker-ai-shadow: 0 0 0 2px rgba(69, 137, 255, 0.45), 0 0 0 6px rgba(69, 137, 255, 0.18), 0 10px 22px rgba(69, 137, 255, 0.35);
  --admin-ai-chrome-text: #78a9ff;
  --admin-ai-chrome-border: #78a9ff;
  --admin-ai-panel-border: rgba(120, 169, 255, 0.35);
  --admin-ai-glow: linear-gradient(180deg, rgba(69, 137, 255, 0.10), rgba(69, 137, 255, 0) 140px);
  --admin-ai-row: rgba(69, 137, 255, 0.08);
```

Values traced from the handoff: README Design tokens §AI family; marker shadow composite from `Seat Planner v12 Prototype.dc.html:649`; aura stops (.12/70% chip, .14/60% marker) from prototype lines 172/649.

- [ ] **Step 4: Add the named shadow utility in `tailwind.config.ts`**

In `boxShadow`, after `"marker-hover": "var(--admin-marker-hover-shadow)",` add:

```ts
        "marker-ai": "var(--admin-marker-ai-shadow)",
```

- [ ] **Step 5: Verify the suite still passes and the tokens parse**

```bash
npm test && npm run build
```

Expected: healthy baseline (~400 pass; the 4 known env-sensitive files may fail only if node_modules drifted — that is not a regression). Build compiles the CSS; a malformed custom property would surface here.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(tokens): add Carbon-for-AI token family (v12 slice 1)"
```

---

### Task 2: Publish button → CTA ladder + contrast-comment truth pass

**Files:**
- Modify: `components/seat-map/SeatMap.tsx:3114` (has-changes branch classes) and `:3123` (count badge)
- Modify: `app/globals.css:8-10` (brand-constants comment), `:21-24` (action-ladder comment), `:238-244` (admin brand-ladder comment)

**Interfaces:**
- Consumes: existing `--admin-primary-cta` (#D23F0A), `--admin-primary-cta-hover` (#B83708), `--admin-primary-ink` (#161616). No new names produced.

- [ ] **Step 1: Swap the has-changes branch of the Publish button (`SeatMap.tsx:3114`)**

Old:

```tsx
                    ? "bg-[var(--admin-primary)] text-[var(--admin-primary-ink)] hover:brightness-105 focus-visible:ring-white motion-safe:animate-[sp-chip-pop_240ms_ease-out]"
```

New:

```tsx
                    ? "bg-[var(--admin-primary-cta)] text-white hover:bg-[var(--admin-primary-cta-hover)] focus-visible:ring-white motion-safe:animate-[sp-chip-pop_240ms_ease-out]"
```

(White on `#D23F0A` = 4.71:1, on hover `#B83708` = 5.85:1 — both AA. White focus ring on `#D23F0A` = 4.71:1 ≥ 3:1.)

- [ ] **Step 2: Swap the count badge (`SeatMap.tsx:3123`)**

Old:

```tsx
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[rgb(var(--sp-color-text-primary-rgb)/0.15)] px-1 text-[11px] font-bold tabular-nums">{publishSummary.totalChangeCount}</span>
```

New:

```tsx
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-[var(--admin-primary-ink)]">{publishSummary.totalChangeCount}</span>
```

- [ ] **Step 3: Rewrite the three stale comments in `app/globals.css`**

Brand constants (lines 8-10), old:

```css
  /* Brand constants (Megeredchian Law). The Shell redesign accent is the
     signature orange #FF5715 — used sparingly: Publish, active tool underline,
     selected seat, search/filter highlight, primary actions. Owner-set 2026-07-21. */
```

New:

```css
  /* Brand constants (Megeredchian Law). The Shell redesign accent is the
     signature orange #FF5715 — indicator-only: active tool underline, selected
     seat, search/filter highlight, focus. Publish moved to the CTA ladder
     (#D23F0A + white, v12 owner decision 2a, 2026-07-31). Owner-set 2026-07-21. */
```

Action ladder (lines 21-24), old:

```css
  /* Action ladder for text-bearing orange fills. The raw brand #FF5715 is only
     3.17:1 with white (fails AA text), so buttons that keep white labels use the
     deepened #D23F0A (4.71:1). The hero Publish button instead uses #FF5715 with
     dark ink text (#161616 on #FF5715 = 5.71:1). Measured 2026-07-21. */
```

New:

```css
  /* Action ladder for text-bearing orange fills. The raw brand #FF5715 is only
     3.17:1 with white (fails AA text), so white-label buttons use the deepened
     #D23F0A (4.71:1). The hero Publish button joined this ladder 2026-07-31
     (v12 owner decision 2a): #D23F0A bg + white label + white count badge with
     ink text (16.45:1). Measured 2026-07-21/2026-07-31. */
```

Admin brand ladder (lines 238-244): replace only the clause `the hero Publish\n     button uses accent + ink text (#161616 on #FF5715 = 5.71:1)` with `the hero Publish\n     button sits on the cta ladder (#D23F0A + white, 4.71:1; v12 decision 2a)` — leave the rest of that comment verbatim.

- [ ] **Step 4: Sweep for other claims that Publish = accent**

```bash
grep -rn "hero Publish\|Publish button" docs/DESIGN_DIRECTION.md AGENTS.md components/ app/ --include="*.ts" --include="*.tsx" --include="*.md" | grep -vi "design_handoff"
```

Any doc line asserting the accent+ink Publish gets the same one-line correction (cite v12 decision 2a). Code hits beyond `SeatMap.tsx:3111-3124`: inspect, but expect none — the publish-review modal's confirm button already uses the `Button` primary variant on the cta ladder.

- [ ] **Step 5: Run the gate**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: all green (same env-sensitive caveat as Task 1).

- [ ] **Step 6: Commit**

```bash
git add components/seat-map/SeatMap.tsx app/globals.css
git commit -m "feat(seat-map): move Publish to the CTA ladder (v12 owner decision 2a)"
```

---

### Task 3: Visual verification + PR

**Files:**
- None modified — verification and handoff only.

- [ ] **Step 1: Boot and visually verify (REQUIRED SUB-SKILL: `run-seat-planner`)**

Use the `run-seat-planner` skill to build/boot and drive the admin map. Make one draft change (e.g. vacate a seat) so the Publish button renders, then screenshot the top bar. Check against `docs/design_handoff_carbon_v12/screenshots/03-prototype.png`: Publish = `#D23F0A` fill, white label, white circular count badge with dark count. Bar layout will NOT yet match the prototype (later slices) — this check is the button treatment only. Then undo/discard the draft change so the shared draft layer is left as found (local dev writes to PRODUCTION's draft layer).

- [ ] **Step 2: Confirm the AI family is inert**

```bash
grep -rn "admin-ai-" components/ app/ --include="*.tsx" | grep -v "globals.css"
```

Expected: zero hits — slice 1 defines, later slices consume.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/v12-slice1-tokens
gh pr create --title "feat: v12 slice 1 — Carbon-for-AI tokens + Publish CTA swap" --body "$(cat <<'EOF'
## Summary
- Adds the Carbon-for-AI token family (--admin-ai-*) from the v12 handoff — defined only, no consumers yet
- Moves the hero Publish button from accent #FF5715 + ink to CTA #D23F0A + white label + white count badge (owner decision 2a)
- Re-measures and rewrites the affected contrast comments in globals.css

## Verification
- CI is paused (July minutes exhausted) — full gate run locally: lint, typecheck, npm test, build
- Visual check of the Publish button against docs/design_handoff_carbon_v12/screenshots/03-prototype.png

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Report the PR URL and stop — merge is the owner's call.

---

## Self-Review (completed at authoring)

1. **Spec coverage:** README slice 1 = "Tokens: AI family + Publish→#D23F0A swap (globals.css, update contrast comments)" — Task 1 covers the family, Task 2 the swap + comments, Task 3 the handoff's verification loop. The README tokens row also names "tile hover"; that value belongs to the Settings-tiles slice (8) where its consumer lands — deliberate deferral, not a gap.
2. **Placeholder scan:** none — every step carries exact code/commands.
3. **Type consistency:** token names in Task 1's Produces block match the CSS verbatim; Task 2 consumes only pre-existing names.
