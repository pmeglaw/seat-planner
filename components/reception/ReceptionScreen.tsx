"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  pushRecentLookup,
  sameDepartmentFallback,
  searchReceptionDirectory,
  type ReceptionPerson
} from "@/lib/receptionDirectory";
// The shared initials rule every avatar surface uses (inspector, viewer
// finder, Management) — Reception must not grow its own variant, or the same
// person shows different initials at the front desk.
import { buildInitials } from "@/lib/validators";

// Reception — front-desk call routing (reception handoff). Read-only: renders
// published data handed down by app/reception/page.tsx and never mutates
// anything. Optimized for use while on the phone: search is autofocused, the
// whole loop is keyboard-only (type → ↑↓ → Enter → read), and the extension
// renders at 46px mono. Recents are in-memory only (owner ruling 2026-08-05:
// reset on reload; no cross-session persistence).

type ReceptionScreenProps = {
  people: ReceptionPerson[];
};

const RECENTS_STORED_MAX = 5;
const RECENTS_DISPLAY_MAX = 4;

function optionDomId(person: ReceptionPerson) {
  return `reception-option-${person.id}`;
}

/** Keeps focus in the search input when list rows are clicked (contract #3:
 *  focus stays in the input throughout). */
function keepInputFocus(event: ReactMouseEvent) {
  event.preventDefault();
}

export function ReceptionScreen({ people }: ReceptionScreenProps) {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchReceptionDirectory(people, query), [people, query]);
  const byId = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);

  // Contract #2/#3: while searching, the detail card previews the highlighted
  // result live; at rest it shows the locked selection.
  const clampedHighlight = Math.min(highlightIndex, Math.max(0, results.length - 1));
  const detail = searching ? (results[clampedHighlight] ?? null) : selectedId ? (byId.get(selectedId) ?? null) : null;

  // Keep the highlighted row visible as arrows move it.
  useEffect(() => {
    if (!searching || !detail) return;
    document.getElementById(optionDomId(detail))?.scrollIntoView({ block: "nearest" });
  }, [searching, detail]);

  function lock(person: ReceptionPerson) {
    setSelectedId(person.id);
    setRecents(current => pushRecentLookup(current, person.id, RECENTS_STORED_MAX));
    setQuery("");
    setHighlightIndex(0);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex(current => Math.min(current + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
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
      event.preventDefault();
      setQuery("");
      setHighlightIndex(0);
    }
  }

  const fallback = detail ? sameDepartmentFallback(people, detail) : [];
  const recentPeople = recents
    .filter(id => id !== selectedId)
    .map(id => byId.get(id))
    .filter((person): person is ReceptionPerson => Boolean(person))
    .slice(0, RECENTS_DISPLAY_MAX);

  const countLabel = searching
    ? `${results.length} ${results.length === 1 ? "match" : "matches"}`
    : `${people.length} people`;

  return (
    <div className="mx-auto w-full max-w-[1060px] px-8 pb-16 pt-6">
      <header className="mb-4">
        <h1 className="text-[22px] font-semibold leading-tight text-[var(--sp-text-primary)]">Reception</h1>
        <p className="mt-1 text-[13px] text-[var(--sp-text-helper)]">
          Front-desk directory — type the caller&apos;s request, read the extension, transfer.
        </p>
      </header>

      {/* Search bar */}
      <div className="flex h-[52px] items-center gap-3 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-4">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--sp-text-helper)" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="9" cy="9" r="5.2" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          ref={inputRef}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the handoff's core
          // contract: focus lands in search on route entry (phone in one hand).
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="reception-results"
          aria-activedescendant={searching && detail ? optionDomId(detail) : undefined}
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
          className="h-full w-full min-w-0 bg-transparent text-[16.5px] text-[var(--sp-text-primary)] outline-none placeholder:text-[var(--sp-text-helper)]"
        />
        <span aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <kbd className="border border-[var(--sp-border-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--sp-text-helper)]">↑↓</kbd>
          <kbd className="border border-[var(--sp-border-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--sp-text-helper)]">↵ select</kbd>
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_372px]">
        {/* Results list */}
        <section aria-label="Directory" className="border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)]">
          <div className="flex items-center justify-between border-b border-[var(--sp-border-hairline)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sp-text-helper)]">
            <span aria-live="polite">{countLabel}</span>
            <span>Ext</span>
          </div>
          {results.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-[var(--sp-text-helper)]">
              {people.length === 0
                ? "The directory is empty — it fills in when an admin publishes the seat map."
                : <>No one matches &ldquo;{query.trim()}&rdquo; &mdash; press Esc to clear the search.</>}
            </p>
          ) : (
            <ul id="reception-results" role="listbox" aria-label="People">
              {results.map(person => {
                const isActive = searching ? detail?.id === person.id : selectedId === person.id;
                return (
                  <li
                    key={person.id}
                    id={optionDomId(person)}
                    role="option"
                    aria-selected={isActive}
                    onMouseDown={keepInputFocus}
                    onClick={() => lock(person)}
                    className={[
                      "flex cursor-pointer items-center gap-3 border-b border-[var(--sp-border-hairline-soft)] px-4 py-2.5 last:border-b-0",
                      isActive
                        ? "bg-[var(--sp-layer-selected)] shadow-[inset_3px_0_0_var(--sp-accent)]"
                        : "hover:bg-[var(--sp-layer-hover)]"
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center bg-[var(--sp-tag-bg)] text-[12px] font-semibold text-[var(--sp-tag-text)]"
                    >
                      {buildInitials(person.name) || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold leading-tight text-[var(--sp-text-primary)]">
                        {person.name}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--sp-text-helper)]">
                        {[person.position, person.department].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 border border-[var(--sp-border-subtle)] px-1.5 py-0.5 font-mono text-xs text-[var(--sp-text-secondary)]">
                      {person.seatLabel ?? "—"}
                    </span>
                    <span className="w-[72px] shrink-0 text-right font-mono text-[20px] font-semibold text-[var(--sp-text-primary)]">
                      {person.extension ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Sidebar: detail (or empty state) + recents */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-5">
          {detail ? (
            <section aria-label="Caller detail" className="border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-[22px]">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-[46px] w-[46px] shrink-0 items-center justify-center bg-[var(--sp-identity-avatar-bg)] text-[16px] font-semibold text-[var(--sp-identity-avatar-fg)]"
                >
                  {buildInitials(detail.name) || "?"}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-semibold leading-tight text-[var(--sp-text-primary)]">{detail.name}</h2>
                  <p className="truncate text-[12.5px] text-[var(--sp-text-helper)]">
                    {[detail.position, detail.department].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </div>

              {/* The readout is the screen's output — announce changes. */}
              <div aria-live="polite" className="mt-4 border border-[var(--sp-extension-border)] bg-[var(--sp-extension-bg)] px-4 py-3.5">
                <div className="flex items-baseline justify-between">
                  {/* Type-floor Ruling 3 (2026-08-24): eyebrows hold 12px minimum;
                      subordination comes from weight + colour, not size. */}
                  <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sp-extension-label)]">Extension</span>
                  {searching && (
                    <span aria-hidden="true" className="text-xs text-[var(--sp-text-helper)]">↵ to lock</span>
                  )}
                </div>
                <div className="font-mono text-[46px] font-semibold leading-[1.15] text-[var(--sp-text-primary)]">
                  {detail.extension ?? "—"}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[var(--sp-text-secondary)]">
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M10 18s-6-5.1-6-9.5a6 6 0 1 1 12 0C16 12.9 10 18 10 18Z" />
                    <circle cx="10" cy="8.5" r="2" />
                  </svg>
                  {detail.seatLabel
                    ? `Seat ${detail.seatLabel}${detail.zone ? ` · ${detail.zone}` : ""}`
                    : "No assigned seat — reaches voicemail if away"}
                </p>
              </div>

              {fallback.length > 0 && (
                <div className="mt-4 border-t border-[var(--sp-border-hairline)] pt-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sp-text-helper)]">
                    If no answer — same department
                  </h3>
                  <ul className="mt-1.5">
                    {fallback.map(colleague => (
                      <li key={colleague.id}>
                        <button
                          type="button"
                          onMouseDown={keepInputFocus}
                          onClick={() => lock(colleague)}
                          className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-accent)]"
                        >
                          <span className="truncate text-[13px] text-[var(--sp-text-primary)]">{colleague.name}</span>
                          <span className="shrink-0 font-mono text-[14px] font-semibold text-[var(--sp-text-primary)]">
                            {colleague.extension}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            <section
              aria-label="Caller detail"
              className="flex flex-col items-center border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-6 py-12 text-center"
            >
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="var(--sp-text-helper)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11V9.5a6 6 0 0 1 12 0V11" />
                <path d="M4 11h2v3.5H4.6A.6.6 0 0 1 4 13.9V11ZM16 11h-2v3.5h1.4a.6.6 0 0 0 .6-.6V11Z" />
                <path d="M16 14.5v1a2 2 0 0 1-2 2h-2.5" />
              </svg>
              <p className="mt-3 text-[14.5px] font-semibold text-[var(--sp-text-primary)]">Waiting for a call</p>
              <p className="mt-1 text-[12.5px] text-[var(--sp-text-helper)]">
                Start typing what the caller gives you — a name, department, seat, or extension.
              </p>
            </section>
          )}

          {recentPeople.length > 0 && (
            <section aria-label="Recent lookups" className="border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)]">
              <h3 className="border-b border-[var(--sp-border-hairline)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sp-text-helper)]">
                Recent lookups
              </h3>
              <ul>
                {recentPeople.map(person => (
                  <li key={person.id} className="border-b border-[var(--sp-border-hairline-soft)] last:border-b-0">
                    <button
                      type="button"
                      onMouseDown={keepInputFocus}
                      onClick={() => lock(person)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-accent)]"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center bg-[var(--sp-tag-bg)] text-xs font-semibold text-[var(--sp-tag-text)]"
                      >
                        {buildInitials(person.name) || "?"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--sp-text-primary)]">{person.name}</span>
                      <span className="shrink-0 font-mono text-[14px] font-semibold text-[var(--sp-text-primary)]">
                        {person.extension ?? "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
