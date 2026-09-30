-- Isolated Preview canonical Odds publication: retire the parallel Google sink.
-- Existing snapshots/jobs remain historical evidence; no financial/golf rule changes.
-- Future rollback must review the publisher, supersession trigger and worker grants
-- together; function-only rollback does not restore the old delivery topology.
-- External credentials/resources remain unchanged until separately authorized.
begin;
-- Exact predecessor or identical candidate only; unexpected function drift stops migration.
do $$declare actual text;begin
 select md5(prosrc) into actual from pg_proc where oid='public.publish_preview_championship_odds(jsonb)'::regprocedure;
 if actual not in ('0bd0c4ad6c300981421dfbe4e750cd0e','aff024b03c41e060bf80c83728bd4402') then raise exception 'PREVIEW_ODDS_RETIREMENT_PREDECESSOR_MISMATCH';end if;
end;$$;
create or replace function public.publish_preview_championship_odds(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target text:=btrim(coalesce(input->>'tournament_id',''));
  phase text:=btrim(coalesce(input->>'milestone',''));
  actor text:=btrim(coalesce(input->>'actor_id',''));
  rehearsal boolean:=coalesce((input->>'rehearsal')::boolean,false);
  existing_id uuid; snapshot_id uuid; next_revision bigint; published_at timestamptz;
  current_config scoring_authority.odds_input_configurations%rowtype; current_state jsonb;
begin
  if rehearsal then return jsonb_build_object('ok',false,'code','GOOGLE_RUNTIME_RETIRED'); end if;
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED'); end if;
  if target='' or actor='' or phase not in ('Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results')
    or coalesce(input->>'payload_hash','') !~ '^[0-9a-f]{64}$' or coalesce(input->>'logical_payload_hash','') !~ '^[0-9a-f]{64}$'
    or coalesce(input->>'source_fingerprint','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(input->'source_revision') <> 'object'
    then return jsonb_build_object('ok',false,'code','COMPLETE_ODDS_PUBLICATION_REQUIRED'); end if;
  if phase='Final Results' and exists(select 1 from scoring_authority.matches where tournament_id=target and (status<>'FINAL' or scorecard_complete is not true))
    then return jsonb_build_object('ok',false,'code','FINAL_RESULTS_NOT_READY'); end if;
  perform pg_advisory_xact_lock(hashtextextended('preview-odds-publication:' || target,0));
  select * into current_config from scoring_authority.odds_input_configurations where tournament_id=target and is_current for share;
  if current_config.id is null or current_config.settings_fingerprint<>input->>'settings_fingerprint' or current_config.ratings_fingerprint<>input->>'ratings_fingerprint'
    then return jsonb_build_object('ok',false,'code','STALE_ODDS_INPUT_CONFIGURATION'); end if;
  current_state:=public.read_leaderboards_core_view(target);
  if coalesce((current_state->>'ok')::boolean,false) is not true or current_state->'data'->'source_revision' <> input->'source_revision'
    then return jsonb_build_object('ok',false,'code','STALE_ODDS_SOURCE_STATE'); end if;
  select id into existing_id from scoring_authority.odds_published_snapshots where tournament_id=target and milestone=phase
    and logical_payload_hash=input->>'logical_payload_hash' and source_fingerprint=input->>'source_fingerprint'
    and settings_fingerprint=input->>'settings_fingerprint' and ratings_fingerprint=input->>'ratings_fingerprint'
    and pairing_fingerprint=input->>'pairing_fingerprint' and engine_version=input->>'engine_version' and deterministic_seed=input->>'deterministic_seed';
  if existing_id is not null then return jsonb_build_object('ok',true,'changed',false,'snapshot_id',existing_id,'duplicate',true); end if;
  published_at:=(input->'published_payload'->>'publishedAt')::timestamptz;
  select coalesce(max(publication_revision),0)+1 into next_revision from scoring_authority.odds_published_snapshots where tournament_id=target and milestone=phase;
  update scoring_authority.odds_published_snapshots set is_current_for_milestone=false where tournament_id=target and milestone=phase and is_current_for_milestone;
  update scoring_authority.odds_published_snapshots set is_current_official=false where tournament_id=target and is_current_official;
  insert into scoring_authority.odds_published_snapshots(tournament_id,milestone,phase_order,publication_revision,published_at,published_payload,payload_hash,
    source_fingerprint,engine_version,engine_metadata,google_publication_fingerprint,google_publication_reference,is_current_for_milestone,is_current_official,
    publication_verified,imported_by,logical_payload_hash,settings_fingerprint,ratings_fingerprint,pairing_fingerprint,deterministic_seed,publication_actor_id,mirror_status)
  values(target,phase,array_position(array['Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results'],phase)-1,next_revision,
    published_at,input->'published_payload',input->>'payload_hash',input->>'source_fingerprint',input->>'engine_version',coalesce(input->'simulation_metadata','{}'::jsonb),
    repeat('0',64),jsonb_build_object('status','RETIRED'),true,true,true,actor,input->>'logical_payload_hash',input->>'settings_fingerprint',input->>'ratings_fingerprint',
    input->>'pairing_fingerprint',input->>'deterministic_seed',actor,'RETIRED') returning id into snapshot_id;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata) values(target,'CHAMPIONSHIP_ODDS_PUBLISHED',actor,
    jsonb_build_object('snapshotId',snapshot_id,'milestone',phase,'publicationRevision',next_revision,'googleMirror','RETIRED'));
  return jsonb_build_object('ok',true,'changed',true,'snapshot_id',snapshot_id,'publication_revision',next_revision,'google_mirror_status','RETIRED');
end; $$;


revoke all on function public.publish_preview_championship_odds(jsonb) from public,anon,authenticated;
grant execute on function public.publish_preview_championship_odds(jsonb) to service_role;
revoke all on function public.claim_preview_championship_odds_google_mirror(jsonb),
 public.complete_preview_championship_odds_google_mirror(jsonb) from public,anon,authenticated,service_role;
-- Prevent future canonical publication from altering historical retired mirror rows.
drop trigger if exists odds_google_mirror_supersession on scoring_authority.odds_published_snapshots;

-- The Director current view reads at most four retained jobs per fixed milestone.
-- Each lookup uses the existing (tournament_id,phase,requested_at DESC) index.
-- A selected job is an exact primary-key lookup; checkpoint/input payloads stay server-only.
create or replace function public.read_preview_director_odds_jobs_v1(target_tournament_id text,target_job_id text default null)
returns jsonb language plpgsql security definer stable
set search_path=pg_catalog,scoring_authority as $$
declare jobs jsonb;
begin
 if btrim(coalesce(target_tournament_id,''))='' then return jsonb_build_object('ok',false,'code','TOURNAMENT_SCOPE_REQUIRED'); end if;
 if target_job_id is not null then
  select coalesce(jsonb_agg(to_jsonb(j)-'input_snapshot'-'checkpoint_payload'-'claim_token'),'[]') into jobs
  from scoring_authority.odds_calculation_jobs j where j.tournament_id=target_tournament_id and j.job_id=target_job_id;
 else
  select coalesce(jsonb_agg(to_jsonb(j)-'input_snapshot'-'checkpoint_payload'-'claim_token' order by j.requested_at desc),'[]') into jobs
  from unnest(array['Pre-Tournament','After Round 1','After Round 2','Round 3 Pairings Announced','Final Results']) milestones(milestone)
  cross join lateral (select x.* from scoring_authority.odds_calculation_jobs x
   where x.tournament_id=target_tournament_id and x.phase=milestones.milestone order by x.requested_at desc limit 4) j;
 end if;
 return jsonb_build_object('ok',true,'contract','preview-director-odds-v1','google_runtime','RETIRED','jobs',jobs,'checkpoints','[]'::jsonb);
end; $$;
revoke all on function public.read_preview_director_odds_jobs_v1(text,text) from public,anon,authenticated;
grant execute on function public.read_preview_director_odds_jobs_v1(text,text) to service_role;
notify pgrst,'reload schema';
commit;
