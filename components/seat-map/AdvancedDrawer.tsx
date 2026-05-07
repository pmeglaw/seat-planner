"use client";

import type { Employee, SeatWithEmployee } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type AdvancedDrawerProps = {
  open: boolean;
  seats: SeatWithEmployee[];
  employees: Employee[];
  addSeatMode: boolean;
  pending: boolean;
  onClose: () => void;
  onStartAddSeat: () => void;
  onCancelAddSeat: () => void;
  onPublish: () => void;
};

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdvancedDrawer({
  open,
  seats,
  employees,
  addSeatMode,
  pending,
  onClose,
  onStartAddSeat,
  onCancelAddSeat,
  onPublish
}: AdvancedDrawerProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close advanced drawer"
        className="fixed inset-0 z-40 cursor-default bg-slate-950/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside className="fixed right-3 top-[68px] z-50 w-[320px] max-w-[calc(100vw-1.5rem)] rounded-3xl border border-white/70 bg-white/96 p-4 shadow-soft backdrop-blur">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Advanced</h2>
            <p className="mt-1 text-xs text-slate-500">Admin-only layout tools. Keep these out of the main map flow.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Seat tools</div>
            <div className="mt-3 flex flex-col gap-2">
              {addSeatMode ? (
                <Button type="button" variant="danger" onClick={onCancelAddSeat} disabled={pending}>Cancel Add Seat</Button>
              ) : (
                <Button type="button" variant="primary" onClick={onStartAddSeat} disabled={pending}>Add Seat</Button>
              )}
              <Button type="button" onClick={onPublish} disabled={pending}>Publish Draft Map</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Data tools</div>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => downloadJson("seat-map-export.json", { exportedAt: new Date().toISOString(), seats, employees })}
              >
                Export JSON
              </Button>
              <Button type="button" disabled title="Import will be added after server-side validation is implemented.">
                Import JSON
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Import is intentionally disabled until server-side validation is added.</p>
          </div>
        </div>
      </aside>
    </>
  );
}
