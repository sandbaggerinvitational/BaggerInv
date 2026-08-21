-- A delayed mirror for publication N must never move Google back after N+1 is
-- current. Supersede unfinished jobs when a newer official pointer is selected,
-- and fail closed if an old snapshot is claimed directly.

alter table scoring_authority.odds_google_mirror_jobs
  drop constraint if exists odds_google_mirror_jobs_status_check;
alter table scoring_authority.odds_google_mirror_jobs
  add constraint odds_google_mirror_jobs_status_check
  check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED','SUPERSEDED'));

create or replace function scoring_authority.supersede_prior_odds_google_mirror_jobs() returns trigger
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
begin
  if new.is_current_official is true and (tg_op='INSERT' or old.is_current_official is distinct from true) then
    update scoring_authority.odds_google_mirror_jobs set status='SUPERSEDED',
      last_error_safe='A newer official Odds publication superseded this reporting mirror.',updated_at=now()
    where tournament_id=new.tournament_id and snapshot_id<>new.id and status in ('PENDING','RUNNING','FAILED');
    update scoring_authority.odds_published_snapshots set mirror_status='SUPERSEDED'
    where tournament_id=new.tournament_id and id<>new.id and mirror_status in ('PENDING','RUNNING','FAILED');
  end if;
  return new;
end; $$;

drop trigger if exists odds_google_mirror_supersession on scoring_authority.odds_published_snapshots;
create trigger odds_google_mirror_supersession
after insert or update of is_current_official on scoring_authority.odds_published_snapshots
for each row execute function scoring_authority.supersede_prior_odds_google_mirror_jobs();

create or replace function public.claim_preview_championship_odds_google_mirror(input jsonb) returns jsonb
language plpgsql security definer set search_path=scoring_authority,public,extensions,pg_temp as $$
declare
  target_snapshot uuid;
  actor text:=btrim(coalesce(input->>'actor_id',''));
  mirror_job scoring_authority.odds_google_mirror_jobs%rowtype;
  snapshot_row scoring_authority.odds_published_snapshots%rowtype;
begin
  if upper(btrim(coalesce(input->>'environment',''))) <> 'PREVIEW' then
    return jsonb_build_object('ok',false,'code','PREVIEW_ENVIRONMENT_REQUIRED');
  end if;
  if actor='' then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_ACTOR_REQUIRED'); end if;
  begin target_snapshot:=(input->>'snapshot_id')::uuid;
  exception when others then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_SNAPSHOT_REQUIRED'); end;

  select * into mirror_job from scoring_authority.odds_google_mirror_jobs where snapshot_id=target_snapshot for update;
  if mirror_job.id is null then return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_JOB_NOT_FOUND'); end if;
  select * into snapshot_row from scoring_authority.odds_published_snapshots where id=target_snapshot;
  if snapshot_row.id is null then return jsonb_build_object('ok',false,'code','ODDS_PUBLICATION_NOT_FOUND'); end if;

  if mirror_job.status='SUCCEEDED' then
    return jsonb_build_object('ok',true,'deliver',false,'duplicate',true,'snapshot_id',target_snapshot,
      'status','SUCCEEDED','attempt_count',mirror_job.attempt_count);
  end if;
  if snapshot_row.is_current_official is not true or mirror_job.status='SUPERSEDED' then
    update scoring_authority.odds_google_mirror_jobs set status='SUPERSEDED',
      last_error_safe='A newer official Odds publication superseded this reporting mirror.',updated_at=now()
      where id=mirror_job.id returning * into mirror_job;
    update scoring_authority.odds_published_snapshots set mirror_status='SUPERSEDED' where id=target_snapshot;
    return jsonb_build_object('ok',true,'deliver',false,'duplicate',false,'superseded',true,
      'snapshot_id',target_snapshot,'status','SUPERSEDED','attempt_count',mirror_job.attempt_count);
  end if;
  if mirror_job.status='RUNNING' and mirror_job.updated_at > now()-interval '5 minutes' then
    return jsonb_build_object('ok',false,'code','ODDS_GOOGLE_MIRROR_IN_PROGRESS','retryable',true,
      'snapshot_id',target_snapshot,'attempt_count',mirror_job.attempt_count);
  end if;

  update scoring_authority.odds_google_mirror_jobs set status='RUNNING',attempt_count=attempt_count+1,
    last_error_safe=null,updated_at=now() where id=mirror_job.id returning * into mirror_job;
  insert into scoring_authority.audit_events(tournament_id,action,actor_id,metadata)
  values(mirror_job.tournament_id,'CHAMPIONSHIP_ODDS_GOOGLE_MIRROR_ATTEMPTED',actor,
    jsonb_build_object('snapshotId',target_snapshot,'attemptCount',mirror_job.attempt_count));
  return jsonb_build_object('ok',true,'deliver',true,'duplicate',false,'snapshot_id',target_snapshot,
    'job_id',mirror_job.id,'status','RUNNING','attempt_count',mirror_job.attempt_count,
    'tournament_id',snapshot_row.tournament_id,'milestone',snapshot_row.milestone,
    'publication_revision',snapshot_row.publication_revision,'published_payload',snapshot_row.published_payload,
    'payload_hash',snapshot_row.payload_hash);
end; $$;

revoke all on function public.claim_preview_championship_odds_google_mirror(jsonb) from public,anon,authenticated;
grant execute on function public.claim_preview_championship_odds_google_mirror(jsonb) to service_role;
notify pgrst,'reload schema';
