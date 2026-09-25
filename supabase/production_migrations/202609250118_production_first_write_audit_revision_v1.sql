-- First canonical write is observational evidence, not a release/activation transition.
-- Preserve exact activation guards and the first-write rollback safety latch.
-- Function replacement changes no canonical data and grants no new authority.
CREATE OR REPLACE FUNCTION production_control.capture_first_production_canonical_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'production_control', 'scoring_authority'
AS $function$
declare
  target_tournament text;
  activation production_control.cutover_activation_state%rowtype;
begin
  select tournament_id into target_tournament
  from scoring_authority.matches
  where match_id = new.match_id;
  if target_tournament <> '2026' then return new; end if;

  select * into strict activation
  from production_control.cutover_activation_state
  where scope_key = 'BAGGER_INV_PRODUCTION';
  if activation.state <> 'SCORING_COMMITTED'
     or activation.current_authority <> 'SUPABASE'
     or not activation.scoring_ingress_enabled
     or not exists (
       select 1 from scoring_authority.ingress_gates gate
       where gate.tournament_id = '2026'
         and gate.state = 'OPEN'
         and gate.authority = 'SUPABASE'
         and gate.active_epoch_id = activation.authority_generation_id
     ) then
    return new;
  end if;

  update production_control.cutover_activation_state
  set first_supabase_write_observed_at = now(),
      first_supabase_mutation_key = new.mutation_key,
      first_supabase_match_id = new.match_id,
      first_supabase_match_revision = new.next_match_revision,
      updated_at = now()
  where scope_key = 'BAGGER_INV_PRODUCTION'
    and first_supabase_write_observed_at is null;
  if found then
    insert into production_control.operation_audit_events (
      event_type, domain, tournament_id, actor, request_fingerprint, result, details
    ) values (
      'FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED', 'SCORING_AUTHORITY', '2026',
      left(new.actor_id, 160), null, 'SUCCEEDED',
      jsonb_build_object(
        'epoch_id', activation.authority_generation_id,
        'mutation_key', new.mutation_key,
        'match_id', new.match_id,
        'match_revision', new.next_match_revision
      )
    );
  end if;
  return new;
end;
$function$
;
