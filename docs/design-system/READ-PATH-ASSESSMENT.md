# Read-path assessment — hover disclosure and the inspector as a first-class path

**25 Aug 2026.** Closes the §5 / §10 open item in `SEAT-PLANNER-HANDOFF.md`: *"on laptop widths the map at fit shows marks, so hover disclosure and the inspector are the primary way anyone reads a name. Neither has been assessed as a primary path."*

Assessment only — **no code was changed.** Eight findings below; five want an owner ruling. Nothing here is a build instruction yet.

---

## How this was measured

Neither the cloud container nor the desktop's Linux VM can reach the Supabase host, so the authenticated viewer could not be booted end-to-end. Instead the **real `ViewerSeatFinder`** was mounted in a real Chromium with the **real compiled Tailwind CSS** and the **vendored Plex fonts** — the repo's own `tests/browser` harness deliberately ships no CSS ("elements aren't laid out for hit-testing"), which is exactly the gap this needed. Seat geometry is the **real published layer** (68 seats, read-only `SELECT`); occupant names are synthetic, never the real directory.

**Fidelity check:** the harness reproduces the tightest nearest-neighbour pitch at a 1376px frame as **40.4px** — identical to §6's recorded production figure. Median nearest-neighbour 47.9px. Numbers below are `getComputedStyle` / `getBoundingClientRect`, not class-string inference.

Probes: `tests/browser/build-readpath-harness.mjs`, `readpath-probe{,2,3}.mjs`, `readpath-shot.mjs` (throwaway; not committed).

---

## The three read paths, measured at 1376px

| | What is actually legible | Type |
|---|---|---|
| **At rest** | `CW01` — the code only. No occupant name anywhere on the canvas. | 9.5px extrabold |
| **Hover / keyboard focus** | `CW01 Marcus` — first name only | code 9.5px · **name 10px** |
| **Names toggle on, at rest** | `CW01 / Marcus` | code 9.5px · **name 9px** |
| **Inspector** | `Marcus Bell`, role, department, status, seat code, zone, extension | **name 19px** |
| **Native `title` tooltip** | `CW01 · Marcus Bell · Assigned` | OS-rendered, ~1s delay |

The toggle defaults **off** (`ViewerSeatFinder.tsx:179`, persisted per browser), so a first-time user on a laptop sees code pills and nothing else until they hover, focus, or select.

---

## Findings

### F1 — The hover-disclosed name is 10px at every width. The text tier never reaches it. **(high · needs ruling)**

`SeatMarker.tsx:622` hardcodes `text-[10px]` on the disclosure span. The sibling code label one line above (`:614`) reads `textTier ? "text-[12px]" : "text-[9.5px]"`.

Measured:

| Viewport | Tier | Code pill | Disclosed name |
|---|---|---|---|
| 1376 | off | 9.5px | **10px** |
| 1700 | **on** | **12px** | **10px** |

So #446's tier lifts the code — the thing the reader already knows — to 12px and leaves the name at 10px, on a wide monitor, at rest. #446's guarantee that *"add seats that tighten pitch and the tier retreats by construction"* does not protect this branch: it is outside the tier entirely.

This is the #447 shape exactly. That pass ruled SVG plan text **"words, not drawing-convention marks — make it legible or drop it,"** and its durable finding was that *"fine at the wide end"* was an assumption nobody had measured. The disclosed name is words, §7 makes it the primary read path, and the wide end is not fine.

`tests/type-floor-source` counts 16 sub-12px sites in `SeatMarker.tsx` and cannot tell a code mark from a person's name — the same way the SeatSheet ledger hid its words case among marks until #447 separated them.

**Ruling wanted:** raise the disclosure to 12px, or rule it a mark and make the inspector the sanctioned place a name is read. Rule it **with F2** — raising the type widens the pill.

### F2 — Hover disclosure occludes the neighbouring seat's code. **(high · needs ruling)**

Hovering grows the pill from its 46px resting footprint. At a 40.4px tightest pitch it lands on top of its neighbour.

| Condition | Pill width | Overlap with `CW02` |
|---|---|---|
| 1376, toggle off | 46 → **96px** | 17.6 × 24px |
| 1376, toggle **on** | 86 → **124px** | 51.6 × 34px |
| 1700 (tier on) | 48 → 97.9px | 7 × 24px |

Visually at 1376 with the toggle off, `CW02` renders as `W02` — the leading character is covered. With the toggle on, `CW02`'s label is covered completely and shows only as a ghost through the frosted fill.

Seat codes are this app's wayfinding vocabulary. Reading one seat currently corrupts the label of the seat beside it, and it happens on the read path §7 designates primary. Above the tier it is a 7px graze; below it, it is the whole label. Same laptop-width case as F1.

The transition is `motion-reduce`-guarded and runs at 150ms (`moderate-01`) — correct for a width expansion, though IDL puts seat *hover* at `fast-01` (70ms). Not the problem; noted so it is not mistaken for one.

### F3 — Only the first name is disclosed, and the native `title` out-informs the designed disclosure. **(medium · needs ruling)**

Visible on hover: `Marcus`. The `title` attribute (`SeatMarker.tsx:511`) carries `CW01 · Marcus Bell · Assigned`.

Two consequences:

- Two people sharing a first name are **indistinguishable** on the primary read path. `getPassiveEmployeeLabel` only appends a last initial when the first name is ≤4 characters, so `Marcus Bell` and `Marcus Chen` both disclose as `Marcus`; `Ana Ruiz` and `Ana Diaz` both disclose as `Ana R.` / `Ana D.` and are fine. The failure is length-dependent, which makes it intermittent rather than absent.
- The browser's native tooltip is a **second, uncontrolled disclosure channel** carrying strictly more information than the designed one: ~1s delay, OS styling in neither theme, no keyboard path, nothing on touch. IDL sanctions `title` as the escape hatch for *truncated* text; here it is not backing a truncation, it is the only place the full name appears on the canvas.

### F4 — Every assigned seat announces its occupant's first name twice. **(medium · needs ruling)**

Measured accessible name at rest, 1376:

```
"CW01 Marcus Marcus Bell. Assigned seat. Open details."
```

`accessibleSeatName` unconditionally concatenates the short label and the full name for axe's `label-content-name-mismatch`. That is deliberate and pinned where the short name is **visible** — the selected pill and the office plate (`tests/seat-map-components.test.mjs`, the selected-pill and door-plate tests, both asserting `Alice S. Alice Smith`).

In code mode at laptop width the short name is `display: none` until hover, so there is no visible text to contain, and the stutter is pure noise. It applies to all 15 occupied seats, at rest, on every arrow-key step of the keyboard path.

`hasHoverDisclosure` (`SeatMarker.tsx:212`) already computes the exact predicate. Axe evaluates at rest, so gating on it does not weaken the check.

**Ruling wanted:** whether text revealed on hover counts as "visible" for WCAG 2.5.3. If it does, the stutter is the price and should be documented as such; if it doesn't, the gate is a two-line change.

### F5 — On a touch-capable laptop the hover path does not exist at all. **(medium · needs ruling)**

Emulated at 1376 with a coarse pointer: `(hover: none)` and `(pointer: coarse)` both match. Every `group-hover:` rule is dead; `group-focus-visible:` needs a keyboard. The only remaining path is tap → inspector.

The tap target is `h-8 w-8` = **32 × 32px** (`SeatMarker.tsx:397`; 40px only once selected), with 40.4px between neighbours at the tightest pitch. That **passes WCAG 2.2 AA** (2.5.8 Target Size Minimum, 24px) and misses Carbon's 44px convention — and §8 already exempts map-canvas geometry by ruling, so this is a decision, not a violation. Flagging it because a touchscreen laptop is a plausible first-user machine and it collapses three read paths into one.

### F6 — The inspector is the best part of the read path, and three of its lines are 11px. **(medium)**

It is genuinely good, and faster than it feels:

| | Measured |
|---|---|
| Click → panel painted | **11.0 – 17.5ms** |
| Panel | 332 × 217px, floating top-right |
| Share of a 1376 × 900 viewport | **5.8%** — it never covers the hovered seat |
| Occupant name | **19px / 500** — the only legible full name in the app |

It also carries role, department, status, seat code, zone and extension. Nothing about it is slow, and it does not fight the map for space.

But it is **off the map canvas**, where #444 set a 12px floor, and three lines sit under it:

| Line | Size |
|---|---|
| Status chip (`Assigned`) | 11px / 600 |
| `CW01 · Center West` | 11px / 500 |
| `Internal extension` | 11px / 400 |

`SeatInspector.tsx` carries a 12-site ledger in `tests/type-floor-source` that these sit inside, unruled. The second line is the one that answers *where do they sit* — the panel's whole reason to exist — and it is the smallest text on it.

### F7 — Keyboard parity is the strongest part of the whole path. Recording it so it is not re-litigated. **(no action)**

Every measurement passed:

- **Skip link is the first focusable element**; then 7 chrome stops (filter, search, reception, theme, account, floor), then the map region, then a seat. The map is **one** tab stop, not 68.
- Roving tabindex with arrow keys — the spatial-grid pattern IDL asks for, not one tab stop per seat.
- **`:focus-visible` matches on the rAF-deferred programmatic focus** the arrow handler uses (`ViewerSeatFinder.tsx:869`). This was the one mechanism likely to have silently failed; it does not.
- Focus disclosure is **byte-identical to hover disclosure** — same 96px pill, same 10px name. Keyboard users are not second-class here.
- `Enter` moves focus to `#seat-inspector-panel`; pointer selection cancels the handoff (`focusInspectorAfterSelectRef`).
- The `aria-live` region announces `"SE04 selected on the map."`
- `Escape` closes the inspector **and returns focus to the originating marker**.

Keyboard-only is the best-served path, not the broken one. F1, F3 and F4 still apply to it.

### F8 — The admin map's zone hover-wash is dead code. **(low)**

`SeatMap.tsx:315` declares `const [hoverZone] = useState<string | null>(null)` with **no setter**, so `buildZoneWash(hoverZone ?? …)` at `:2525` can only ever receive the pinned zone. The viewer has a live `setHoverZone` (`ViewerSeatFinder.tsx:230`). v12 contract #8's "the hovered chip wins over the pinned zone" is unimplemented on the admin surface, and the comment above it describes behaviour that cannot occur.

---

## The finding that reframes §7

**15 of 68 seats have an occupant** — draft and published agree, so this is the steady state, not a stale publish.

Every hover-disclosure finding above applies to 15 markers. A user hunting for a person by hover sweeps up to 68 targets to find 15 names, at 10px, with no hover-intent delay, each disclosure damaging the neighbour's label on the way past.

§7 concluded that hover disclosure and the inspector are the primary read path *because the map at fit shows marks*. That is true about the map. It does not follow that hover is how anyone will actually find a person — at this density, hover is a **browse** affordance, and search is the find path. The palette (`ViewerFindPalette`), which was not in this assessment's scope, is the surface that answers "where does X sit" in one step instead of 68.

Two ways to read that, and it is an owner call:

- **Hover is a browse affordance.** Then F1/F2 get cheap rulings (leave 10px, accept the graze), the inspector is the sanctioned read surface, and the next assessment is of the palette rather than of hover.
- **Hover is the find path §7 says it is.** Then F1 and F2 are load-bearing and must be ruled together, and hover-intent delay becomes a real question.

Worth settling before spending anything on F1/F2, because the answer changes what they are worth.

---

## Ranked

| # | Finding | Severity | Wants |
|---|---|---|---|
| F1 | Disclosed name 10px at every width; outside the text tier | high | ruling, with F2 |
| F2 | Hover occludes the neighbour's seat code (17.6px → 51.6px) | high | ruling, with F1 |
| F3 | First name only visible; full name lives in the native `title` | medium | ruling |
| F4 | `"Marcus Marcus Bell"` on all 15 occupied seats | medium | ruling |
| F5 | No hover path at all on a touch laptop; 32px targets | medium | ruling |
| F6 | Three inspector lines at 11px, incl. the locator line | medium | ruling |
| F7 | Keyboard parity complete | — | recorded |
| F8 | Admin zone hover-wash is dead code | low | small fix |

Nothing here blocks first users on its own. F1 + F2 together are the pair worth settling first, and the §7 reframing above is worth settling before either.
