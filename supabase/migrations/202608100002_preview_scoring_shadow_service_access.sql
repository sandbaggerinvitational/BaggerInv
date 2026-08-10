-- Phase 1 server-only diagnostics access.
-- Score/match writes and scoped rebuild deletion remain restricted to the
-- security-definer RPCs created by 202608100001.

grant select on table public.score_mirror_events to service_role;
grant select on table public.hole_score_mirror to service_role;
grant select on table public.live_match_mirror to service_role;
grant select, insert on table public.mirror_reconciliation_runs to service_role;

revoke all on table public.score_mirror_events from anon, authenticated;
revoke all on table public.hole_score_mirror from anon, authenticated;
revoke all on table public.live_match_mirror from anon, authenticated;
revoke all on table public.mirror_reconciliation_runs from anon, authenticated;
