# Phase 5 PR 4 — read-only preview walk (#528)

**Provenance, read this first.** The reviewer's brief asked for a headed walk on the #528 Vercel preview with the
owner signing in by hand. The preview sits behind Vercel Authentication and the owner was not at the keyboard
(2026-09-10), so the walk was done in two halves, neither of which is a hand sign-in on the preview:

1. **The deployed artifact is the PR head.** Through a Vercel share link (`get_access_to_vercel_url`, expires in
   23 h), the preview's ungated `/api/build-id` returned `e890aac0e662090e867db48981b64c02f2ebd0d7` — the branch head
   — and its served stylesheets carry the change (`preview-artifact.txt`): `--sp-recep-row-locked:#fbe8dc` (light),
   `--sp-recep-row-locked:#525252` ×2 and `--sp-recep-row-bar:#e8a07a` ×2 (the two dark blocks), and
   `.sp-recep-readout{…gap:var(--sp-space-06)}` (amendment K).
2. **The five steps ran against a local `next build` of that same commit** (`e890aac`), served on :3300 against the
   LOCAL Docker stack with the seeded viewer, headless real Chrome (`channel: "chrome"`), by
   `docs/redesign-v2/phase5/audit/pr4-preview-walk.mjs`. The captures here are from that build, **not** from the
   Vercel preview; the Vercel build is the same commit and the same CSS (half 1), but a walk on the preview itself
   still needs the owner's sign-in — the script's no-credentials mode does exactly that when the owner is present.

```
node docs/redesign-v2/phase5/audit/pr4-preview-walk.mjs http://localhost:3300 docs/redesign-v2/phase5/screenshots/phase5-pr4-preview e2e-viewer@example.test <seeded password>
```

**18/18 pass** (`results.json`), 1920 and 640 × light and dark.

| step | 1920 light | 640 light | 1920 dark | 640 dark |
|---|---|---|---|---|
| 1 header / locked / cursor three surfaces at EXPECT | 224 · 251,232,220 · 232 ✓ | ✓ | 57 · 82 · 51 ✓ | ✓ |
| 2 hover the locked row: unchanged | ✓ | ✓ | ✓ | ✓ |
| 3 bar | rgb(184, 92, 46) ✓ | ✓ | rgb(232, 160, 122) ✓ | ✓ |
| 4 narrow: locked row hittable under the pinned band | — | ✓ | — | ✓ |
| 5 band→tail · tail→recents | 24.00 · 24.00 ✓ | — | 24.00 · 24.00 ✓ | — |

| file | what |
|---|---|
| `01-header-locked-cursor-3x-<w>-<theme>.png` | 3x crop: count header, locked row 1, keyboard-cursor row (step 1) |
| `01-locked-cursor-<w>-<theme>.png` | 1x viewport of the same state |
| `02-locked-hovered-3x-<w>-<theme>.png` | 3x crop with the pointer on the locked row (step 2) |
| `04-locked-under-band-640-<theme>.png` | 1x, the locked row under the pinned band (step 4) |
| `05-readout-1920-<theme>.png` | 1x, the wide readout column: band, 24, tail, 24, recents (step 5) |
| `preview-artifact.txt` | the share-link fetch: build id + the CSS grep lines from the Vercel preview |
