# Handoff: Reception view — front-desk call routing

**For:** Claude Code, implementing in `pmeglaw/seat-planner` (main)
**Extends:** `README.md` (the main v12 redesign handoff) — its fidelity rules, guardrails, and token base all apply. This doc covers only the new Reception screen.

## What it is

A front-desk directory for routing incoming calls: the receptionist types whatever the caller gives them (a name, department, seat code, or extension), reads the extension off a large readout, and transfers. Optimized for use *while on the phone*: search is autofocused, the whole loop works keyboard-only (type → ↑↓ → Enter → read), and the extension renders at 46px mono so it can be read at a glance.

New rail item **Reception** (headset icon), after Settings. Available in both admin and viewer modes — the screen is inherently read-only. The screen also carries the app-wide light/dark theme toggle in its header (it switches the global theme, not a per-screen one; shell chrome stays dark either way).

## Screenshots

| # | State |
| --- | --- |
| 12 | Light, at rest — full directory + "Waiting for a call" empty state |
| 13 | Person locked — extension readout, seat line, same-department fallback |
| 14 | Same, dark mode |

## Repo map

| Piece | Implement in |
| --- | --- |
| Route | NEW `app/reception/page.tsx` (behind existing auth) |
| Directory list + search + detail cards | NEW `components/reception/` — plain components, no map/viewport dependencies |
| Rail item | The rail component from the main handoff (`AppRail.tsx`) — same active treatment (`#262626` bg + inset 3px `#FF5715`) |
| Data | Same roster the map and People panel use: assigned occupants + unassigned people (name, initials, position, dept, seat label ∥ null, zone) — **plus extension, backed by the existing `employees.phone_extension` field** (see Data contract) |

## Data contract — extensions

The prototype fabricates extensions (4101, 4102, … assigned per person at runtime). These are placeholders, as are the ones in the map inspector's Contact section. In the real app the field already exists: `employees.phone_extension` is first-class on the person record (types, publish snapshot, Management add/edit form) and Reception reads it from the `published_employees` snapshot — the directory's `extension` property is only a display mapping of that column. Source of truth is the phone system (GoTo) — manual entry now, directory sync later (see Future). Unassigned-seat people still have extensions; the UI already handles them (seat chip "—", voicemail note).

## Design tokens (`--r-*` family)

| Token | Light | Dark |
| --- | --- | --- |
| Page bg | `#F7F6F2` | `#161616` |
| Card bg | `#FFFFFF` | `#212121` |
| Card border | `#E7E1D8` | `rgba(255,255,255,.12)` |
| Row rules | `#EDE8E0` / `#F0EDE7` | `rgba(255,255,255,.08)` / `.06` |
| Text | `#161616` | `#F4F4F4` |
| Secondary | `#55504A` | `#D8D0C5` |
| Muted | `#6E655A` | `#B8AEA2` |
| Micro-labels | `#6E655A` | `#B8AEA2` |
| Initials chip | `#F0EDE7` on `#55504A` | `rgba(255,255,255,.10)` on `#D8D0C5` |
| Row hover | `#F7F4EE` | `#282828` |
| Selected row | `#FBF1E9` | `#332018` |
| Accent (selected edge) | `#D23F0A` | `#FF5715` |
| Extension panel bg / border / label | `#FBF1E9` / `#F0DFD2` / `#B85C33` | `#2A1B12` / `#54301B` / `#FC672A` |
| Detail avatar | `#161616` bg, `#F7F6F2` fg | `#F4F4F4` bg, `#161616` fg |

Type: IBM Plex Sans; extensions, seat chips, and kbd hints in IBM Plex Mono. Everything square-cornered (flat v12 chrome). Initials chips are **square**, not round — deliberate contrast with the map's circular avatars; this is a desk tool, not the map.

## Layout

- Content column `max-width: 1060px`, centered, 32px side padding, on the standard shell (36px top bar, 48px rail).
- Header row: `h1` 22/600 + theme toggle (28px bordered button: moon/sun glyph + "Dark mode"/"Light mode" label). Sub-line 13px muted: "Front-desk directory — type the caller's request, read the extension, transfer."
- Search bar: 52px card, search glyph, input 16.5px, autofocus, placeholder "Name, department, seat, or extension…", right-aligned kbd chips (`↑↓`, `↵ select`, 10px mono, bordered).
- Below, two columns, 20px gap: results list `minmax(0,1fr)` + 372px sidebar, `position: sticky; top: 20px`.
- **List**: header row (11px/600 uppercase live count · "EXT"), then rows: 34px square initials chip · name 14.5/600 over "position · dept" 12px muted (both ellipsize) · seat chip (11px mono, bordered, "—" if unseated) · extension 20px/600 mono, right-aligned, 72px column. Row padding 10px 16px; 1px rules between.
- **Detail card** (padding 22px): 46px avatar · name 18/600 + sub 12.5 muted; extension block (padding 14px 16px, tinted panel): "EXTENSION" 10/700 tracking .1em + readout 46px/600 mono (+ "↵ to lock" hint, 11px, only while previewing a live query); seat line 12.5px with pin glyph — "Seat C03 · Center Desks" or "No assigned seat — reaches voicemail if away".
- **Same-department fallback** (inside detail card, above a 1px rule): "IF NO ANSWER — SAME DEPARTMENT" 10/700, up to 3 colleagues as name (13px) + ext (14/600 mono) rows, clickable.
- **Recent lookups** card: same row pattern, up to 4.
- **Empty state** (no detail): headset glyph, "Waiting for a call" 14.5/600, helper line 12.5 muted.

## Interaction contracts (acceptance criteria)

1. **Search matching**: case-insensitive substring across name, position, department, seat code, and extension (one concatenated haystack). Ranking: name-prefix matches → name-contains → matches in other fields; ties alphabetical. Empty query = full directory, alphabetical.
2. **Live preview**: while the query is non-empty, the detail card shows the highlighted result (top-ranked by default) — no click needed. The readout carries the "↵ to lock" hint in this state.
3. **Keyboard**: ↓/↑ move the highlight (clamped at ends, no wrap; highlight resets to top on query change); Enter locks the highlighted person; Esc clears the query. Focus stays in the input throughout.
4. **Locking** (Enter or clicking any row, including fallback/recent rows): sets the selection, clears the query, and pushes the person onto Recent lookups — dedupe to front, store max 5, display max 4, current selection excluded from the list.
5. **Row states**: hover = hover token; highlighted/locked row = selected-row bg + inset 3px accent left edge (mirrors the rail's active treatment).
6. **Count label**: "N people" at rest; "N matches" (singular "match") while searching. No results: "No one matches "query"" centered in the list.
7. **Unseated people** list and lock normally — seat chip "—", seat line reads the voicemail fallback. Never hide someone for lacking a seat; the caller doesn't care.
8. **Theme toggle** switches the app-wide theme (per the main handoff's dark-mode tokens); rail + top bar stay dark. Persist wherever the app keeps theme preference.
9. **No draft/publish interaction**: Reception reads published assignment data only. It renders identically in admin and viewer modes.

## State

`query` · `highlightIndex` (clamped to results) · `selected` (person id — the prototype keys by name; use the real id) · `recents` (id[], max 5). Detail = `query ? results[highlightIndex] : selected`. All page-local. Whether `recents` persists across sessions is an open question below.

## Accessibility

- Focus lands in the search input on route entry and stays there during arrow navigation — `aria-activedescendant` listbox pattern recommended.
- The extension readout is the screen's output: wrap it in `aria-live="polite"` so selection changes are announced.
- Micro-labels (`#8E8276` at 10–11px) fall below AA against white — they are non-essential labels, but re-measure in the a11y pass; `#6E655A` (light) / `#B8AEA2` (dark) are the compliant fallbacks. Body text tokens above all clear 4.5:1.

## Future — GoTo integration (out of scope, design anticipates it)

- **Tier 1 — click-to-dial**: wrap the readout and row extensions in `tel:` links. The 46px readout is already the natural click target; no layout change.
- **Tier 2 — directory sync + screen pop**: extensions become synced from GoTo; inbound call pops the caller's record.
- **Tier 3 — embedded softphone.**
Nothing in this screen blocks any tier.

## Open questions (ask, don't guess)

1. Access: front desk logs in as what? If a dedicated low-privilege role is added, Reception + viewer map may be its whole surface.
2. Extension data entry until GoTo sync exists — add the field to the Management "Add/edit employee" form?
3. Should Recent lookups persist across sessions (front-desk machine reboots), or reset daily?
4. Rail placement: Reception currently sits last, after Settings. If front desk becomes a dedicated role, consider it first for that role.
