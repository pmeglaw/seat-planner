"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { askPlannerAction, type AskPlannerActionResult } from "@/app/actions";
import type { AskPlannerResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";

export type AskPlannerQueuedRequest = {
  id: number;
  question: string;
  seatId?: string | null;
};

type AskPlannerDrawerProps = {
  open: boolean;
  draftDirty: boolean;
  zones: string[];
  queuedRequest: AskPlannerQueuedRequest | null;
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

function isAskPlannerError(result: AskPlannerActionResult): result is { error: string } {
  return "error" in result;
}

function statusLabel(status: AskPlannerResponse["status"]) {
  if (status === "refused") return "Read-only";
  if (status === "needs_clarification") return "Clarify";
  return "Answered";
}

function statusClassName(status: AskPlannerResponse["status"]) {
  if (status === "refused") return "bg-[var(--admin-state-dirty-bg)] text-[var(--admin-state-dirty-text)] ring-[var(--admin-state-dirty-border)]";
  if (status === "needs_clarification") return "bg-[var(--admin-info-soft)] text-[var(--admin-info)] ring-[var(--admin-publish-viewer-impact-border)]";
  return "bg-[var(--admin-state-clean-bg)] text-[var(--admin-state-clean-text)] ring-[var(--admin-state-clean-border)]";
}

function friendlyDrawerError(message: string): DrawerError {
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

export function AskPlannerDrawer({
  open,
  draftDirty,
  zones,
  queuedRequest,
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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const processedQueuedRequestIdRef = useRef<number | null>(null);

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

  function choosePrompt(prompt: string) {
    setQuestion(prompt);
    setError(null);
    window.setTimeout(() => questionRef.current?.focus(), 0);
  }

  const askPlanner = useCallback((prompt = question, seatId?: string | null) => {
    const cleanQuestion = prompt.trim();
    if (!cleanQuestion || pending) return;

    startTransition(async () => {
      try {
        setError(null);
        setResponse(null);
        onHighlightSeats([]);
        const payload = await askPlannerAction({ question: cleanQuestion, seatId: seatId ?? null });
        if (isAskPlannerError(payload)) {
          setResponse(null);
          onHighlightSeats([]);
          setError(friendlyDrawerError(payload.error));
          return;
        }
        setResponse(payload);
        onHighlightSeats(payload.highlights.map(highlight => highlight.seatId));
      } catch (askError) {
        setResponse(null);
        onHighlightSeats([]);
        setError(friendlyDrawerError(askError instanceof Error ? askError.message : "Ask Planner could not answer."));
      }
    });
  }, [onHighlightSeats, pending, question]);

  useEffect(() => {
    if (!open || !queuedRequest || pending) return;
    if (processedQueuedRequestIdRef.current === queuedRequest.id) return;

    processedQueuedRequestIdRef.current = queuedRequest.id;
    setQuestion(queuedRequest.question);
    setError(null);
    askPlanner(queuedRequest.question, queuedRequest.seatId ?? null);
  }, [askPlanner, open, pending, queuedRequest]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      if (questionRef.current && !questionRef.current.disabled) {
        questionRef.current.focus();
        return;
      }

      closeButtonRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(handle);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close Ask Planner"
        aria-hidden="true"
        tabIndex={-1}
        className="fixed inset-0 z-[70] cursor-default bg-[var(--admin-chrome-bg)]/30 backdrop-blur-[1px] sm:z-40"
        onClick={onClose}
      />

      <aside
        id="ask-planner-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-planner-title"
        aria-describedby="ask-planner-description"
        className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[84vh] flex-col overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-primary)] shadow-[var(--admin-shadow-panel)] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[66px] sm:z-50 sm:max-h-[calc(100vh-80px)] sm:w-[408px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="shrink-0 border-b border-[var(--admin-border)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="ask-planner-title" className="text-base font-semibold">Ask Planner</h2>
              <p id="ask-planner-description" className="mt-1 text-xs leading-5 text-[var(--admin-text-muted)]">Read-only answers from saved draft map data.</p>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close Ask Planner" className="rounded-full px-3 py-1 text-[11px] font-medium text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
              Close
            </button>
          </div>

          {draftDirty && (
            <div className="mt-3 rounded-lg border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] px-3 py-2 text-xs font-medium text-[var(--admin-state-dirty-text)]">
              Unsaved inspector edits are not included.
            </div>
          )}
        </div>

        <div className="shrink-0 border-b border-[var(--admin-border)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-[var(--admin-text-muted)]">Suggested prompts</div>
            <div className="text-[11px] font-medium text-[var(--admin-text-subtle)]">Saved draft only</div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestedPrompts.map(promptOption => (
              <button
                key={promptOption.label}
                type="button"
                onClick={() => choosePrompt(promptOption.prompt)}
                disabled={pending}
                title={pending ? "Wait for Ask Planner to finish" : promptOption.prompt}
                className="max-w-full rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-2.5 py-1.5 text-left text-[11px] font-medium leading-none text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50"
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
                className="min-h-24 w-full resize-none rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm text-[var(--admin-text-primary)] outline-none transition placeholder:text-[var(--admin-text-subtle)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)] disabled:bg-[var(--admin-state-neutral-bg)] disabled:text-[var(--admin-text-muted)]"
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="truncate text-[11px] font-medium text-[var(--admin-text-subtle)]">{question.trim().length}/800 · Ctrl+Enter to ask</div>
              <Button type="submit" variant="primary" disabled={pending || !question.trim()} title={!question.trim() ? "Enter a question before asking" : undefined} className="rounded-full px-4">
                {pending ? "Asking..." : "Ask"}
              </Button>
            </div>
          </form>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!pending && !error && !response && (
            <section className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 text-sm leading-6 text-[var(--admin-text-secondary)]">
              Ask about saved draft seats, assignments, zones, departments, or map health. Ask Planner can highlight supporting seats, but it cannot change the map.
            </section>
          )}

          {pending && (
            <section role="status" aria-live="polite" className="rounded-xl border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] p-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-[var(--admin-primary)]" />
                <div>
                  <div className="text-sm font-semibold text-[var(--admin-primary-cta)]">Checking saved draft map data</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-text-secondary)]">Ask Planner is using read-only lookups. No seats or assignments will be changed.</p>
                </div>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-sm leading-6 text-[var(--admin-state-error-text)]">
              <div className="font-semibold">{error.title}</div>
              <p className="mt-1 font-semibold">{error.message}</p>
            </div>
          )}

          {response && (
            <div className="space-y-3">
              <section className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={["rounded-full px-2 py-1 text-[10px] font-semibold ring-1", statusClassName(response.status)].join(" ")}>
                    {statusLabel(response.status)}
                  </span>
                  <span className="rounded-full bg-[var(--admin-state-neutral-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-border)]">
                    {response.confidence} confidence
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--admin-text-secondary)]">{response.answer}</p>
                {response.summary && (
                  <p className="mt-3 border-t border-[var(--admin-border)] pt-2 text-xs font-medium leading-5 text-[var(--admin-text-muted)]">{response.summary}</p>
                )}
              </section>

              {response.warnings.length > 0 && (
                <section className="rounded-xl border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3">
                  <div className="text-[11px] font-semibold text-[var(--admin-state-dirty-text)]">Warnings</div>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--admin-state-dirty-text)]">
                    {response.warnings.map(warning => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--admin-text-muted)]">Highlighted seats</div>
                    <div className="mt-0.5 text-xs font-medium text-[var(--admin-text-muted)]">
                      {response.highlights.length} in answer · {highlightedSeatIds.length} on map
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearHighlights}
                    disabled={highlightedSeatIds.length === 0}
                    title={highlightedSeatIds.length === 0 ? "No highlighted seats to clear" : "Clear highlighted seats"}
                    className="rounded-full border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:bg-[rgba(242,110,34,0.16)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:border-[var(--admin-border)] disabled:bg-[var(--admin-state-neutral-bg)] disabled:text-[var(--admin-text-subtle)]"
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
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] p-2 text-left transition hover:bg-[rgba(242,110,34,0.16)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--admin-text-primary)]">{highlight.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[var(--admin-text-secondary)]">{highlight.reason}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-[var(--admin-surface)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-primary-cta)] ring-1 ring-[var(--admin-primary-border)]">
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-[var(--admin-text-muted)]">No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats.</p>
                )}
              </section>

              {response.followUps.length > 0 && (
                <section className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
                  <div className="text-[11px] font-semibold text-[var(--admin-text-muted)]">Follow-ups</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {response.followUps.map(followUp => (
                      <button
                        key={followUp}
                        type="button"
                        onClick={() => choosePrompt(followUp)}
                        className="max-w-full rounded-full bg-[var(--admin-state-neutral-bg)] px-2.5 py-1.5 text-left text-[11px] font-medium leading-none text-[var(--admin-text-secondary)] ring-1 ring-[var(--admin-border)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
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
