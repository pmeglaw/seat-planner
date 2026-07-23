-- Data repair (found 2026-07-23 during the inspector review): some original
-- seats carry is_custom = true — live example: draft W08 rendered a disabled
-- "Delete custom seat" affordance while its Seat type read "Protected
-- original". The label-based protection in lib/seatProtection.ts made the
-- drift harmless (delete stayed blocked), but the flag is wrong and it is why
-- protected seats showed dead delete buttons.
--
-- Original seats are the label ranges in ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX
-- (lib/seatProtection.ts): C01-C08, CW01-CW08, E01-E08, N01-N12, NE01-NE08,
-- SE01-SE04, W01-W12. Idempotent; both layers.
update public.seats
set is_custom = false
where is_custom = true
  and upper(trim(label)) ~ '^(C0[1-8]|CW0[1-8]|E0[1-8]|N(0[1-9]|1[0-2])|NE0[1-8]|SE0[1-4]|W(0[1-9]|1[0-2]))$';
