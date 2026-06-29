-- Reconcile production migration history for the double-booking force_move fix.
--
-- Production recorded version 20260629232436 when the approved
-- 20260629000100_update_draft_seat_force_move migration was applied through the
-- Supabase connector ahead of the app deploy. The actual function definition
-- remains in 20260629000100_update_draft_seat_force_move.sql.
--
-- Keep this no-op migration so Supabase's migration-history check can match the
-- remote version without manually editing the Supabase migration ledger.
select 1;
