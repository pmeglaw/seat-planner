# Security & quality audits

Point-in-time reviews of this application. Each directory is a **frozen record
of what was true on that date** — findings are not edited as they get fixed, so
the audit and the remediation stay separable and a later reader can see what the
state actually was.

Open findings live as GitHub issues, not in these documents. A report tells you
what was found and why; the issue tracker tells you what is still outstanding.

## Convention: commit evidence, not the contact sheet

Screenshots go into git history permanently, so commit only the ones that
**prove something the prose cannot**:

- the route × role matrix (one per auth context, not one per route)
- security proofs — an attack rendered inert, a request refused
- before/after pairs where a number alone would not convince
- anything a reader would otherwise have to take on trust

Leave out captures that merely illustrate what the text already states. The
2026-07-28 audit committed 50 images (~18 MB) where roughly 8 (~3 MB) carried
the evidentiary weight; the rest were working artefacts from driving the app.

This is a forward-looking cap, not a criticism of what is already here. The
repository is around 294 MB and comfortably inside GitHub's ~1 GB soft limit,
and committed QA screenshots long predate these audits. But binaries only ever
accumulate, and audits are the kind of thing that recurs.

Existing directories are deliberately left alone: reclaiming their space would
mean rewriting history, which breaks every clone and invalidates references in
merged PRs — a bad trade for a few megabytes.

If a run genuinely produces a large set worth keeping, keep it outside the
repository and link to it from the report.

| Date | Scope | Overall | Notes |
| --- | --- | --- | --- |
| [2026-07-28](2026-07-28/REVIEW.md) | Full app: security, UX, performance, code quality, infrastructure | **B−** | Independent pass at commit `f32721b`. Verified against a local Supabase stack; no production data touched. Screenshots are synthetic except `prod-csp-login-verified.png`, which is the anonymous login page. |

## Reading the 2026-07-28 report

The executive summary carries a status table showing which findings have since
been fixed (SEC-01, PERF-01), partly fixed (SEC-02, PERF-02) or accepted
(SEC-03). Grades are deliberately **not** restated as fixes land.

Two findings were later corrected by evidence rather than closed by fiat, and
both corrections are recorded inline in the finding itself:

- **SEC-02** — production was confirmed serving the session cookie *without*
  `Secure`, which the review had listed as unverified. Worse than assumed.
- **SEC-03** — the review claimed viewers received colleague email they never
  saw. Wrong: the viewer deliberately renders it in the seat Contact panel, so
  the proposed one-line fix would have deleted a working feature.
