-- Keep Phase 2 authority-equivalent dry-run functions isolated while allowing
-- the pgcrypto digest used for payload/idempotency hashes to resolve.

alter function public.submit_hole_score_dry_run(jsonb)
  set search_path = scoring_dry_run, public, extensions, pg_temp;

alter function public.finalize_match_dry_run(jsonb)
  set search_path = scoring_dry_run, public, extensions, pg_temp;

notify pgrst, 'reload schema';
