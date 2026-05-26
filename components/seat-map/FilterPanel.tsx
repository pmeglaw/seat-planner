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
  onToggle: () => void;
  onEmployeeSelect: (seatId: string) => void;
  onSearchChange: (value: string) => void;
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
  onToggle,
  onEmployeeSelect,
  onSearchChange,
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
      <aside className="self-start lg:sticky lg:top-[60px]">
        <button
          type="button"
          onClick={onToggle}
          className="relative flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.08)] transition hover:bg-white lg:min-h-[210px] lg:w-[46px] lg:flex-col lg:px-2 lg:py-3"
        >
          {filtersActive && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white lg:right-auto lg:top-3" />}
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] lg:rotate-180 lg:[writing-mode:vertical-rl]">Filters</span>
          <span className="ml-2 text-[10px] text-slate-400 lg:ml-0 lg:mt-2 lg:rotate-180 lg:[writing-mode:vertical-rl]">
            {filtersActive ? `${activeFilters.length} active` : "Search"}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="max-h-none self-start overflow-auto rounded-lg border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)] lg:sticky lg:top-[60px] lg:max-h-[calc(100vh-76px)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-slate-900">Find seats</h2>
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

      <label className="block">
        <span className="sr-only">Search employees, seats, positions, departments, and zones</span>
        <input
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search employee, seat, role..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-orange-100"
        />
      </label>

      {activeFilters.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {activeFilters.map(filter => (
            <span key={filter} className="max-w-full truncate rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold text-brand-dark ring-1 ring-orange-100">
              {filter}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
          <select
            value={department}
            onChange={event => onDepartmentChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
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
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
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
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="reserved">Reserved</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {statItems.map(item => (
          <div key={item.label} className="border-r border-slate-200 px-2 py-2 text-center last:border-r-0">
            <div className="text-sm font-black text-slate-900">{item.value}</div>
            <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{item.label}</div>
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

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">People</div>
          <div className="text-[11px] text-slate-400">{employeeResults.length}</div>
        </div>
        <div className="max-h-[230px] space-y-2 overflow-auto pr-1">
          {employeeResults.length ? employeeResults.map(result => (
            <button
              key={result.id}
              type="button"
              disabled={!result.seatId}
              onClick={() => result.seatId && onEmployeeSelect(result.seatId)}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40 disabled:cursor-default disabled:opacity-60"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                {result.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{result.name}</span>
                <span className="block truncate text-xs text-slate-500">{result.meta}</span>
              </span>
              <span className="text-[11px] font-bold text-slate-400">{result.seatLabel ?? "—"}</span>
            </button>
          )) : (
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
    </aside>
  );
}
