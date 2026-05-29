"use client";

import { useState, useTransition } from "react";
import { askPlannerAction } from "@/app/actions";
import type { AskPlannerResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type AskPlannerDrawerProps = {
  open: boolean;
  draftDirty: boolean;
  highlightedSeatIds: string[];
  onClose: () => void;
  onHighlightSeats: (seatIds: string[]) => void;
  onClearHighlights: () => void;
  onSelectSeat: (seatId: string) => void;
};

const emptyResponse: AskPlannerResponse | null = null;

function statusLabel(status: AskPlannerResponse["status"]) {
  if (status === "refused") return "Read-only";
  if (status === "needs_clarification") return "Clarify";
  return "Answered";
}

function statusClassName(status: AskPlannerResponse["status"]) {
  if (status === "refused") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "needs_clarification") return "bg-sky-50 text-sky-800 ring-sky-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export function AskPlannerDrawer({
  open,
  draftDirty,
  highlightedSeatIds,
  onClose,
  onHighlightSeats,
  onClearHighlights,
  onSelectSeat
}: AskPlannerDrawerProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AskPlannerResponse | null>(emptyResponse);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function askPlanner() {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || pending) return;

    startTransition(async () => {
      try {
        setError(null);
        const payload = await askPlannerAction({ question: cleanQuestion });
        setResponse(payload);
        onHighlightSeats(payload.highlights.map(highlight => highlight.seatId));
      } catch (askError) {
        setResponse(null);
        onHighlightSeats([]);
        setError(askError instanceof Error ? askError.message : "Ask Planner could not answer.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close Ask Planner"
        className="fixed inset-0 z-40 cursor-default bg-slate-950/22 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-planner-title"
        className="fixed inset-x-3 bottom-3 z-50 max-h-[82vh] overflow-auto rounded-2xl border border-white/70 bg-white/95 p-3 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[66px] sm:max-h-[calc(100vh-80px)] sm:w-[390px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ask-planner-title" className="text-base font-black">Ask Planner</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Saved draft map data</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        {draftDirty && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
            Unsaved inspector edits are not included.
          </div>
        )}

        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            askPlanner();
          }}
        >
          <label className="block">
            <span className="sr-only">Ask Planner question</span>
            <textarea
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="Ask about seats, zones, departments, or map health"
              maxLength={800}
              className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-orange-100"
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <div className="truncate text-[11px] font-semibold text-slate-400">{question.trim().length}/800</div>
            <Button type="submit" variant="primary" disabled={pending || !question.trim()} className="rounded-full px-4">
              {pending ? "Asking" : "Ask"}
            </Button>
          </div>
        </form>

        {error && (
          <div role="alert" className="mt-3 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {response && (
          <div className="mt-4 space-y-3">
            <section className="rounded-xl border border-slate-200 bg-white/75 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={["rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ring-1", statusClassName(response.status)].join(" ")}>
                  {statusLabel(response.status)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                  {response.confidence} confidence
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{response.answer}</p>
              {response.summary && (
                <p className="mt-3 border-t border-slate-100 pt-2 text-xs font-semibold leading-5 text-slate-500">{response.summary}</p>
              )}
            </section>

            {response.warnings.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/75 p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-amber-800">Warnings</div>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">
                  {response.warnings.map(warning => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white/75 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Highlighted seats</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-400">{highlightedSeatIds.length} active</div>
                </div>
                <button type="button" onClick={onClearHighlights} disabled={highlightedSeatIds.length === 0} className="rounded-full px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
                  Clear
                </button>
              </div>

              {response.highlights.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {response.highlights.map(highlight => (
                    <button
                      key={highlight.seatId}
                      type="button"
                      onClick={() => onSelectSeat(highlight.seatId)}
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-cyan-200 bg-cyan-50/60 p-2 text-left transition hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-100"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-950">{highlight.label}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-600">{highlight.reason}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-cyan-800 ring-1 ring-cyan-200">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-slate-500">No seats highlighted for this answer.</p>
              )}
            </section>

            {response.followUps.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white/75 p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Follow-ups</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {response.followUps.map(followUp => (
                    <button
                      key={followUp}
                      type="button"
                      onClick={() => setQuestion(followUp)}
                      className="max-w-full rounded-full bg-slate-100 px-2 py-1 text-left text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200"
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
