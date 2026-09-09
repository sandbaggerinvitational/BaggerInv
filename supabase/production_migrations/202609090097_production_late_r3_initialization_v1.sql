-- Release A only. Successor to finalized 095/096; NOT AUTHORIZED FOR DEPLOYMENT.
-- No pairing, handicap, auction, result, or publication is created at install.
begin;

do $baseline$
declare item record;
begin
  for item in select * from (values
    ('public.mutate_production_round_pairings_v1(jsonb)','bf4fd0c85c0046fca7d95220b342583b'),
    ('public.read_production_tournament_setup_v1(jsonb)','5b7a2711c3d38382e0d5ea6c7a19a1fe'),
    ('public.mutate_production_tournament_setup_v1(jsonb)','df3599854e8b2ac8e9277eed52552f17'),
    ('production_control.apply_tournament_setup_pairings_v1(jsonb,bigint,text)','fda0e438c22b84d505a76fce5514848e'),
    ('production_control.apply_tournament_setup_scoring_context_v1(jsonb,bigint,text)','55dc5329716b4503efb6ed9570a00fd7'),
    ('production_control.tournament_setup_dependency_codes_v1(text,text,integer,text,text)','832787a7c3a43d743121c7ff02562169'),
    ('public.approve_production_handicap_revision_v1(jsonb)','5d5b79a17449ba007b2b7435980be36f'),
    ('production_control.handicap_v1_match_context(text,uuid)','665fc9a2825cb8878238f7573e2b39ba'),
    ('scoring_authority.enqueue_production_calcutta_v1_change()','79bf8cf6dff13ae26d1aaa8402ba7b21'),
    ('production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)','c9acff5f0752306d866cc31f44862e50'),
    ('public.read_production_calcutta_frozen_2026_v1(jsonb)','fad075a3bbb9405a5fcfadb5630ca299'),
    ('production_control.calcutta_v1_source_revision(text)','a182c452f5d6d2d9f38ea84dfdc375c9')
  ) as required(signature,body_md5) loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(item.signature)
      and md5(prosrc)=item.body_md5) then
      raise exception 'LATE_R3_FINALIZED_BASELINE_MISMATCH: %',item.signature;
    end if;
  end loop;
end;
$baseline$;

create table production_control.late_r3_initialization_receipts_v1 (
  tournament_id text not null check (tournament_id='2026'),
  round_number integer not null check (round_number=3),
  match_id text primary key references scoring_authority.matches(match_id),
  operation_request_id uuid not null,
  setup_revision bigint not null,
  pairing jsonb not null check (jsonb_array_length(pairing)=2),
  pre_mutation_evidence jsonb not null,
  actor_player_id text not null,
  created_at timestamptz not null default clock_timestamp()
);

-- Private transaction capability, never supplied by Director. Deleted before
-- returning; an error rolls it back with the encompassing canonical operation.
create table production_control.late_r3_transactions_v1 (
  transaction_id bigint primary key,
  operation_request_id uuid not null,
  operation text not null,
  eligible_matches text[] not null,
  initialization_matches text[] not null,
  pre_mutation_evidence jsonb not null,
  protected_fingerprint text not null,
  source_before jsonb not null,
  started_at timestamptz not null default clock_timestamp()
);

create table production_control.late_r3_calcutta_compatibility_v1 (
  compatibility_id bigint generated always as identity primary key,
  tournament_id text not null check (tournament_id='2026'),
  operation_request_id uuid not null,
  operation text not null,
  match_ids text[] not null,
  source_before jsonb not null,
  source_after jsonb not null,
  source_before_fingerprint text not null,
  source_after_fingerprint text not null,
  result_id uuid references scoring_authority.calcutta_v1_result_revisions(result_id),
  original_result_source_fingerprint text,
  consumed_fingerprint text not null,
  financial_fingerprint text not null,
  policy text not null default 'late-r3-calculation-neutral-v1',
  created_at timestamptz not null default clock_timestamp(),
  unique(operation_request_id,operation)
);

alter table production_control.late_r3_initialization_receipts_v1 enable row level security;
alter table production_control.late_r3_transactions_v1 enable row level security;
alter table production_control.late_r3_calcutta_compatibility_v1 enable row level security;
revoke all on production_control.late_r3_initialization_receipts_v1,
  production_control.late_r3_transactions_v1,
  production_control.late_r3_calcutta_compatibility_v1 from public,anon,authenticated,service_role;

create function production_control.late_r3_immutable_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception 'TOURNAMENT_SETUP_LIFECYCLE_HISTORY_IMMUTABLE'; end;
$$;
create trigger late_r3_receipt_immutable before update or delete
  on production_control.late_r3_initialization_receipts_v1
  for each row execute function production_control.late_r3_immutable_v1();
create trigger late_r3_compatibility_immutable before update or delete
  on production_control.late_r3_calcutta_compatibility_v1
  for each row execute function production_control.late_r3_immutable_v1();

create function production_control.late_r3_pairing_v1(target text) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('player_id',player_id,
    'team_side',team_side,'player_slot',player_slot) order by team_side,player_slot),'[]')
  from scoring_authority.match_participants where match_id=target
$$;

create function production_control.late_r3_financial_fingerprint_v1() returns text
language sql stable security definer set search_path=pg_catalog as $$
  select production_control.calcutta_v1_hash(jsonb_build_object(
    'current',(select to_jsonb(c) from scoring_authority.calcutta_v1_current c where tournament_id='2026'),
    'configuration',(select jsonb_agg(to_jsonb(c) order by configuration_revision) from scoring_authority.calcutta_v1_configuration_revisions c where tournament_id='2026'),
    'auction',(select jsonb_agg(to_jsonb(a) order by auction_revision) from scoring_authority.calcutta_v1_auction_fact_revisions a where tournament_id='2026'),
    'publication',(select jsonb_agg(to_jsonb(p) order by publication_revision) from scoring_authority.calcutta_v1_publication_revisions p where tournament_id='2026'),
    'results',(select jsonb_agg(to_jsonb(r) order by result_revision) from scoring_authority.calcutta_v1_result_revisions r where tournament_id='2026')
  ))
$$;

-- Complete R1/R2 frozen authority, not merely displayed totals. R3 may not have
-- results in this lifecycle. This includes inputs not in the legacy global hash.
create function production_control.late_r3_consumed_fingerprint_v1() returns text
language sql stable security definer set search_path=pg_catalog as $$
  select production_control.calcutta_v1_hash(jsonb_build_object(
    'policy',production_control.calcutta_v1_source_revision('2026')->'calculation_policy',
    'rounds',(select jsonb_agg(to_jsonb(r) order by round_number) from scoring_authority.rounds r where tournament_id='2026'),
    'round_courses',(select jsonb_agg(to_jsonb(r) order by round_number) from scoring_authority.tournament_setup_round_courses_v1 r where tournament_id='2026'),
    'course_tees',(select jsonb_agg(to_jsonb(c) order by course_id,tee_id) from scoring_authority.tournament_setup_course_tees_v1 c where tournament_id='2026'),
    'course_holes',(select jsonb_agg(to_jsonb(h) order by course_id,tee_id,hole_number) from scoring_authority.tournament_setup_course_holes_v1 h where tournament_id='2026'),
    'matches',(select jsonb_agg(to_jsonb(m) order by match_id) from scoring_authority.matches m where tournament_id='2026' and round_number in(1,2)),
    'participants',(select jsonb_agg(to_jsonb(p) order by p.match_id,team_side,player_slot) from scoring_authority.match_participants p join scoring_authority.matches m using(match_id) where m.tournament_id='2026' and m.round_number in(1,2)),
    'snapshots',(select jsonb_agg(to_jsonb(s) order by snapshot_id) from scoring_authority.scoring_snapshots s where tournament_id='2026' and match_id in(select match_id from scoring_authority.matches where tournament_id='2026' and round_number in(1,2))),
    'match_holes',(select jsonb_agg(to_jsonb(h) order by h.match_id,h.hole_number) from scoring_authority.match_holes h join scoring_authority.matches m using(match_id) where m.tournament_id='2026' and m.round_number in(1,2)),
    'permissions',(select jsonb_agg(to_jsonb(p) order by p.match_id,p.player_id) from scoring_authority.scoring_permissions p join scoring_authority.matches m using(match_id) where m.tournament_id='2026' and m.round_number in(1,2)),
    'details',(select jsonb_agg(to_jsonb(d) order by match_id) from scoring_authority.tournament_setup_match_details_v1 d where tournament_id='2026' and round_number in(1,2)),
    'skins_configuration',(select jsonb_agg(to_jsonb(s) order by configuration_revision_id) from scoring_authority.net_skins_v1_configuration_revisions s),
    'skins_current',(select jsonb_agg(to_jsonb(s) order by tournament_id) from scoring_authority.net_skins_v1_configuration_current s),
    'skins_results',(select jsonb_agg(to_jsonb(s) order by to_jsonb(s)::text) from scoring_authority.net_skins_v1_result_revisions s where tournament_id='2026'),
    'holes',(select jsonb_agg(to_jsonb(h) order by h.match_id,h.hole_number) from scoring_authority.hole_scores h join scoring_authority.matches m using(match_id) where m.tournament_id='2026'),
    'financial',production_control.late_r3_financial_fingerprint_v1()
  ))
$$;

create function production_control.late_r3_source_participants_v1(participants jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('player_id',value->'player_id',
    'team_side',value->'team_side','player_slot',value->'player_slot',
    'course_handicap',value->'course_handicap','playing_handicap',value->'playing_handicap',
    'final_strokes',value->'final_strokes','handicap_revision_id',value->'handicap_revision_id')
    order by (value->>'team_side')::integer,(value->>'player_slot')::integer,value->>'player_id'),'[]')
  from jsonb_array_elements(participants)
$$;

-- Approval refreshes an unstarted R3 in place without changing Match revision.
-- Recognize ONLY the exact immutable before/after event chain of that existing
-- authority. No approximation, recalculation or relaxed R1/R2 freeze rule.
create function production_control.late_r3_approved_refresh_equivalent_v1(prior_source jsonb,current_source jsonb)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
declare old_match jsonb; new_match jsonb; target text; participants jsonb; e record;
begin
  if prior_source is null or current_source is null
    or (prior_source-'matches') is distinct from (current_source-'matches')
    or jsonb_array_length(prior_source->'matches')<>jsonb_array_length(current_source->'matches') then return false; end if;
  for old_match in select value from jsonb_array_elements(prior_source->'matches') loop
    target:=old_match->>'match_id';
    select value into new_match from jsonb_array_elements(current_source->'matches') where value->>'match_id'=target;
    if old_match=new_match then continue; end if;
    if new_match is null or old_match->>'round_number'<>'3' or old_match->>'format'<>'SI'
      or not production_control.handicap_v1_match_is_unstarted(target)
      or (old_match-'participants') is distinct from (new_match-'participants')
      or not exists(select 1 from production_control.late_r3_initialization_receipts_v1
        where match_id=target and pairing=production_control.late_r3_pairing_v1(target)) then return false; end if;
    participants:=old_match->'participants';
    for e in select event.* from scoring_authority.handicap_match_refresh_events event
      join scoring_authority.handicap_revisions revision using(revision_id)
      where event.tournament_id='2026' and event.match_id=target
        and revision.status in('APPROVED','SUPERSEDED') and revision.approved_at is not null
      order by event.refreshed_at,event.next_snapshot_revision loop
      if participants=production_control.late_r3_source_participants_v1(e.before_context->'participants') then
        if ((e.before_context->'snapshot')-array['snapshot_revision','participant_configuration','team_configuration','effective_at','canonical_hash','handicap_revision_id'])
          is distinct from ((e.after_context->'snapshot')-array['snapshot_revision','participant_configuration','team_configuration','effective_at','canonical_hash','handicap_revision_id']) then return false; end if;
        participants:=production_control.late_r3_source_participants_v1(e.after_context->'participants');
      end if;
    end loop;
    if participants is distinct from new_match->'participants' then return false; end if;
  end loop;
  return true;
end;
$$;

-- Verify a recorded equivalence against CURRENT inputs on every read. Never
-- overwrite the result's source fingerprint or permit a generic stale result.
create function production_control.late_r3_result_compatible_v1(target_result uuid, current_source text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select exists(select 1 from production_control.late_r3_calcutta_compatibility_v1 c
    join scoring_authority.calcutta_v1_result_revisions r on r.result_id=c.result_id
    where r.result_id=target_result and r.is_current and r.tournament_id='2026'
      and c.original_result_source_fingerprint=r.source_fingerprint
      and (c.source_after_fingerprint=current_source or
        (current_source=production_control.calcutta_v1_hash(production_control.calcutta_v1_source_revision('2026'))
          and production_control.late_r3_approved_refresh_equivalent_v1(c.source_after,production_control.calcutta_v1_source_revision('2026'))))
      and c.policy='late-r3-calculation-neutral-v1'
      and c.financial_fingerprint=production_control.late_r3_financial_fingerprint_v1()
      and c.consumed_fingerprint=production_control.late_r3_consumed_fingerprint_v1())
$$;

-- Preserve every ordinary dependency; only a private, validated transaction
-- capability can authorize the two Calcutta exceptions for its exact Match.
alter function production_control.tournament_setup_dependency_codes_v1(text,text,integer,text,text)
  rename to tournament_setup_dependency_codes_before_late_r3_v1;
create function production_control.tournament_setup_dependency_codes_v1(
  target_player text default null,target_team text default null,target_round integer default null,
  target_match text default null,change_kind text default 'STRUCTURAL')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare codes jsonb;
begin
  codes:=production_control.tournament_setup_dependency_codes_before_late_r3_v1(
    target_player,target_team,target_round,target_match,change_kind);
  if target_player is null and target_team is null and target_round=3
    and change_kind in('PAIRINGS','SCORING_CONTEXT') and exists(
      select 1 from production_control.late_r3_transactions_v1 t
      where transaction_id=txid_current() and target_match=any(eligible_matches)
        and ((change_kind='PAIRINGS' and operation in('REPLACE_PAIRINGS','REPLACE_ROUND_PAIRINGS'))
          or (change_kind='SCORING_CONTEXT' and operation='PREPARE_SCORING_CONTEXT')))
  then
    select coalesce(jsonb_agg(value),'[]') into codes from jsonb_array_elements(codes)
      where value not in('"CALCUTTA_AUCTION_DEPENDENCY"'::jsonb,'"CALCUTTA_RESULT_DEPENDENCY"'::jsonb);
  end if;
  return codes;
end;
$$;

-- The original finalized bodies remain available only to the wrapper. No input
-- flag/token or Director change is introduced; 095 still owns Round validation,
-- pre-delete/rebuild behavior, CAS, idempotency and atomic rollback.
alter function public.mutate_production_round_pairings_v1(jsonb) set schema production_control;
alter function production_control.mutate_production_round_pairings_v1(jsonb) rename to mutate_round_pairings_before_late_r3_v1;
alter function public.mutate_production_tournament_setup_v1(jsonb) set schema production_control;
alter function production_control.mutate_production_tournament_setup_v1(jsonb) rename to mutate_setup_before_late_r3_v1;

create function production_control.mutate_late_r3_dispatch_v1(input jsonb, round_save boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  action_value text:=upper(btrim(coalesce(input->>'operation',input->>'action','')));
  payload jsonb;
  row_value jsonb;
  target text;
  desired jsonb;
  current_pair jsonb;
  m scoring_authority.matches%rowtype;
  eligible text[]:='{}';
  initial text[]:='{}';
  evidence jsonb:='{}';
  prior_source jsonb;
  after_source jsonb;
  protected_before text;
  financial_before text;
  response jsonb;
  request_id uuid;
  existing_result scoring_authority.calcutta_v1_result_revisions%rowtype;
  code text;
begin
  if (not round_save and action_value not in('REPLACE_PAIRINGS','PREPARE_SCORING_CONTEXT'))
    or (round_save and input->>'round_number' is distinct from '3') then
    if round_save then return production_control.mutate_round_pairings_before_late_r3_v1(input); end if;
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;
  payload:=case when round_save then input->'matches'
    when action_value='REPLACE_PAIRINGS' then jsonb_build_array(coalesce(input->'pairings',input))
    else jsonb_build_array(coalesce(input->'scoring_context',input)) end;
  if not round_save and coalesce(payload#>>'{0,match_id}',payload#>>'{0,matchId}','') !~ '^2026-R3-([1-9]|1[0-2])$' then
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;
  if round_save then
    begin
      perform production_control.assert_tournament_setup_runtime_v1(input);
    exception when others then
      get stacked diagnostics code=message_text;
      if code !~ '^TOURNAMENT_SETUP_[A-Z0-9_]+$' then code:='TOURNAMENT_SETUP_ROUND_OPERATION_FAILED'; end if;
      return jsonb_build_object('ok',false,'code',code,'matchId',null,'playerId',null);
    end;
  else
    perform production_control.assert_tournament_setup_runtime_v1(input);
  end if;
  begin
  request_id:=(input->>'operation_request_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
  -- Let the finalized RPC decide exact retry/conflict before any lifecycle work.
  if exists(select 1 from production_control.tournament_setup_operation_receipts_v1
    where tournament_id='2026' and action=action_value and operation_request_id=request_id) then
    if round_save then return production_control.mutate_round_pairings_before_late_r3_v1(input); end if;
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;
  -- Rare setup operation: NOWAIT, coordinated table locks avoid check/write
  -- races with non-cooperating legacy writers, including worker row claims.
  -- Ordinary participant SELECTs remain allowed. Busy writers cause rollback.
  lock table scoring_authority.matches,scoring_authority.match_participants,
    scoring_authority.scoring_snapshots,scoring_authority.hole_scores,
    scoring_authority.score_mutations,scoring_authority.score_revision_history,
    scoring_authority.scoring_permissions,scoring_authority.scoring_ingress_leases,
    scoring_authority.finalized_scorecard_snapshots,scoring_authority.rounds,
    scoring_authority.tournament_players,scoring_authority.handicap_revision_current,
    scoring_authority.handicap_revision_entries,scoring_authority.handicap_revisions,
    scoring_authority.handicap_match_refresh_events,
    scoring_authority.tournament_setup_match_details_v1,
    scoring_authority.tournament_setup_round_courses_v1,
    scoring_authority.tournament_setup_course_tees_v1,scoring_authority.tournament_setup_course_holes_v1,
    scoring_authority.calcutta_v1_current,scoring_authority.calcutta_v1_configuration_revisions,
    scoring_authority.calcutta_v1_auction_fact_revisions,scoring_authority.calcutta_v1_result_revisions,
    scoring_authority.calcutta_v1_publication_revisions,scoring_authority.calcutta_v1_recalculation_jobs,
    scoring_authority.net_skins_v1_configuration_current,scoring_authority.net_skins_v1_configuration_revisions,
    scoring_authority.net_skins_v1_result_revisions,scoring_authority.net_skins_v1_recalculation_jobs,
    scoring_authority.odds_publication_current,scoring_authority.odds_publication_public_pointer_v1,
    scoring_authority.odds_calculation_jobs
    in exclusive mode nowait;

  -- All R3 still future/unscored. Historical R3 results remain blocking, not
  -- just the current publication pointer. No financial job is cancelled.
  if exists(select 1 from scoring_authority.matches where tournament_id='2026' and round_number=3
      and not production_control.handicap_v1_match_is_unstarted(match_id))
    or exists(select 1 from scoring_authority.calcutta_v1_recalculation_jobs where tournament_id='2026' and status in('PENDING','RUNNING'))
    or exists(select 1 from scoring_authority.calcutta_v1_result_revisions where tournament_id='2026'
      and (engine_result_payload->'completedRounds') @> '[3]'::jsonb)
    or exists(select 1 from scoring_authority.net_skins_v1_result_revisions where tournament_id='2026' and round_number=3)
    or exists(select 1 from scoring_authority.finalized_scorecard_snapshots s
      join scoring_authority.matches history_match using(match_id) where history_match.tournament_id='2026' and history_match.round_number=3)
    or exists(select 1 from scoring_authority.score_revision_history s
      join scoring_authority.matches history_match using(match_id) where history_match.tournament_id='2026' and history_match.round_number=3)
  then
    if round_save then return production_control.mutate_round_pairings_before_late_r3_v1(input); end if;
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;

  prior_source:=production_control.calcutta_v1_source_revision('2026');
  financial_before:=production_control.late_r3_financial_fingerprint_v1();
  protected_before:=production_control.late_r3_consumed_fingerprint_v1();
  select * into existing_result from scoring_authority.calcutta_v1_result_revisions where tournament_id='2026' and is_current;
  if found and not exists(select 1 from scoring_authority.calcutta_v1_current c
    where tournament_id='2026' and configuration_revision_id=existing_result.configuration_revision_id
      and configuration_fingerprint=existing_result.configuration_fingerprint
      and auction_revision_id=existing_result.auction_revision_id
      and auction_fingerprint=existing_result.auction_fingerprint) then
    if round_save then return production_control.mutate_round_pairings_before_late_r3_v1(input); end if;
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;
  if existing_result.result_id is not null and existing_result.source_fingerprint<>production_control.calcutta_v1_hash(prior_source)
    and not production_control.late_r3_result_compatible_v1(existing_result.result_id,production_control.calcutta_v1_hash(prior_source)) then
    if round_save then return production_control.mutate_round_pairings_before_late_r3_v1(input); end if;
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;

  -- This loop precedes the 095 RPC and therefore precedes every DELETE.
  for row_value in select value from jsonb_array_elements(payload) loop
    target:=coalesce(row_value->>'match_id',row_value->>'matchId');
    select * into m from scoring_authority.matches where match_id=target and tournament_id='2026' and round_number=3 and format='SI';
    if not found then continue; end if;
    current_pair:=production_control.late_r3_pairing_v1(target);
    if action_value='PREPARE_SCORING_CONTEXT' then
      if exists(select 1 from production_control.late_r3_initialization_receipts_v1 receipt
        where match_id=target and pairing=current_pair
          and not exists(select 1 from production_control.tournament_setup_audit_events_v1 a
            where a.tournament_id='2026' and a.result='CHANGED' and a.next_revision>receipt.setup_revision
              and ((a.action='REPLACE_PAIRINGS' and a.target_id=target)
                or (a.action='REPLACE_ROUND_PAIRINGS' and a.safe_metadata->'changedMatches' ? target))))
      then eligible:=array_append(eligible,target); end if;
    else
      select coalesce(jsonb_agg(jsonb_build_object('player_id',upper(btrim(coalesce(value->>'player_id',value->>'playerId'))),
        'team_side',coalesce(value->>'team_side',value->>'teamSide')::integer,
        'player_slot',coalesce(value->>'player_slot',value->>'playerSlot')::integer)
        order by coalesce(value->>'team_side',value->>'teamSide')::integer,coalesce(value->>'player_slot',value->>'playerSlot')::integer),'[]')
        into desired from jsonb_array_elements(row_value->'participants');
      if current_pair='[]' and jsonb_array_length(desired)=2
        and not exists(select 1 from production_control.late_r3_initialization_receipts_v1 where match_id=target)
        and not exists(select 1 from production_control.tournament_setup_audit_events_v1
          where tournament_id='2026' and result='CHANGED' and
            ((action='REPLACE_PAIRINGS' and target_id=target)
              or (action='REPLACE_ROUND_PAIRINGS' and safe_metadata->'changedMatches' ? target)))
        and not exists(select 1 from scoring_authority.scoring_snapshots s where s.match_id=target
          and (coalesce(s.participant_configuration->'all_ids','[]')<>'[]'
            or coalesce(s.participant_configuration->'team_1','[]')<>'[]'
            or coalesce(s.participant_configuration->'team_2','[]')<>'[]'))
        and not exists(select 1 from scoring_authority.score_revision_history where match_id=target)
        and not exists(select 1 from scoring_authority.finalized_scorecard_snapshots where match_id=target)
      then
        initial:=array_append(initial,target);
        eligible:=array_append(eligible,target);
      end if;
    end if;
    evidence:=evidence||jsonb_build_object(target,jsonb_build_object('match',to_jsonb(m),'pairing',current_pair,'desired',desired));
  end loop;
  if cardinality(eligible)=0 then
    if round_save then return production_control.mutate_round_pairings_before_late_r3_v1(input); end if;
    return production_control.mutate_setup_before_late_r3_v1(input);
  end if;
  insert into production_control.late_r3_transactions_v1 values(txid_current(),request_id,action_value,eligible,initial,evidence,protected_before,prior_source,clock_timestamp());
  if round_save then response:=production_control.mutate_round_pairings_before_late_r3_v1(input);
  else response:=production_control.mutate_setup_before_late_r3_v1(input); end if;
  if not coalesce((response->>'ok')::boolean,false) then
    delete from production_control.late_r3_transactions_v1 where transaction_id=txid_current();
    return response;
  end if;
  if financial_before<>production_control.late_r3_financial_fingerprint_v1()
    or protected_before<>production_control.late_r3_consumed_fingerprint_v1() then
    raise exception 'TOURNAMENT_SETUP_LIFECYCLE_PRESERVATION_FAILED';
  end if;
  after_source:=production_control.calcutta_v1_source_revision('2026');
  -- Full global comparison: only the authorized R3 Match setup fields may vary.
  -- Every score, round status, policy, non-target Match and participant survives.
  if (prior_source-'matches') is distinct from (after_source-'matches')
    or (select jsonb_agg(value order by value->>'match_id') from jsonb_array_elements(prior_source->'matches')
      where not (value->>'match_id'=any(eligible))) is distinct from
      (select jsonb_agg(value order by value->>'match_id') from jsonb_array_elements(after_source->'matches')
      where not (value->>'match_id'=any(eligible))) then
    raise exception 'TOURNAMENT_SETUP_LIFECYCLE_SOURCE_CHANGED';
  end if;
  foreach target in array eligible loop
    if (select value-array['participants','match_revision','permission_revision','scoring_snapshot_id'] from jsonb_array_elements(prior_source->'matches') where value->>'match_id'=target)
      is distinct from (select value-array['participants','match_revision','permission_revision','scoring_snapshot_id'] from jsonb_array_elements(after_source->'matches') where value->>'match_id'=target) then
      raise exception 'TOURNAMENT_SETUP_LIFECYCLE_SOURCE_CHANGED';
    end if;
    if target=any(initial) then
      if production_control.late_r3_pairing_v1(target) is distinct from evidence#>array[target,'desired'] then
        raise exception 'TOURNAMENT_SETUP_LIFECYCLE_PAIRING_CHANGED';
      end if;
      insert into production_control.late_r3_initialization_receipts_v1
        (tournament_id,round_number,match_id,operation_request_id,setup_revision,pairing,pre_mutation_evidence,actor_player_id)
        values('2026',3,target,request_id,(response->>'revision')::bigint,
          production_control.late_r3_pairing_v1(target),evidence->target,input#>>'{authorization,player_id}');
    end if;
  end loop;
  if prior_source is distinct from after_source then
    insert into production_control.late_r3_calcutta_compatibility_v1
      (tournament_id,operation_request_id,operation,match_ids,source_before,source_after,
        source_before_fingerprint,source_after_fingerprint,result_id,original_result_source_fingerprint,
        consumed_fingerprint,financial_fingerprint)
      values('2026',request_id,action_value,eligible,prior_source,after_source,
        production_control.calcutta_v1_hash(prior_source),production_control.calcutta_v1_hash(after_source),
        existing_result.result_id,existing_result.source_fingerprint,protected_before,financial_before);
  end if;
  delete from production_control.late_r3_transactions_v1 where transaction_id=txid_current();
  return response;
exception when others then
  get stacked diagnostics code=message_text;
  if code !~ '^TOURNAMENT_SETUP_[A-Z0-9_]+$' then code:='TOURNAMENT_SETUP_LIFECYCLE_BLOCKED'; end if;
  return jsonb_build_object('ok',false,'code',code);
  end;
end;
$$;

create function public.mutate_production_round_pairings_v1(input jsonb) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select production_control.mutate_late_r3_dispatch_v1(input,true)
$$;
create function public.mutate_production_tournament_setup_v1(input jsonb) returns jsonb
language sql security definer set search_path=pg_catalog as $$
  select production_control.mutate_late_r3_dispatch_v1(input,false)
$$;

-- Patch only the trigger entry and the historical reader's explicit freshness
-- predicates, with exact anchors. Abort installation on an unexpected baseline.
do $hooks$
declare definition text; anchor text; replacement text;
begin
  definition:=pg_get_functiondef('scoring_authority.enqueue_production_calcutta_v1_change()'::regprocedure);
  anchor:=E'begin\n  if tg_table_name in';
  if position(anchor in definition)=0 then raise exception 'LATE_R3_TRIGGER_BASELINE_MISMATCH'; end if;
  replacement:=E'begin\n  if tg_table_name = ''matches'' and tg_op = ''UPDATE'' and exists (select 1 from production_control.late_r3_transactions_v1 where transaction_id=txid_current() and (to_jsonb(new)->>''match_id'')=any(eligible_matches)) then\n    if (to_jsonb(old)-array[''match_revision'',''permission_revision'',''scoring_snapshot_id'',''updated_at'',''authority_updated_at'']) is distinct from (to_jsonb(new)-array[''match_revision'',''permission_revision'',''scoring_snapshot_id'',''updated_at'',''authority_updated_at'']) then raise exception ''TOURNAMENT_SETUP_LIFECYCLE_TRIGGER_CHANGE_BLOCKED''; end if;\n    return new;\n  end if;\n  if tg_table_name in';
  execute replace(definition,anchor,replacement);
  -- A later ordinary worker poll must honor the same proof as the reader.
  -- Force=true, leases, pending jobs and genuine-source invalidation are intact.
  definition:=pg_get_functiondef('production_control.enqueue_production_calcutta_v1(text,text,boolean,text,text)'::regprocedure);
  anchor:=E'and value.source_fingerprint = source_fingerprint_value\n    and value.is_current';
  if position(anchor in definition)=0 then raise exception 'LATE_R3_ENQUEUE_BASELINE_MISMATCH'; end if;
  execute replace(definition,anchor,E'and (value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(value.result_id,source_fingerprint_value))\n    and value.is_current');
  definition:=pg_get_functiondef('public.read_production_calcutta_frozen_2026_v1(jsonb)'::regprocedure);
  anchor:='and result_value.source_fingerprint = source_fingerprint_value;';
  if position(anchor in definition)=0 then raise exception 'LATE_R3_READER_BASELINE_MISMATCH'; end if;
  definition:=replace(definition,anchor,'and (result_value.source_fingerprint = source_fingerprint_value or production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value));');
  anchor:='and result_value.source_fingerprint <> source_fingerprint_value;';
  if position(anchor in definition)=0 then raise exception 'LATE_R3_READER_BASELINE_MISMATCH'; end if;
  definition:=replace(definition,anchor,'and result_value.source_fingerprint <> source_fingerprint_value and not production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value);');
  anchor:='''stale'', result_is_stale,';
  if position(anchor in definition)=0 then raise exception 'LATE_R3_READER_BASELINE_MISMATCH'; end if;
  definition:=replace(definition,anchor,'''stale'', result_is_stale, ''lifecycle_compatible'', production_control.late_r3_result_compatible_v1(result_value.result_id,source_fingerprint_value), ''original_result_source_fingerprint'', result_value.source_fingerprint,');
  execute definition;
end;
$hooks$;

do $grants$
declare f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc where pronamespace='production_control'::regnamespace
    and (proname like 'late_r3_%' or proname in('mutate_late_r3_dispatch_v1',
      'mutate_round_pairings_before_late_r3_v1','mutate_setup_before_late_r3_v1',
      'tournament_setup_dependency_codes_before_late_r3_v1','tournament_setup_dependency_codes_v1')) loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
  end loop;
end;
$grants$;
revoke all on function public.mutate_production_round_pairings_v1(jsonb),
  public.mutate_production_tournament_setup_v1(jsonb) from public,anon,authenticated;
grant execute on function public.mutate_production_round_pairings_v1(jsonb),
  public.mutate_production_tournament_setup_v1(jsonb) to service_role;
commit;
