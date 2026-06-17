"use client";

import type { SeatStatus } from "@/lib/types";

type EmployeeResult = {
  id: string;
  name: string;
  meta: string;
  initials: string;
  seatId: string | null;
  seatLabel: string | null;
};

export type ActiveFilterChip = {
  id: string;
  label: string;
  value: string;
  removeLabel: string;
};

export type SeatResultItem = {
  id: string;
  label: string;
  person: string;
  department: string;
  status: SeatStatus;
  zone: string;
  selected: boolean;
};

export type ResultStatusBreakdown = Record<SeatStatus, number>;

type FilterPanelProps = {
  search: string;
  department: string;
  zone: string;
  status: string;
  departments: string[];
  zones: string[];
  collapsed: boolean;
  stats: {
    total: number;
    assigned: number;
    available: number;
    reserved: number;
  };
  employeeResults: EmployeeResult[];
  selectedSeatId: string | null;
  activeChips: ActiveFilterChip[];
  seatResults: SeatResultItem[];
  resultStatusBreakdown: ResultStatusBreakdown;
  resultEmptyTitle: string;
  resultEmptyDescription: string;
  showSeatResults: boolean;
  onToggle: () => void;
  onEmployeeSelect: (seatId: string) => void;
  onSeatResultSelect: (seatId: string) => void;
  onDepartmentChange: (value: string) => void;
  onZoneChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRemoveActiveChip: (chipId: string) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onClearAll: () => void;
};

const STATUS_LABELS: Record<SeatStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

function statusPillClass(status: SeatStatus) {
  if (status === "assigned") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "reserved") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "unavailable") return "bg-slate-100 text-slate-700 ring-slate-200";
  return "bg-white text-slate-700 ring-slate-200";
}

export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
  className = ""
}: {
  chips: ActiveFilterChip[];
  onRemove: (chipId: string) => void;
  onClearAll: () => void;
  className?: string;
}) {
  if (!chips.length) return null;

  return (
    <div aria-label="Active filters" className={["flex flex-wrap items-center gap-1.5", className].filter(Boolean).join(" ")}>
      {chips.map(chip => (
        <span key={chip.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/90 py-0.5 pl-2 pr-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
          <span className="shrink-0 text-slate-500">{chip.label}</span>
          <span className="min-w-0 truncate text-slate-950">{chip.value}</span>
          <button
            type="button"
            onClick={() => onRemove(chip.id)}
            aria-label={chip.removeLabel}
            title={chip.removeLabel}
            className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
          >
            x
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex min-h-6 items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-black text-brand-dark transition hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export function SeatResultsList({
  id,
  titleId = "seat-results-title",
  results,
  statusBreakdown,
  emptyTitle,
  emptyDescription,
  searchActive,
  filtersActive,
  onSelect,
  onClearSearch,
  onClearFilters,
  onClearAll,
  density = "panel",
  className = ""
}: {
  id?: string;
  titleId?: string;
  results: SeatResultItem[];
  statusBreakdown: ResultStatusBreakdown;
  emptyTitle: string;
  emptyDescription: string;
  searchActive: boolean;
  filtersActive: boolean;
  onSelect: (seatId: string) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onClearAll: () => void;
  density?: "panel" | "rail";
  className?: string;
}) {
  const statusParts = (["assigned", "available", "reserved", "unavailable"] as SeatStatus[])
    .map(item => `${statusBreakdown[item]} ${STATUS_LABELS[item].toLowerCase()}`)
    .join(" · ");
  const compact = density === "rail";

  return (
    <section id={id} aria-labelledby={titleId} className={[compact ? "rounded-xl border border-slate-200/80 bg-slate-50/65 p-1 shadow-none" : "rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 shadow-none", className].filter(Boolean).join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-xs font-black text-slate-900">Seat results</h2>
          <p className={["mt-0.5 truncate font-semibold text-slate-500", compact ? "text-[10px]" : "text-[10px]"].join(" ")}>{results.length} matching seats{compact ? "" : ` · ${statusParts}`}</p>
        </div>
      </div>

      {results.length > 0 ? (
        <div role="list" aria-label="Seat results" className={[compact ? "mt-1 max-h-[96px] space-y-0.5" : "mt-2 max-h-[196px] space-y-1", "overflow-auto overscroll-contain pr-1"].join(" ")}>
          {results.map(result => {
            const resultActionLabel = `${result.label}. ${result.person}. ${result.department}. ${STATUS_LABELS[result.status]}. ${result.zone}. Select and center on map.`;

            return (
              <button
                key={result.id}
                type="button"
                role="listitem"
                aria-label={resultActionLabel}
                aria-current={result.selected ? "true" : undefined}
                onClick={() => onSelect(result.id)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSelect(result.id);
                  }
                }}
                className={[
                  "grid w-full grid-cols-[minmax(3rem,auto)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 text-left transition hover:border-orange-200 hover:bg-orange-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100",
                  compact ? "min-h-7 py-0.5" : "py-1.5",
                  result.selected ? "border-orange-300 bg-white ring-1 ring-orange-100" : "border-slate-200/80 bg-white/80"
                ].join(" ")}
              >
                <span className={compact ? "text-xs font-black text-slate-950" : "text-[13px] font-black text-slate-950"}>{result.label}</span>
                <span className="min-w-0">
                  <span className={compact ? "block truncate text-[11px] font-bold text-slate-800" : "block truncate text-xs font-bold text-slate-800"}>{compact ? `${result.person} · ${result.zone}` : result.person}</span>
                  {!compact && (
                    <span className="block truncate text-[11px] text-slate-500">{result.department} · {result.zone}</span>
                  )}
                </span>
                <span className={["rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1", statusPillClass(result.status)].join(" ")}>
                  {STATUS_LABELS[result.status]}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white/70 p-2.5 text-xs text-slate-500">
          <div className="font-black text-slate-800">{emptyTitle}</div>
          <div className="mt-1 leading-5">{emptyDescription}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {searchActive && (
              <button type="button" onClick={onClearSearch} aria-label="Clear search in empty results" className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                Clear search
              </button>
            )}
            {filtersActive && (
              <button type="button" onClick={onClearFilters} className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                Clear filters
              </button>
            )}
            {searchActive && filtersActive && (
              <button type="button" onClick={onClearAll} className="rounded-lg bg-orange-50 px-3 py-1.5 text-[11px] font-black text-brand-dark ring-1 ring-orange-200 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function FilterPanel({
  search,
  department,
  zone,
  status,
  departments,
  zones,
  collapsed,
  stats,
  employeeResults,
  selectedSeatId,
  activeChips,
  seatResults,
  resultStatusBreakdown,
  resultEmptyTitle,
  resultEmptyDescription,
  showSeatResults,
  onToggle,
  onEmployeeSelect,
  onSeatResultSelect,
  onDepartmentChange,
  onZoneChange,
  onStatusChange,
  onRemoveActiveChip,
  onClearSearch,
  onClearFilters,
  onClearAll
}: FilterPanelProps) {
  const activeStructuredChips = activeChips.filter(chip => chip.id !== "search");
  const constraintsActive = activeChips.length > 0;
  const searchActive = Boolean(search.trim());
  const structuredFiltersActive = department !== "all" || zone !== "all" || status !== "all";
  const structuredFilterCount = [department !== "all", zone !== "all", status !== "all"].filter(Boolean).length;
  const statItems = [
    { label: "Total", value: stats.total },
    { label: "Assigned", value: stats.assigned },
    { label: "Open", value: stats.available },
    { label: "Reserved", value: stats.reserved }
  ];

  if (collapsed) {
    return (
      <aside className="self-start lg:sticky lg:top-[62px]">
        <button
          type="button"
          onClick={onToggle}
          aria-controls="seat-map-filter-panel"
          aria-expanded={false}
          aria-label={structuredFilterCount ? `Open filters, ${structuredFilterCount} active` : "Open filters"}
          title={structuredFilterCount ? `${structuredFilterCount} active filters` : "Open filters"}
          className="relative flex min-h-11 w-full items-center justify-center rounded-full border border-white/70 bg-white/70 px-4 py-2 text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl transition hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 lg:min-h-[164px] lg:w-[48px] lg:flex-col lg:px-2 lg:py-4"
        >
          {structuredFilterCount > 0 && (
            <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-black text-white ring-2 ring-white lg:right-auto lg:top-3">
              {structuredFilterCount}
            </span>
          )}
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] lg:rotate-180 lg:[writing-mode:vertical-rl]">Filters</span>
          <span className="ml-2 text-[10px] text-slate-400 lg:ml-0 lg:mt-2 lg:rotate-180 lg:[writing-mode:vertical-rl]">
            {structuredFilterCount ? "Active" : "Refine"}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside id="seat-map-filter-panel" aria-labelledby="seat-map-filter-title" className="max-h-[55vh] w-full self-start overflow-auto overscroll-contain rounded-2xl border border-white/70 bg-white/80 p-3 shadow-[0_14px_38px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl sm:max-h-[62vh] lg:sticky lg:top-[62px] lg:max-h-[calc(100vh-78px)] lg:w-[288px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="seat-map-filter-title" className="text-sm font-black text-slate-900">Filters</h2>
        <div className="flex items-center gap-1">
          {constraintsActive && (
            <button type="button" onClick={onClearAll} aria-label="Clear all active search and filters" className="inline-flex min-h-6 items-center rounded-md px-2 py-1 text-[11px] font-bold text-brand hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
              Clear all
            </button>
          )}
          <button type="button" onClick={onToggle} aria-controls="seat-map-filter-panel" aria-expanded={true} aria-label="Collapse filters" className="inline-flex min-h-6 items-center rounded-md px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
            Collapse
          </button>
        </div>
      </div>

      <ActiveFilterChips chips={activeStructuredChips} onRemove={onRemoveActiveChip} onClearAll={onClearFilters} className="mb-3" />

      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
          <select
            value={department}
            onChange={event => onDepartmentChange(event.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">All departments</option>
            {departments.map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Zone</span>
          <select
            value={zone}
            onChange={event => onZoneChange(event.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">All zones</option>
            {zones.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status</span>
          <select
            value={status}
            onChange={event => onStatusChange(event.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="reserved">Reserved</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>

      {showSeatResults && (
        <div className="mt-4 border-t border-slate-100 pt-3 lg:hidden">
          <SeatResultsList
            id="mobile-seat-results"
            titleId="mobile-seat-results-title"
            results={seatResults}
            statusBreakdown={resultStatusBreakdown}
            emptyTitle={resultEmptyTitle}
            emptyDescription={resultEmptyDescription}
            searchActive={searchActive}
            filtersActive={structuredFiltersActive}
            onSelect={onSeatResultSelect}
            onClearSearch={onClearSearch}
            onClearFilters={onClearFilters}
            onClearAll={onClearAll}
          />
        </div>
      )}

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">People · {employeeResults.length}</div>
          {structuredFiltersActive && <div className="text-[11px] font-semibold text-brand-dark">Filtered</div>}
        </div>
        <div aria-label="People results" className="max-h-[180px] space-y-2 overflow-auto overscroll-contain pr-1 sm:max-h-[260px]">
          {employeeResults.length ? employeeResults.map(result => {
            const selected = Boolean(result.seatId && result.seatId === selectedSeatId);
            const resultActionLabel = result.seatId
              ? selected
                ? `${result.name}. ${result.meta}. ${result.seatLabel} selected.`
                : `${result.name}. ${result.meta}. Open ${result.seatLabel}.`
              : `${result.name}. ${result.meta}. Unassigned.`;

            return (
              <button
                key={result.id}
                type="button"
                disabled={!result.seatId}
                aria-label={resultActionLabel}
                aria-current={selected ? "true" : undefined}
                title={result.seatId ? `Open ${result.seatLabel}` : "No assigned seat to open"}
                onClick={() => result.seatId && onEmployeeSelect(result.seatId)}
                className={[
                  "flex w-full items-center gap-3 rounded-lg border bg-white p-2 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60",
                  selected ? "border-orange-300 bg-orange-50/80 ring-2 ring-orange-100" : "border-slate-200"
                ].join(" ")}
              >
                <span className={["flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-black ring-1", selected ? "bg-white text-brand-dark ring-orange-200" : "bg-slate-100 text-slate-700 ring-slate-200"].join(" ")}>
                  {result.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{result.name}</span>
                  <span className="block truncate text-xs text-slate-500">{result.meta}</span>
                </span>
                <span className={["shrink-0 text-[11px] font-black", selected ? "text-brand-dark" : "text-slate-400"].join(" ")}>
                  {selected ? "Selected" : result.seatLabel ?? "-"}
                </span>
              </button>
            );
          }) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <div className="font-semibold text-slate-700">No employees match the current filters.</div>
              <div className="mt-1">Clear filters or search by seat label, employee name, position, department, or zone.</div>
              {constraintsActive && (
                <button type="button" onClick={onClearAll} className="mt-2 text-xs font-bold text-brand hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 hidden grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:grid">
        {statItems.map((item, index) => (
          <div key={item.label} className={["border-slate-200 px-2 py-2 text-center", index % 2 === 0 ? "border-r" : "", index < statItems.length - 2 ? "border-b" : ""].join(" ")}>
            <div className="text-sm font-black text-slate-900">{item.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 hidden space-y-2 border-t border-slate-100 pt-3 sm:block">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Legend</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" />Available</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Assigned</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Reserved</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Unavailable</div>
        </div>
      </div>
    </aside>
  );
}
