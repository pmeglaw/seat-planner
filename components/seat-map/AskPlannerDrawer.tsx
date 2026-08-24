"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { askPlannerAction, type AskPlannerActionError, type AskPlannerActionResult } from "@/app/actions";
import type { AskPlannerResponse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

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

// Mirrors the server-side constant in lib/mapOperationsAgent.ts (client filter
// only — do not import it, tests/map-operations-agent.test.mjs:894 pins a
// truncated variant of the server string).
const BROAD_ANSWER_EMPTY_HIGHLIGHT_WARNING =
  "No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats.";

function isAskPlannerError(result: AskPlannerActionResult): result is AskPlannerActionError {
  return "error" in result;
}

function statusLabel(status: AskPlannerResponse["status"]) {
  if (status === "refused") return "Read-only";
  if (status === "needs_clarification") return "Clarify";
  return "Answered";
}

function statusClassName(status: AskPlannerResponse["status"]) {
  // Dark-panel state pills (contrast on #161616: #42be65 ≈ 7.3:1, #08bdba ≈ 7.2:1, #78a9ff ≈ 6.6:1).
  if (status === "refused") return "bg-[color-mix(in_srgb,var(--sp-status-pending-mark)_15%,transparent)] text-[var(--sp-status-pending-text)] ring-[color-mix(in_srgb,var(--sp-status-pending-mark)_40%,transparent)]";
  if (status === "needs_clarification") return "bg-[color-mix(in_srgb,var(--sp-chrome-info)_15%,transparent)] text-[var(--sp-chrome-info-text)] ring-[color-mix(in_srgb,var(--sp-chrome-info)_40%,transparent)]";
  // Success wash/ring derive from the chrome success token (this panel is dark
  // chrome in BOTH themes) — the retired --admin-status-ok-rgb twin held the
  // stale #24A148 here, and the light status hex #1D6E41 is tuned for light
  // surfaces (a 40% ring of it on #161616 is near-invisible, ~1.3:1).
  return "bg-[color-mix(in_srgb,var(--sp-status-success-text)_15%,transparent)] text-[var(--sp-status-success-text)] ring-[color-mix(in_srgb,var(--sp-status-success-text)_40%,transparent)]";
}

function friendlyDrawerError(message: string, code?: "RATE_LIMITED"): DrawerError {
  // Structured codes first (the STALE_DRAFT pattern): the app's own throttle
  // arrives as code: "RATE_LIMITED", never matched from message text — the
  // server copy can be reworded without silently landing in the OpenAI
  // rate-limit branch below.
  if (code === "RATE_LIMITED") {
    return {
      title: "Ask Planner needs a short break",
      message
    };
  }
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
  const [submitShortcutHint, setSubmitShortcutHint] = useState("Ctrl+Enter");
  const [response, setResponse] = useState<AskPlannerResponse | null>(emptyResponse);
  // Platform-adaptive hint, set a frame after mount so server markup never
  // guesses the platform (matches the chrome search hint pattern).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (/mac/i.test(window.navigator.platform)) setSubmitShortcutHint("⌘+Enter");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [error, setError] = useState<DrawerError | null>(null);
  // Provenance disclosure, collapsed by default and re-collapsed for every new
  // answer — leaving it open would attach one answer's explanation to the next.
  const [explainOpen, setExplainOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  // Tab trap only — the drawer's own effect still moves initial focus to the
  // question field (it runs after this ref callback, so it wins).
  const drawerDialogFocusRef = useDialogFocus<HTMLElement>();
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
      { label: "Any problems on the map?", prompt: "Are there any seating problems or conflicts on the map?" },
      { label: "Show unassigned seats", prompt: "Show unassigned seats" },
      {
        label: "Explain highlighted seats",
        prompt: highlightLabels.length > 0
          ? `Explain highlighted seats: ${highlightLabels.join(", ")}`
          : "Explain highlighted seats"
      }
    ];
  }, [highlightedSeatIds, response?.highlights, zones]);

  // Staging only — a suggested prompt is a starting point the admin is meant to
  // edit, and every ask spends a model call, so it never submits by itself.
  function choosePrompt(prompt: string) {
    setQuestion(prompt);
    setError(null);
    window.setTimeout(() => questionRef.current?.focus(), 0);
  }

  // A follow-up is different: it sits under a finished answer, already phrased
  // as the next question, so filling a box the admin must then click Ask on is
  // a step that means nothing. Show it in the box for the record, and ask it.
  function askFollowUp(prompt: string) {
    setQuestion(prompt);
    setError(null);
    askPlanner(prompt);
  }

  const askPlanner = useCallback((prompt = question, seatId?: string | null) => {
    const cleanQuestion = prompt.trim();
    if (!cleanQuestion || pending) return;

    startTransition(async () => {
      try {
        setError(null);
        setResponse(null);
        setExplainOpen(false);
        onHighlightSeats([]);
        const payload = await askPlannerAction({ question: cleanQuestion, seatId: seatId ?? null });
        if (isAskPlannerError(payload)) {
          setResponse(null);
          onHighlightSeats([]);
          setError(friendlyDrawerError(payload.error, payload.code));
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
        className="fixed inset-0 z-[70] cursor-default bg-[color-mix(in_srgb,var(--sp-background)_30%,transparent)] backdrop-blur-[1px] motion-safe:animate-[sp-fade-in_180ms_ease-out] sm:z-50"
        onClick={onClose}
      />

      {/* Carbon for AI gives an AI surface its own luminance: the panel edge
          shifts to AI blue and a glow falls from the top edge, so the drawer
          reads as a different KIND of surface than the chrome around it. That
          legibility is the point — AI blue appears here and nowhere non-AI. */}
      <aside
        ref={drawerDialogFocusRef}
        tabIndex={-1}
        id="ask-planner-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-planner-title"
        aria-describedby="ask-planner-description"
        data-chrome="dark"
        className="sp-zone-chrome fixed inset-x-3 bottom-3 z-[80] flex max-h-[84vh] flex-col overflow-hidden border border-[var(--sp-ai-panel-border)] bg-[var(--sp-background)] bg-[image:var(--sp-ai-glow)] bg-no-repeat text-[var(--sp-text-primary)] shadow-panel focus-visible:outline-none motion-safe:animate-[sp-panel-in_220ms_cubic-bezier(0.2,0,0,1)] sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[calc(var(--sp-chrome-height)_+_12px)] sm:z-50 sm:max-h-[calc(100vh_-_var(--sp-chrome-height)_-_20px)] sm:w-[408px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="shrink-0 border-b border-[var(--sp-border-subtle)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* The AI label sits WITH the title, not in a corner: Carbon for
                  AI asks that a user never read AI output without first seeing
                  what produced it. aria-hidden because the heading text and the
                  disclosure below already carry that fact for screen readers,
                  and a bare "AI" would just interrupt the title. */}
              <h2 id="ask-planner-title" className="flex items-center gap-2 text-base font-semibold">
                Ask Planner
                <span aria-hidden="true" className="border border-[var(--sp-ai-chrome-border)] px-[5px] py-px text-[10px] font-bold tracking-[0.04em] text-[var(--sp-ai-chrome-text)]">AI</span>
              </h2>
              <p id="ask-planner-description" className="mt-1 text-xs leading-5 text-[var(--sp-text-helper)]">Read-only answers from saved draft map data.</p>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close Ask Planner" className="rounded-full px-3 py-1 text-[11px] font-medium text-[var(--sp-text-helper)] transition hover:bg-white/10 hover:text-[var(--sp-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
              Close
            </button>
          </div>

          {draftDirty && (
            <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--sp-status-pending-mark)_40%,transparent)] bg-[color-mix(in_srgb,var(--sp-status-pending-mark)_10%,transparent)] px-3 py-2 text-xs font-medium text-[var(--sp-status-pending-text)]">
              Unsaved inspector edits are not included.
            </div>
          )}
        </div>

        <div className="shrink-0 border-b border-[var(--sp-border-subtle)] px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-[var(--sp-text-helper)]">Suggested prompts</div>
            <div className="text-[11px] font-medium text-[var(--sp-text-helper)]">Saved draft only</div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestedPrompts.map(promptOption => (
              <button
                key={promptOption.label}
                type="button"
                onClick={() => choosePrompt(promptOption.prompt)}
                disabled={pending}
                title={pending ? "Wait for Ask Planner to finish" : promptOption.prompt}
                className="max-w-full rounded-full border border-[var(--sp-border-subtle)] bg-[var(--sp-field)] px-2.5 py-1.5 text-left text-[11px] font-medium leading-none text-[var(--sp-text-secondary)] transition hover:-translate-y-px hover:border-[var(--sp-brand)] hover:bg-[var(--sp-background-hover)] hover:text-white hover:shadow-elevation-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:hover:translate-y-0"
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
                name="askPlannerQuestion"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                onKeyDown={event => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    askPlanner();
                  }
                }}
                placeholder="Ask about seats, zones, departments, or assignments…"
                maxLength={800}
                disabled={pending}
                className="min-h-24 w-full resize-none rounded-xl border border-white/15 bg-[var(--sp-field)] px-3 py-2 text-sm text-[var(--sp-text-primary)] outline-none transition placeholder:text-[var(--sp-text-helper)] focus:border-[var(--sp-brand)] focus:ring-2 focus:ring-[color:var(--sp-brand)] disabled:bg-white/5 disabled:text-[var(--sp-text-helper)]"
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <div className="truncate text-[11px] font-medium text-[var(--sp-text-helper)]">{question.trim().length}/800 · {submitShortcutHint} to ask</div>
              <Button type="submit" variant="primary" disabled={pending || !question.trim()} title={!question.trim() ? "Enter a question before asking" : undefined} className="rounded-full px-4">
                {pending ? "Asking…" : "Ask"}
              </Button>
            </div>
          </form>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {!pending && !error && !response && (
            <section className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-field)] p-3 text-sm leading-6 text-[var(--sp-text-secondary)]">
              Ask about seats, assignments, zones, or departments. Ask Planner can highlight supporting seats, but it cannot change the map.
            </section>
          )}

          {/* Thinking is AI presence, so it wears AI blue. It used to borrow
              the firm's orange, which read as an ordinary app-busy state. */}
          {pending && (
            <section role="status" aria-live="polite" className="rounded-xl border border-[var(--sp-ai-panel-border)] bg-[var(--sp-ai-row)] p-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 motion-safe:animate-pulse rounded-full bg-[var(--sp-ai-chrome-text)]" />
                <div>
                  <div className="text-sm font-semibold text-[var(--sp-ai-chrome-text)]">Checking saved draft map data</div>
                  <p className="mt-1 text-xs leading-5 text-[var(--sp-text-secondary)]">Ask Planner is using read-only lookups. No seats or assignments will be changed.</p>
                </div>
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--sp-status-danger-text)_40%,transparent)] bg-[color-mix(in_srgb,var(--sp-status-danger-strong)_10%,transparent)] p-3 text-sm leading-6 text-[var(--sp-status-danger-text)]">
              <div className="font-semibold">{error.title}</div>
              <p className="mt-1 font-semibold">{error.message}</p>
            </div>
          )}

          {response && (
            <div className="space-y-3">
              {/* The answer itself sits on the luminous AI layer, so generated
                  text is never mistaken for the app's own stated facts. */}
              <section className="rounded-xl border border-[var(--sp-ai-panel-border)] bg-[image:var(--sp-ai-aura)] bg-[var(--sp-background-hover)] bg-no-repeat p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={["rounded-full px-2 py-1 text-[10px] font-semibold ring-1", statusClassName(response.status)].join(" ")}>
                    {statusLabel(response.status)}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-[var(--sp-text-helper)] ring-1 ring-[var(--sp-border-subtle)]">
                    {response.confidence} confidence
                  </span>
                  {/* Carbon for AI requires the provenance of an answer to be
                      reachable from the answer — a disclosure button, not a
                      tooltip, so keyboard and touch users get it too. */}
                  <button
                    type="button"
                    onClick={() => setExplainOpen(current => !current)}
                    aria-expanded={explainOpen}
                    aria-controls="ask-planner-explain"
                    className="ml-auto border border-[var(--sp-ai-chrome-border)] px-[5px] py-px text-[10px] font-bold tracking-[0.04em] text-[var(--sp-ai-chrome-text)] transition hover:bg-[var(--sp-ai-row)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
                  >
                    AI {explainOpen ? "▴" : "▾"}
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--sp-text-secondary)]">{response.answer}</p>
                {response.summary && (
                  <p className="mt-3 border-t border-[var(--sp-border-subtle)] pt-2 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">{response.summary}</p>
                )}

                {explainOpen && (
                  <div id="ask-planner-explain" className="mt-3 border border-[color-mix(in_srgb,var(--sp-ai-border)_40%,transparent)] bg-[var(--sp-background)] p-3">
                    <div className="text-[11.5px] font-semibold text-[var(--sp-ai-chrome-text)]">How this answer was made</div>
                    <p className="mt-1.5 text-xs leading-5 text-[var(--sp-text-secondary)]">
                      Generated from the <b className="font-semibold text-[var(--sp-text-primary)]">saved draft layer only</b> — seats, directory, zones. The model reads the map; it cannot modify it. Unsaved inspector edits are excluded.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--sp-text-secondary)]">Sources: draft seats · directory</span>
                      <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", statusClassName(response.status)].join(" ")}>
                        {response.confidence} confidence
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {(() => {
                const visibleWarnings = response.warnings.filter(w => w !== BROAD_ANSWER_EMPTY_HIGHLIGHT_WARNING);
                return visibleWarnings.length > 0 && (
                  <section className="rounded-xl border border-[color-mix(in_srgb,var(--sp-status-pending-mark)_40%,transparent)] bg-[color-mix(in_srgb,var(--sp-status-pending-mark)_10%,transparent)] p-3">
                    <div className="text-[11px] font-semibold text-[var(--sp-status-pending-text)]">Warnings</div>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--sp-status-pending-text)]">
                      {visibleWarnings.map(warning => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                );
              })()}

              <section className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-background-hover)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold text-[var(--sp-text-helper)]">Highlighted seats</div>
                    <div className="mt-0.5 text-xs font-medium text-[var(--sp-text-helper)]">
                      {response.highlights.length} in answer · {highlightedSeatIds.length} on map
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearHighlights}
                    disabled={highlightedSeatIds.length === 0}
                    title={highlightedSeatIds.length === 0 ? "No highlighted seats to clear" : "Clear highlighted seats"}
                    className="rounded-full border border-[color-mix(in_srgb,var(--sp-brand)_50%,transparent)] bg-[color-mix(in_srgb,var(--sp-brand)_10%,transparent)] px-3 py-1.5 text-[11px] font-semibold text-[var(--sp-brand)] transition hover:bg-[color-mix(in_srgb,var(--sp-brand)_20%,transparent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:border-[var(--sp-border-subtle)] disabled:bg-white/10 disabled:text-[var(--sp-text-helper)]"
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
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-[var(--sp-ai-panel-border)] bg-[var(--sp-ai-row)] p-2 text-left transition hover:bg-[color-mix(in_srgb,var(--sp-ai-border)_16%,transparent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--sp-text-primary)]">{highlight.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-[var(--sp-text-secondary)]">{highlight.reason}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-[var(--sp-ai-chrome-text)] ring-1 ring-white/15">
                          Select
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-[var(--sp-text-helper)]">Broad answers don&apos;t highlight seats — ask about a specific zone or department to see them on the map.</p>
                )}
              </section>

              {response.followUps.length > 0 && (
                <section className="rounded-xl border border-[var(--sp-border-subtle)] bg-[var(--sp-background-hover)] p-3">
                  <div className="text-[11px] font-semibold text-[var(--sp-text-helper)]">Follow-ups</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {response.followUps.map(followUp => (
                      <button
                        key={followUp}
                        type="button"
                        onClick={() => askFollowUp(followUp)}
                        disabled={pending}
                        title={pending ? "Wait for Ask Planner to finish" : followUp}
                        className="max-w-full rounded-full bg-white/10 px-2.5 py-1.5 text-left text-[11px] font-medium leading-none text-[var(--sp-text-secondary)] ring-1 ring-[var(--sp-border-subtle)] transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-50"
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
