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
  onStatusChange
}: FilterPanelProps) {
  if (collapsed) {
    return (
      <aside className="self-start lg:sticky lg:top-[60px]">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-white/80 bg-white/95 px-3 py-2 shadow-soft transition hover:bg-white lg:min-h-[210px] lg:w-[46px] lg:flex-col lg:px-2 lg:py-3"
        >
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-700 lg:rotate-180 lg:[writing-mode:vertical-rl]">Filters</span>
          <span className="ml-2 text-[10px] text-slate-400 lg:ml-0 lg:mt-2 lg:rotate-180 lg:[writing-mode:vertical-rl]">Search · Dept · Zone</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="max-h-none self-start overflow-auto rounded-2xl border border-white/75 bg-white/95 p-3 shadow-soft lg:sticky lg:top-[60px] lg:max-h-[calc(100vh-72px)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Filter Map</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Search employees, departments, zones, positions, and seats.</p>
        </div>
        <button type="button" onClick={onToggle} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
          Collapse
        </button>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Search</span>
          <input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Employee, desk, position…"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
          <select
            value={department}
            onChange={event => onDepartmentChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
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
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
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
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="reserved">Reserved</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xl font-bold text-slate-900">{stats.total}</div>
          <div className="text-xs text-slate-500">Total seats</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xl font-bold text-slate-900">{stats.assigned}</div>
          <div className="text-xs text-slate-500">Assigned</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xl font-bold text-slate-900">{stats.available}</div>
          <div className="text-xs text-slate-500">Available</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xl font-bold text-slate-900">{stats.reserved}</div>
          <div className="text-xs text-slate-500">Reserved</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Legend</div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-slate-300" />Available</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Assigned</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Reserved</div>
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />Unavailable</div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee Results</div>
          <div className="text-[11px] text-slate-400">{employeeResults.length}</div>
        </div>
        <div className="max-h-[230px] space-y-2 overflow-auto pr-1">
          {employeeResults.length ? employeeResults.map(result => (
            <button
              key={result.id}
              type="button"
              disabled={!result.seatId}
              onClick={() => result.seatId && onEmployeeSelect(result.seatId)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40 disabled:cursor-default disabled:opacity-65"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-orange-50 text-xs font-black text-orange-700 ring-1 ring-orange-100">
                {result.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{result.name}</span>
                <span className="block truncate text-xs text-slate-500">{result.meta}</span>
              </span>
              <span className="text-[11px] font-bold text-slate-400">{result.seatLabel ?? "—"}</span>
            </button>
          )) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              No employees match the current filters.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
