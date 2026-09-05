"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { askPlannerAction, type AskPlannerActionError, type AskPlannerActionResult } from "@/app/actions";
import type { AskPlannerResponse } from "@/lib/types";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { shortcutHint } from "@/lib/platformShortcut";

// Ask Planner in the 400 right slot (PHASE3DS §1.18, Phase 4 PR 3b; P2-9
// 408 → 400). Carbon for AI, as ruled: the "AI" label is the marker AND the
// entry to explainability (a popover: what it reads, what it never changes,
// where to learn more), and the textarea's border carries the gradient —
// nothing else. No aura, no glow, no ring. Read-only, always: the drawer asks
// and highlights, it never mutates the map.
//
// One error component, SEVEN strings (the specimen's `#ask` table — each
// ends in the next step): role="alert" for the five failures that stop the
// task, role="status" for question-too-long and the fallback.

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
  /** "Floor 2" for a highlighted seat that is NOT on the canvas floor
   *  (multi-floor PR-3): selecting it switches the canvas, so the row says
   *  so before the click. Absent or undefined for same-floor seats. */
  floorTagForSeat?: (seatId: string) => string | null | undefined;
  onClose: () => void;
  onHighlightSeats: (seatIds: string[]) => void;
  onClearHighlights: () => void;
  onSelectSeat: (seatId: string) => void;
  /** Opens the shell's Help panel (the popover's "How Ask Planner works" link). */
  onOpenHelp?: () => void;
};

export type DrawerError = {
  title: string;
  message: string;
  /** alert = the failure stops the task; status = the admin can act on it in place. */
  role: "alert" | "status";
  retryable: boolean;
};

const emptyResponse: AskPlannerResponse | null = null;
const QUESTION_MAX = 800;

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

// The seven strings (PHASE3DS §1.18, owner ruling). Structured codes first
// (the STALE_DRAFT pattern): the app's own throttle arrives as code
// "RATE_LIMITED", never matched from message text.
export function friendlyDrawerError(message: string, code?: "RATE_LIMITED"): DrawerError {
  const lowerMessage = message.toLowerCase();
  if (code === "RATE_LIMITED" || lowerMessage.includes("rate limited")) {
    return { title: "Ask Planner is rate limited right now", message: "Try again in a minute.", role: "alert", retryable: true };
  }
  if (lowerMessage.includes("not configured") || lowerMessage.includes("openai_api_key")) {
    return { title: "Ask Planner is not set up on this server", message: "Ask the office manager.", role: "alert", retryable: false };
  }
  if (lowerMessage.includes("configured openai model") || lowerMessage.includes("openai_model")) {
    return { title: "The configured model isn't available", message: "Ask the office manager.", role: "alert", retryable: false };
  }
  if (lowerMessage.includes("could not reach openai")) {
    return { title: "Ask Planner couldn't reach the planner service", message: "Try again.", role: "alert", retryable: true };
  }
  if (lowerMessage.includes("took too long")) {
    return { title: "The planner service timed out", message: "Try again, or ask something shorter.", role: "alert", retryable: true };
  }
  if (lowerMessage.includes("limited to")) {
    return { title: `That question is over ${QUESTION_MAX} characters`, message: "Ask something shorter.", role: "status", retryable: false };
  }
  return {
    title: "Ask Planner couldn't answer that",
    message: "Try rephrasing, or ask about a zone, department, or person.",
    role: "status",
    retryable: false
  };
}

export function AskPlannerDrawer({
  open,
  draftDirty,
  zones,
  queuedRequest,
  highlightedSeatIds,
  onClose,
  floorTagForSeat,
  onHighlightSeats,
  onClearHighlights,
  onSelectSeat,
  onOpenHelp
}: AskPlannerDrawerProps) {
  const [question, setQuestion] = useState("");
  const [submitShortcutHint, setSubmitShortcutHint] = useState("Ctrl+Enter");
  const [response, setResponse] = useState<AskPlannerResponse | null>(emptyResponse);
  // Platform-adaptive hint, set a frame after mount so server markup never
  // guesses the platform (matches the search field's hint pattern).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSubmitShortcutHint(shortcutHint(window.navigator.platform, "Enter").replace(" ", "+"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [error, setError] = useState<DrawerError | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  // The explainability popover, closed by default and re-closed for every new
  // answer — leaving it open would attach one answer's explanation to the next.
  const [explainOpen, setExplainOpen] = useState(false);
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
        setLastQuestion(cleanQuestion);
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

  function clearDrawer() {
    setQuestion("");
    setError(null);
    setResponse(null);
    setExplainOpen(false);
    onClearHighlights();
    window.setTimeout(() => questionRef.current?.focus(), 0);
  }

  if (!open) return null;

  const visibleWarnings = response?.warnings.filter(warning => warning !== BROAD_ANSWER_EMPTY_HIGHLIGHT_WARNING) ?? [];
  const broadAnswerWithoutHighlights = Boolean(response && response.highlights.length === 0);

  return (
    <aside
      tabIndex={-1}
      id="ask-planner-drawer"
      aria-labelledby="ask-planner-title"
      aria-describedby="ask-planner-description"
      // The slot itself (RightSlot's host owns presence and the slide): a
      // side panel, not a modal — the map stays usable beside it, Escape
      // closes it through the surface's ladder, focus returns to the row's
      // trigger (SeatMap).
      className="sp-slot max-w-full"
    >
      <div className="sp-slot-header">
        <div className="min-w-0">
          <div className="sp-slot-eyebrow flex items-center gap-3">
            {/* The AI label sits WITH the title, not in a corner: a user must
                never read AI output without first seeing what produced it. It
                is the entry to explainability — a popover, not a tooltip, so
                keyboard and touch users get it too. */}
            <span className="sp-ai-popover-host" data-open={explainOpen ? "" : undefined}>
              <button
                type="button"
                className="sp-ai-label"
                onClick={() => setExplainOpen(current => !current)}
                aria-expanded={explainOpen}
                aria-controls="ask-planner-explain"
                aria-label="AI — how Ask Planner answers"
              >
                AI
              </button>
              <div id="ask-planner-explain" className="sp-ai-popover" role="note" aria-label="About AI answers" hidden={!explainOpen}>
                <h4>Generated answers</h4>
                <p>Ask Planner reads the saved draft map — seats, directory, zones — and answers in text. It cannot change seats, people, or the published map; unsaved inspector edits are excluded.</p>
                <p>Highlights on the plan are the seats the answer names. Sources: draft seats · directory. Every answer states its confidence.</p>
                {onOpenHelp ? (
                  <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={onOpenHelp}>How Ask Planner works</button>
                ) : null}
              </div>
            </span>
            read-only answers
          </div>
          <h2 id="ask-planner-title" className="sp-slot-title">Ask Planner</h2>
        </div>
        <div className="sp-slot-actions">
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close Ask Planner" className="cds-btn cds-btn--icon cds-btn--md cds-touch-target">
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="sp-slot-body">
        <div id="ask-planner-description" className="sp-drawer-subline">Read-only answers from saved draft map data.</div>

        {draftDirty && (
          <div className="cds-notification cds-notification--warning mt-3" role="status">
            <NotificationGlyph kind="warning" />
            <div className="cds-notification-text">
              <strong>Unsaved seat edits</strong>
              <p>Answers use the saved draft, not the edits open in the inspector.</p>
            </div>
          </div>
        )}

        <div className="sp-slot-section">Suggested</div>
        <div className="sp-prompt-list">
          {suggestedPrompts.map(promptOption => (
            <button
              key={promptOption.label}
              type="button"
              className="cds-btn cds-btn--ghost"
              onClick={() => choosePrompt(promptOption.prompt)}
              disabled={pending}
              title={pending ? "Wait for Ask Planner to finish" : promptOption.prompt}
            >
              {promptOption.label}
            </button>
          ))}
        </div>

        <form
          id="ask-planner-form"
          onSubmit={event => {
            event.preventDefault();
            askPlanner();
          }}
        >
          <div className="cds-form-item">
            <label htmlFor="ask-planner-question">Ask Planner question</label>
            <textarea
              id="ask-planner-question"
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
              maxLength={QUESTION_MAX}
              disabled={pending}
              className="sp-textarea sp-textarea--ai w-full"
            />
            <div className="sp-field-counter">
              <span>{submitShortcutHint} to ask</span>
              <span>{question.trim().length} / {QUESTION_MAX}</span>
            </div>
          </div>
        </form>

        {!pending && !error && !response && (
          <p className="sp-drawer-subline mt-3">
            Ask about seats, assignments, zones, or departments. Ask Planner can highlight supporting seats, but it cannot change the map.
          </p>
        )}

        {pending && (
          <div className="sp-drawer-loading mt-3" role="status" aria-live="polite" aria-busy="true">
            <span className="sp-skeleton" aria-hidden="true" />
            <span>Checking saved draft map data</span>
          </div>
        )}

        {error && (
          <div className={`cds-notification cds-notification--${error.role === "alert" ? "error" : "info"} mt-3`} role={error.role}>
            <NotificationGlyph kind={error.role === "alert" ? "error" : "info"} />
            <div className="cds-notification-text">
              <strong>{error.title}</strong>
              <p>{error.message}</p>
            </div>
            {error.retryable && lastQuestion ? (
              <button type="button" className="cds-btn cds-btn--ghost" onClick={() => askPlanner(lastQuestion)} disabled={pending}>Retry</button>
            ) : null}
          </div>
        )}

        {response && (
          <>
            <div className="sp-answer">
              <p className="whitespace-pre-wrap">{response.answer}</p>
              {response.summary && <p className="sp-drawer-subline mt-3">{response.summary}</p>}
              <p className="sp-drawer-subline mt-2">{statusLabel(response.status)} · {response.confidence} confidence · Sources: draft seats · directory</p>
            </div>

            {visibleWarnings.map(warning => (
              <div key={warning} className="cds-notification cds-notification--warning" role="status">
                <NotificationGlyph kind="warning" />
                <div className="cds-notification-text">{warning}</div>
              </div>
            ))}

            <div className="sp-slot-section">Highlighted seats · {response.highlights.length} in answer · {highlightedSeatIds.length} on map</div>
            {response.highlights.length > 0 ? (
              <ul className="sp-highlight-list">
                {response.highlights.map(highlight => (
                  <li key={highlight.seatId}>
                    <button
                      type="button"
                      className="cds-btn cds-btn--ghost cds-btn--sm min-w-0"
                      onClick={() => onSelectSeat(highlight.seatId)}
                      title={highlight.reason}
                      aria-label={`Select ${highlight.label}${floorTagForSeat?.(highlight.seatId) ? ` on ${floorTagForSeat(highlight.seatId)}` : ""}: ${highlight.reason}`}
                    >
                      <span className="sp-palette-code" translate="no">{highlight.label}</span>
                      <span className="min-w-0 truncate">{highlight.reason}</span>
                    </button>
                    {floorTagForSeat?.(highlight.seatId) ? <span className="sp-highlight-floor">{floorTagForSeat(highlight.seatId)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {broadAnswerWithoutHighlights && (
              <div className="cds-notification cds-notification--info" role="status">
                <NotificationGlyph kind="info" />
                <div className="cds-notification-text">No seats highlighted for this broad answer — ask about a zone, a department, or a person to see seats on the plan.</div>
              </div>
            )}
            <button
              type="button"
              className="cds-btn cds-btn--ghost cds-btn--md mt-3"
              onClick={onClearHighlights}
              disabled={highlightedSeatIds.length === 0}
              title={highlightedSeatIds.length === 0 ? "No highlighted seats to clear" : "Clear highlighted seats"}
            >
              Clear highlights
            </button>

            {response.followUps.length > 0 && (
              <>
                <div className="sp-slot-section">Follow-ups</div>
                <div className="sp-prompt-list">
                  {response.followUps.map(followUp => (
                    <button
                      key={followUp}
                      type="button"
                      className="cds-btn cds-btn--ghost"
                      onClick={() => askFollowUp(followUp)}
                      disabled={pending}
                      title={pending ? "Wait for Ask Planner to finish" : followUp}
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* The drawer's Ask is this container's own primary (a side panel is its
          own container, PHASE2UX §3) — it never competes with Publish in the row. */}
      <div className="sp-commit-bar">
        <button type="button" className="cds-btn cds-btn--ghost" onClick={clearDrawer} disabled={pending || (!question && !response && !error)}>
          Clear
        </button>
        <button
          type="submit"
          form="ask-planner-form"
          className="cds-btn cds-btn--primary"
          disabled={pending || !question.trim()}
          aria-busy={pending || undefined}
          title={!question.trim() ? "Enter a question before asking" : undefined}
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </div>
    </aside>
  );
}
