## Summary

<!-- What does this PR do, and why? One or two sentences. -->

## Changes

<!-- Bullet the notable changes. Call out anything touching the draft/published
     split, the admin security boundary, or a Supabase migration. -->

-

## Verification

<!-- Check what you ran. For broad app changes, run all four. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`

## Notes

<!-- Migrations included? Follow-ups? Risks? Anything a reviewer should know. -->

## Brand and release checklist (when applicable)

- [ ] Theme checks include light, explicit dark, system light and system dark.
- [ ] Actual focus/hover/selected hosts pass contrast; primary fills and dark apricot borders retained.
- [ ] Login/password/loading zones checked; runtime/Phase 3 component sheets identical.
- [ ] Inspector, publish-review and Ask Planner informational notifications use brand tokens.
- [ ] Discard danger confirmation and Restore review/optional export/plain primary retained; no typed confirmation.
- [ ] Authenticated preview: roster hits, department chip/Find/canvas parity, admin overview at 1920×1080.
- [ ] Final-commit checks and fresh Codex review recorded with matching SHA.
- [ ] Department URL behavior described consistently; SEC-1 separately tracked, including existing published notes.
