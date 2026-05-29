"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { askPlannerAction } from "@/app/actions";
import type { AskPlannerResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type AskPlannerDrawerProps = {
  open: boolean;
  draftDirty: boolean;
  zones: string[];
  highlightedSeatIds: string[];
  onClose: () => void;
  onHighlightSeats: (seatIds: string[]) => void;
  onClearHighlights: () => void;
  onSelectSeat: (seatId: string) => void;
};

type DrawerError = {
  title: string;
  message: string;
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
  zones,
  highlightedSeatIds,
  onClose,
  onHighlightSeats,
  onClearHighlights,
  onSelectSeat
}: AskPlannerDrawerProps) {
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AskPlannerResponse | null>(emptyResponse);
  const [error, setError] = useState<DrawerError | null>(null);
  const [pending, startTransition] = useTransition();
  const questionRef = useRef<HTMLTextAreaElement | null>(null);

  const suggestedPrompts = useMemo(() => {
    const zonePrompt = zones[0] ?? "North Pod";
    const activeHighlights = response?.highlights.filter(highlight => highlightedSeatIds.includes(highlight.seatId)) ?? [];
    const highlightLabels = activeHighlights.length > 0
      ? activeHighlights.map(highlight => highlight.label)
      : response?.highlights.map(highlight => highlight.label) ?? [];
    return [
      { label: "Which seats are open?", prompt: "Which seats are open?" },
      { label: `Open seats in ${zonePrompt}`, prompt: `Which seats are open in ${zonePrompt}?` },
      { label: "What looks unhealthy?", prompt: "What looks unhealthy on the map?" },
      { label: "Show unassigned seats", prompt: "Show unassigned seats" },
      {
        label: "Explain highlighted seats",
        prompt: highlightLabels.length > 0
          ? `Explain highlighted seats: ${highlightLabels.join(", ")}`
          : "Explain highlighted seats"
      }
    ];
  }, [highlightedSeatIds, response?.highlights, zones]);

  if (!open) return null;

  function friendlyDrawerError(message: string) {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("not configured") || lowerMessage.includes("openai_api_key")) {
      return {
        title: "Ask Planner is not configured",
        message: "Add OPENAI_API_KEY as a server-side environment variable for this environment, then redeploy."
      };
    }
    if (lowerMessage.includes("configured openai model") || lowerMessage.includes("openai_model")) {
      return {
        title: "OpenAI model unavailable",
        message: "Check OPENAI_MODEL and project model access, then try again."
      };
    }
    if (lowerMessage.includes("rate limited")) {
      return {
        title: "Ask Planner is rate limited",
        message: "OpenAI is temporarily rate limiting requests. Try again shortly."
      };
    }
    if (lowerMessage.includes("could not reach openai")) {
      return {
        title: "OpenAI is not reachable",
        message: "Ask Planner could not reach OpenAI. Try again shortly."
      };
    }
    if (lowerMessage.includes("took too long")) {
      return {
        title: "Ask Planner timed out",
        message: "Try a narrower question or try again shortly."
      };
    }
    if (lowerMessage.includes("needs a question") || lowerMessage.includes("limited to")) {
      return {
        title: "Question needs a tweak",
        message
      };
    }
    return {
      title: "Ask Planner could not answer",
      message: "Try again shortly or ask a narrower question."
    };
  }

  function choosePrompt(prompt: string) {
    setQuestion(prompt);
    setError(null);
    window.setTimeout(() => questionRef.current?.focus(), 0);
  }

  function askPlanner(prompt = question) {
    const cleanQuestion = prompt.trim();
    if (!cleanQuestion || pending) return;

    startTransition(async () => {
      try {
        setError(null);
        setResponse(null);
        onHighlightSeats([]);
        const payload = await askPlannerAction({ question: cleanQuestion });
        setResponse(payload);
        onHighlightSeats(payload.highlights.map(highlight => highlight.seatId));
      } catch (askError) {
        setResponse(null);
        onHighlightSeats([]);
        setError(friendlyDrawerError(askError instanceof Error ? askError.message : "Ask Planner could not answer."));
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
        className="fixed inset-x-3 bottom-3 z-50 flex max-h-[84vh] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.2),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[66px] sm:max-h-[calc(100vh-80px)] sm:w-[408px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ask-planner-title" className="text-base font-black">Ask Planner</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Read-only answers from saved draft map data.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">
              Close
            </button>
          </div>

          {draftDirty && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Unsaved inspector edits are not included.
            </div>
          )}
        </div>

        <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Suggested prompts</div>
            <div className="text-[11px] font-semibold text-slate-400">Saved draft only</div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestedPrompts.map(promptOption => (
              <button
                key={promptOption.label}
                type="button"
                onClick={() => choosePrompt(promptOption.prompt)}
                disabled={pending}
                className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[11px] font-bold leading-none text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {promptOption.label}
              </button>
            ))}
          </div>

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
                ref={questionRef}
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    askPlanner();
                  }
                }}
                placeholder="Ask about seats, zones, departments, or map health"
                maxLength={800}
                disabled={pending}
                className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="truncate text-[11px] font-semibold text-slate-400">{question.trim().length}/800 · Ctrl+Enter to ask</div>
              <Button type="submit" variant="primary" disabled={pending || !question.trim()} className="rounded-full px-4">
                {pending ? "Asking..." : "Ask"}
              </Button>
            </div>
          </form>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!pending && !error && !response && (
            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm leading-6 text-slate-600">
              Ask about saved draft seats, assignments, zones, departments, or map health. Ask Planner can highlight supporting seats, but it cannot change the map.
            </section>
          )}

          {pending && (
            <section role="status" aria-live="polite" className="rounded-xl border border-orange-200 bg-orange-50/80 p-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-brand" />
                <div>
                  <div className="text-sm font-black text-brand-dark">Checking saved draft map data</div>
                  <p className="mt-1 text-xs leading-5 text-orange-800">Ask Planner is using read-only lookups. No seats or assignments will be changed.</p>
                </div>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-700">
              <div className="font-black">{error.title}</div>
              <p className="mt-1 font-semibold">{error.message}</p>
            </div>
          )}

          {response && (
            <div className="space-y-3">
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
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">
                      {response.highlights.length} in answer · {highlightedSeatIds.length} on map
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearHighlights}
                    disabled={highlightedSeatIds.length === 0}
                    className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-black text-cyan-800 transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    Clear highlights
                  </button>
                </div>

                {response.highlights.length > 0 ? (
                  <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
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
                  <p className="mt-3 text-xs leading-5 text-slate-500">No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats.</p>
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
                        onClick={() => choosePrompt(followUp)}
                        className="max-w-full rounded-full bg-slate-100 px-2.5 py-1.5 text-left text-[11px] font-bold leading-none text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-100"
                      >
                        {followUp}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
