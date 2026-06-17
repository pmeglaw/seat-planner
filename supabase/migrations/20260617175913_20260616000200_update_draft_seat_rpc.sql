-- Reconcile production migration history for PR #32.
--
-- Production recorded version 20260617175913 when the approved
-- 20260616000200_update_draft_seat_rpc migration was applied through the
-- Supabase connector before the app code was merged. The actual RPC definition
-- remains in 20260616000200_update_draft_seat_rpc.sql.
--
-- Keep this no-op migration so Supabase's migration-history check can match the
-- remote version without manually editing the Supabase migration ledger.
select 1;
