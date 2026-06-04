"use client";

type EmployeeResult = {
  id: string;
  name: string;
  meta: string;
  initials: string;
  seatId: string | null;
  seatLabel: string | null;
};

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
  onToggle: () => void;
  onEmployeeSelect: (seatId: string) => void;
  onDepartmentChange: (value: string) => void;
  onZoneChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onClearFilters: () => void;
};

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
  onToggle,
  onEmployeeSelect,
  onDepartmentChange,
  onZoneChange,
  onStatusChange,
  onClearFilters
}: FilterPanelProps) {
  const filtersActive = Boolean(search.trim()) || department !== "all" || zone !== "all" || status !== "all";
  const activeFilters = [
    search.trim() ? `Search: ${search.trim()}` : null,
    department !== "all" ? `Department: ${department}` : null,
    zone !== "all" ? `Zone: ${zone}` : null,
    status !== "all" ? `Status: ${status}` : null
  ].filter(Boolean) as string[];
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
          className="relative flex min-h-11 w-full items-center justify-center rounded-full border border-white/70 bg-white/70 px-4 py-2 text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl transition hover:bg-white lg:min-h-[164px] lg:w-[48px] lg:flex-col lg:px-2 lg:py-4"
        >
          {filtersActive && (
            <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-black text-white ring-2 ring-white lg:right-auto lg:top-3">
              {activeFilters.length}
            </span>
          )}
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] lg:rotate-180 lg:[writing-mode:vertical-rl]">Filters</span>
          <span className="ml-2 text-[10px] text-slate-400 lg:ml-0 lg:mt-2 lg:rotate-180 lg:[writing-mode:vertical-rl]">
            {filtersActive ? "Active" : "Refine"}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="max-h-[55vh] w-full self-start overflow-auto overscroll-contain rounded-2xl border border-white/70 bg-white/80 p-3 shadow-[0_14px_38px_rgba(15,23,42,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl sm:max-h-[62vh] lg:sticky lg:top-[62px] lg:max-h-[calc(100vh-78px)] lg:w-[288px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-slate-900">Filters</h2>
        <div className="flex items-center gap-1">
          {filtersActive && (
            <button type="button" onClick={onClearFilters} className="rounded-md px-2 py-1 text-[11px] font-bold text-brand hover:bg-orange-50">
              Clear
            </button>
          )}
          <button type="button" onClick={onToggle} className="rounded-md px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
            Collapse
          </button>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {activeFilters.map(filter => (
            <span key={filter} className="max-w-full truncate rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-brand-dark ring-1 ring-orange-100">
              {filter}
            </span>
          ))}
        </div>
      )}

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

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">People · {employeeResults.length}</div>
          {filtersActive && <div className="text-[11px] font-semibold text-brand-dark">Filtered</div>}
        </div>
        <div className="max-h-[180px] space-y-2 overflow-auto overscroll-contain pr-1 sm:max-h-[260px]">
          {employeeResults.length ? employeeResults.map(result => {
            const selected = Boolean(result.seatId && result.seatId === selectedSeatId);

            return (
              <button
                key={result.id}
                type="button"
                disabled={!result.seatId}
                aria-current={selected ? "true" : undefined}
                onClick={() => result.seatId && onEmployeeSelect(result.seatId)}
                className={[
                  "flex w-full items-center gap-3 rounded-lg border bg-white p-2 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40 disabled:cursor-default disabled:opacity-60",
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
                  {selected ? "Selected" : result.seatLabel ?? "—"}
                </span>
              </button>
            );
          }) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              <div className="font-semibold text-slate-700">No employees match the current filters.</div>
              <div className="mt-1">Clear filters or search by seat label, employee name, position, department, or zone.</div>
              {filtersActive && (
                <button type="button" onClick={onClearFilters} className="mt-2 text-xs font-bold text-brand hover:text-brand-dark">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {statItems.map((item, index) => (
          <div key={item.label} className={["border-slate-200 px-2 py-2 text-center", index % 2 === 0 ? "border-r" : "", index < statItems.length - 2 ? "border-b" : ""].join(" ")}>
            <div className="text-sm font-black text-slate-900">{item.value}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
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
