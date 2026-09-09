"use client";

import Link from "next/link";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { CloseIcon, PinIcon, SearchIcon } from "@/components/ui/icons";
import { readQueryParam, withQueryParam } from "@/lib/deepLink";
import { DEFAULT_FLOOR } from "@/lib/floorIds";
import { floorLabel, floorTag } from "@/lib/floors";
import { shortcutHint } from "@/lib/platformShortcut";
import {
  pushRecentLookup,
  sameDepartmentFallback,
  searchReceptionDirectory,
  type ReceptionPerson
} from "@/lib/receptionDirectory";

// Reception — front-desk call routing, on the Phase 3 `.sp-recep` family
// (redesign-v2 Phase 4 PR 5; PHASE2UX §1R; PHASE3DS §1.29; DECISIONS D3 /
// D3′ / D3-a…f). Read-only: renders published data handed down by
// app/(shell)/reception/page.tsx and never mutates anything.
//
// Two zones (D3, density by zone): the LIST is dense — scanned — and the
// READOUT is calm — read aloud under time pressure.
//
// Under the sheet's 1055 fold the readout splits BY JOB (Phase 5 PR 2, owner
// ruling R1; sheet amendment I; D3-f): the BAND — name, extension tile, seat
// line — is pinned under the search so the answer is never below the fold,
// and the TAIL — the same-department fallbacks and Show on map — follows the
// list. The receptionist keeps her window about a third of a 1920 monitor
// wide, and before this the one number she reads aloud sat under the list.
// D3-f retires the "Back to the list" ghost with the drill-down it belonged
// to: the list is never left, so there is nothing to go back from — which is
// also what keeps the band free of focusable elements, the condition the
// CSS-only mechanism rests on (reviewer ruling O-1). The whole loop is
// keyboard-first with the phone in one hand: the field is autofocused, ↑ ↓
// move the cursor (`[data-highlight]`, the readout previews it), ↵ locks
// (`aria-selected="true"`, the readout holds the person, `?q=<name>` written),
// Esc clears a typed query first and unlocks on an empty field (owner ruling
// Q-1, 2026-09-06 — the call may still be live, so a mistyped second lookup
// never drops the person being read out). A pointer never steals focus from
// the field: rows, row-buttons, recents and the clear × all cancel mousedown.
// Ctrl / ⌘ K refocuses the field from anywhere on the page.
//
// No avatar and no status mark on the rows (PHASE3DS §1.29 owner ruling; Q-4):
// name + meta carry the row, the seat code is plain code-01 text, the Floor
// tag appears only where the floor differs from the mapped one.
//
// Recents are in-memory only (owner ruling 2026-08-05: reset on reload; no
// cross-session persistence) and sit outside the live region (O-9): a new
// lock is announced, the recents list is not.

type ReceptionScreenProps = {
  people: ReceptionPerson[];
  /** The landing `?q=` (D3-c, PHASE2UX §1R.5): pre-fills the field; a unique
   *  match locks; several leave the cursor on the first row; zero shows the
   *  zero state with the query kept. */
  initialQuery?: string;
  /** The seats query failed alone (PHASE2UX §1R.6 "Partial"): every seat cell
   *  reads the dash, no Floor tag, the readout says the seat is unknown, and
   *  one warning notification sits above the list. Extensions still read. */
  seatsUnavailable?: boolean;
};

const RECENTS_STORED_MAX = 5;
const RECENTS_DISPLAY_MAX = 4;
const RECEPTION_PATH = "/reception";

function optionDomId(person: ReceptionPerson) {
  return `reception-option-${person.id}`;
}

/** Keeps focus in the search input when anything else is clicked (the
 *  receptionist is typing with the phone in the other hand). */
function keepInputFocus(event: ReactMouseEvent) {
  event.preventDefault();
}

function metaLine(person: ReceptionPerson) {
  return [person.position, person.department].filter(Boolean).join(" · ") || "—";
}

// One writer for the URL (D3-c): `?q=<name>` on lock, bare on unlock.
// `history.replaceState`, not `router.replace` — the page is force-dynamic and
// a soft navigation would refetch the whole directory for a lock (the PR 4
// `?tab=` precedent, PHASE4BUILD §1.37). The current `history.state` is passed
// back verbatim: a `null` state wipes the App Router's own history entry and
// breaks back / forward (the SeatMap and Management writers do the same).
function writeQueryUrl(name: string | null) {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", RECEPTION_PATH + withQueryParam("", name ?? ""));
}

// The landing query: the server's `?q=` (searchParams), or — when the router
// restores a cached tree on browser back (Client Router Cache, `staleTimes`)
// whose server render saw no `?q=` — the live URL's. On a hydration render both
// agree (the server read the same URL), so the markup never differs.
function landingQuery(initialQuery: string) {
  if (initialQuery.trim()) return initialQuery;
  if (typeof window === "undefined") return "";
  return readQueryParam(window.location.search);
}

export function ReceptionScreen({ people, initialQuery = "", seatsUnavailable = false }: ReceptionScreenProps) {
  // The landing (D3-c): a unique `?q=` match is locked from the first render
  // (lazy initial state — identical on the server and the client, so no
  // setState-in-effect and no hydration mismatch); otherwise the query stays
  // in the field with the cursor on the first row, or the zero state.
  const [landing] = useState(() => landingQuery(initialQuery));
  const [landed] = useState<ReceptionPerson | null>(() => {
    if (!landing.trim()) return null;
    const found = searchReceptionDirectory(people, landing);
    return found.length === 1 ? found[0] : null;
  });
  const [query, setQuery] = useState(landed ? "" : landing);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(landed?.id ?? null);
  const [recents, setRecents] = useState<string[]>(landed ? [landed.id] : []);
  // The server always renders "Ctrl K"; the platform is decided after mount
  // (P3-4, lib/platformShortcut) so the markup matches on both sides.
  const [hint, setHint] = useState("Ctrl K");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchReceptionDirectory(people, query), [people, query]);
  const byId = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);

  // The cursor exists only while typing with results; the readout previews
  // it. At rest — or while a query matches nobody — the readout holds the
  // locked person (PHASE2UX §1R.6: the call may still be live).
  const clampedHighlight = Math.min(highlightIndex, Math.max(0, results.length - 1));
  const cursor = searching ? (results[clampedHighlight] ?? null) : null;
  const locked = selectedId ? (byId.get(selectedId) ?? null) : null;
  const detail = cursor ?? locked;
  const previewing = cursor !== null;

  function lock(person: ReceptionPerson) {
    setSelectedId(person.id);
    setRecents(current => pushRecentLookup(current, person.id, RECENTS_STORED_MAX));
    setQuery("");
    setHighlightIndex(0);
    inputRef.current?.focus();
    writeQueryUrl(person.name);
  }

  function unlock() {
    setSelectedId(null);
    writeQueryUrl(null);
  }

  function clearQuery() {
    setQuery("");
    setHighlightIndex(0);
    inputRef.current?.focus();
  }

  // The landed lock rewrites `?q=` to the person's name, as ↵ would.
  useEffect(() => {
    if (landed) writeQueryUrl(landed.name);
  }, [landed]);

  // The platform hint (after paint, never in the render — P3-4), and
  // Ctrl / ⌘ K from anywhere on the page (the same predicate as the map's
  // search, SeatMap.tsx).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHint(shortcutHint(window.navigator.platform, "K"));
    });
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  // Keep the cursor's row visible as ↑ ↓ move it.
  useEffect(() => {
    if (!cursor) return;
    document.getElementById(optionDomId(cursor))?.scrollIntoView?.({ block: "nearest" });
  }, [cursor]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!searching) return;
      setHighlightIndex(current => Math.min(current + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!searching) return;
      setHighlightIndex(current => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      if (!searching) return;
      event.preventDefault();
      const person = results[clampedHighlight];
      if (person) lock(person);
      return;
    }
    if (event.key === "Escape") {
      // Two rungs (Q-1): a typed query clears first — the lock stays; an
      // empty field unlocks.
      event.preventDefault();
      if (searching) {
        clearQuery();
        return;
      }
      if (selectedId) unlock();
    }
  }

  const fallback = detail ? sameDepartmentFallback(people, detail) : [];
  // "Show on map" is the locked person's action, never a preview's.
  const showOnMap = !previewing && locked;
  // The tail only exists when it has something in it: an empty flex child
  // would still take one of the section's 16px gaps at wide (Phase 5 PR 2).
  const hasTail = fallback.length > 0 || Boolean(showOnMap);
  const recentPeople = recents
    .filter(id => id !== selectedId)
    .map(id => byId.get(id))
    .filter((person): person is ReceptionPerson => Boolean(person))
    .slice(0, RECENTS_DISPLAY_MAX);

  const countLabel = searching
    ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
    : `${people.length} people`;

  // The seat cell: the code as plain text; the Floor tag only where the floor
  // differs from the mapped one (O-10); otherwise empty, and the sheet draws
  // the dash. Partial: every cell empty.
  function seatCell(person: ReceptionPerson) {
    if (seatsUnavailable) return <span className="sp-recep-seat" />;
    if (person.seatLabel) return <span className="sp-recep-seat">{person.seatLabel}</span>;
    if (person.floor && person.floor !== DEFAULT_FLOOR) return <span className="cds-tag">{floorTag(person.floor)}</span>;
    return <span className="sp-recep-seat" />;
  }

  return (
    <div className="sp-recep">
      <div className="sp-recep-list">
        <div role="search">
          <div className="sp-search-lg">
            <SearchIcon />
            <input
              ref={inputRef}
              // The handoff's core contract: focus lands in search on route
              // entry (phone in one hand).
              autoFocus
              id="reception-main"
              className="cds-text-input"
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls="reception-results"
              aria-activedescendant={cursor ? optionDomId(cursor) : undefined}
              aria-label="Search the directory"
              autoComplete="off"
              spellCheck={false}
              placeholder="Name, department, seat, or extension…"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setHighlightIndex(0);
              }}
              onKeyDown={handleKeyDown}
            />
            <span className="sp-search-trailing">
              <span className="sp-kbd" aria-hidden="true">{hint}</span>
              {query ? (
                <button
                  type="button"
                  className="cds-btn cds-btn--icon sp-search-clear"
                  aria-label="Clear search"
                  onMouseDown={keepInputFocus}
                  onClick={clearQuery}
                >
                  <CloseIcon />
                </button>
              ) : null}
            </span>
          </div>
        </div>

        {seatsUnavailable && (
          <div className="cds-notification cds-notification--warning" role="status">
            <NotificationGlyph kind="warning" />
            <div className="cds-notification-text">
              <strong>Seat locations didn&apos;t load</strong>
              <p>Extensions are up to date. Seat and floor details will show after a reload.</p>
            </div>
          </div>
        )}

        <div className="sp-recep-header">
          <span className="sp-recep-count" aria-live="polite">{countLabel}</span>
          <span className="sp-recep-ext-head">Ext</span>
        </div>
        {/* The listbox stays mounted through the zero state so the field's
            aria-controls always resolves (an unresolved reference is a
            critical axe finding). */}
        <ul id="reception-results" className="sp-recep-rows" role="listbox" aria-label="People">
          {results.map(person => {
            const isCursor = cursor?.id === person.id;
            const meta = metaLine(person);
            return (
              <li
                key={person.id}
                id={optionDomId(person)}
                className="sp-recep-row"
                role="option"
                aria-selected={selectedId === person.id}
                data-highlight={isCursor ? "" : undefined}
                onMouseDown={keepInputFocus}
                onClick={() => lock(person)}
              >
                <span>
                  <span className="sp-recep-name" title={person.name}>{person.name}</span>
                  <br />
                  <span className="sp-recep-meta" title={meta}>{meta}</span>
                </span>
                {seatCell(person)}
                <span className="sp-recep-ext">{person.extension ?? ""}</span>
              </li>
            );
          })}
        </ul>
        {results.length === 0 && (
          <div className="cds-empty">
            {people.length === 0 ? (
              <>
                <h3>The directory is empty</h3>
                <p>It fills in when an admin publishes the seat map.</p>
              </>
            ) : (
              <>
                <h3>No one matches &ldquo;{query.trim()}&rdquo;</h3>
                <p>Try a name, department, seat code or extension.</p>
                <div className="cds-empty-actions">
                  <button
                    type="button"
                    className="cds-btn cds-btn--ghost cds-btn--sm"
                    onMouseDown={keepInputFocus}
                    onClick={clearQuery}
                  >
                    Clear search
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* The readout column (calm zone). Sticky under the header (sheet); in
          the shell the PANE scrolls at lg, so the header offset is zeroed on
          this element (O-11, the PR 4 §1.37 tab-strip precedent) — and the
          BAND inherits that zero through the DOM, which is exactly what the
          1024–1055 seam needs (there the pane already scrolls while the sheet
          is still below its 1055 fold).
          Phase 5 PR 2 (owner ruling R1, sheet amendment I): below the fold the
          readout SPLITS BY JOB — the band (name, tile, seat line) is pinned
          under the search and the tail follows the list — so this section goes
          display:contents there and its three children are ordered around the
          list. It keeps its box and its label above the fold, so nothing at
          ≥1056 moves.
          The live region is the BAND, not the whole column: a lock announces
          name · extension · seat line and stops. The fallbacks and Show on map
          left it with the split (reviewer ruling O-3, 2026-09-08 — the one
          named, dated exception to "wide unchanged"); the recents list already
          sat outside it for the same reason (O-9). */}
      <section
        className="sp-recep-readout lg:[--sp-shell-header-h:0px]"
        aria-label="Caller detail"
      >
        <div aria-live="polite" className="sp-recep-band">
          {detail ? (
            <>
              <div className="sp-recep-who">
                <h2>{detail.name}</h2>
                <p className="sp-recep-role">{metaLine(detail)}</p>
              </div>
              <div className="sp-readout">
                <span className="sp-readout-eyebrow">Extension</span>
                {detail.extension ? (
                  <span className="sp-readout-numeral">{detail.extension}</span>
                ) : (
                  <span className="sp-readout-none">No extension on file</span>
                )}
                {/* The hint states the CURRENT key (PHASE2UX §1R.4 item 2; the
                    specimen's readout states; Q-1): ↵ while a result is
                    previewed; nothing while a typed query matches nobody (Esc
                    would clear the query, not unlock); Esc only when locked
                    and not typing. */}
                {previewing ? (
                  <span className="sp-readout-hint"><span className="sp-kbd" aria-hidden="true">↵</span>to lock</span>
                ) : locked && !searching ? (
                  <span className="sp-readout-hint"><span className="sp-kbd" aria-hidden="true">Esc</span>to unlock</span>
                ) : null}
              </div>
              <div className="sp-recep-seatline">
                <PinIcon />
                {seatsUnavailable ? (
                  <span className="sp-recep-partial">Seat unknown right now — the map is still loading.</span>
                ) : (
                  <span>
                    {detail.seatLabel
                      ? `Seat ${detail.seatLabel} · ${floorTag(detail.floor ?? DEFAULT_FLOOR)}${detail.zone ? ` · ${detail.zone}` : ""}`
                      : detail.floor
                        ? `${floorLabel(detail.floor)} — reaches voicemail if away`
                        : "No assigned seat — reaches voicemail if away"}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="sp-recep-waiting">
              <strong>Waiting for a call.</strong> Start typing what the caller gives you — a name, department, seat, or extension.
            </p>
          )}
        </div>

        {/* The tail: directly under the band at wide, below the LIST under the
            fold (R1). Its order is PHASE2UX §1R.4's shipped items 5 then 6 —
            the hand-off's map-first R3 was withdrawn at plan review (reviewer
            ruling O-2), and these are focusable controls, so nothing here is
            ever reordered by CSS at either frame (WCAG 2.4.3). */}
        {hasTail && (
          <div className="sp-recep-tail">
            {fallback.length > 0 && (
              <div className="sp-recep-fallback">
                <h3>If no answer — same department</h3>
                <div className="sp-row-buttons">
                  {fallback.map(colleague => (
                    <button
                      key={colleague.id}
                      type="button"
                      className="cds-btn cds-btn--ghost"
                      onMouseDown={keepInputFocus}
                      onClick={() => lock(colleague)}
                    >
                      {colleague.name}
                      <span className="sp-row-button-ext">{colleague.extension}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showOnMap && (
              <Link href={"/" + withQueryParam("", showOnMap.name)} className="cds-btn cds-btn--ghost cds-btn--md self-start">
                Show on map
              </Link>
            )}
          </div>
        )}

        {recentPeople.length > 0 && (
          <aside className="sp-recep-recent" aria-label="Recent lookups">
            <h3>Recent lookups</h3>
            <ul>
              {recentPeople.map(person => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="cds-btn cds-btn--ghost"
                    onMouseDown={keepInputFocus}
                    onClick={() => lock(person)}
                  >
                    {person.name}
                    <span className="sp-recep-ext">{person.extension ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </section>
    </div>
  );
}
