# Seat Planner Improvement Loop

This folder is a developer-only QA and Codex handoff harness for Seat Planner v1.2.4.
It is intentionally repo-side tooling: no production runtime AI features, no OpenAI API usage,
no Supabase schema changes, and no new app dependencies.

## Purpose

The harness gives future Codex passes a consistent packet of project context, safety rules,
known regressions, QA coverage areas, and latest findings. The goal is to make iterative QA
work easier to repeat without changing Seat Planner behavior.

## Files

- `known-regressions.md`: Seat Planner-specific regressions that must stay visible during QA.
- `qa-matrix.json`: Lightweight coverage matrix for the main behavior surfaces.
- `latest-findings.md`: Rolling notes from the most recent QA or implementation pass.
- `generate-handoff.mjs`: Node-only generator for `output/codex_handoff.md`.
- `output/`: Generated handoff output. Keep `.gitkeep` so the directory exists.

## Generate A Handoff

Run from the repo root:

```bash
npm run qa:handoff
```

The generated file is:

```text
tools/seat-planner-improvement-loop/output/codex_handoff.md
```

## Safety Boundary

This harness must remain tooling-only. Do not add API keys, runtime AI code, browser AI
features, Supabase schema changes, auth changes, or viewer/admin route changes as part of this
loop. Use it to inform future development passes, not to alter app behavior directly.
