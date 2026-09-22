-- Additive 2026 Director controls. Installation performs no match mutation.
begin;
create table production_control.round_scoring_receipts_v1 (
 operation_id uuid primary key, tournament_id text not null check(tournament_id='2026'),
 round_number integer not null check(round_number between 1 and 3),
 operation text not null check(operation in ('OPEN','LOCK','RESUME')),
 actor_player_id text not null, request_hash text not null,
 before_fingerprint text not null, after_fingerprint text not null,
 receipt jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table production_control.round_scoring_receipts_v1 enable row level security;
revoke all on production_control.round_scoring_receipts_v1 from public,anon,authenticated,service_role;
create function production_control.reject_round_scoring_receipt_mutation_v1() returns trigger
 language plpgsql set search_path=pg_catalog as $$begin raise exception 'ROUND_RECEIPT_IMMUTABLE';end$$;
create trigger round_scoring_receipt_immutable before update or delete on production_control.round_scoring_receipts_v1
 for each row execute function production_control.reject_round_scoring_receipt_mutation_v1();
create trigger round_scoring_receipt_no_truncate before truncate on production_control.round_scoring_receipts_v1
 for each statement execute function production_control.reject_round_scoring_receipt_mutation_v1();

create function production_control.round_scoring_state_v1(target_round integer) returns jsonb
 language plpgsql stable security definer set search_path=pg_catalog,production_control,scoring_authority as $$
declare m scoring_authority.matches%rowtype; matches jsonb:='[]'; manifest jsonb:='[]';
 initial jsonb; resume jsonb; perms jsonb; detail jsonb; item jsonb; authority jsonb;
 expected integer; pair_count integer; unique_count integer; roster_count integer; leases integer; active integer;
 open_reasons jsonb; resume_reasons jsonb; actions jsonb; failures jsonb; targets jsonb; op text; reason jsonb;
begin
 if target_round not between 1 and 3 or target_round is null then raise exception 'ROUND_SCOPE_INVALID';end if;
 expected:=case when target_round=3 then 12 else 6 end;
 select count(*),count(distinct p.player_id) into pair_count,unique_count from scoring_authority.match_participants p join scoring_authority.matches joined_match using(match_id) where joined_match.tournament_id='2026' and joined_match.round_number=target_round;
 select count(*) into roster_count from scoring_authority.tournament_players where tournament_id='2026' and participation_status='ACTIVE';
 authority:=jsonb_build_object('round',(select to_jsonb(r) from scoring_authority.rounds r where r.tournament_id='2026' and r.round_number=target_round),
 'setup',(select to_jsonb(s) from production_control.tournament_setup_context_v1 s where tournament_id='2026'),
 'handicap',(select to_jsonb(c) from scoring_authority.handicap_revision_current c where tournament_id='2026'),
 'handicapRevision',(select h.revision_number from scoring_authority.handicap_revision_current c join scoring_authority.handicap_revisions h using(revision_id) where c.tournament_id='2026'),
 'handicapEntries',(select jsonb_agg(to_jsonb(e) order by player_id) from scoring_authority.handicap_revision_entries e join scoring_authority.handicap_revision_current c using(revision_id) where c.tournament_id='2026'),
 'membership',(select jsonb_agg(to_jsonb(t) order by player_id) from scoring_authority.tournament_players t where tournament_id='2026'),
 'courses',(select jsonb_agg(to_jsonb(c) order by course_id,tee_id) from scoring_authority.tournament_setup_course_tees_v1 c where tournament_id='2026'),
 'courseHoles',(select jsonb_agg(to_jsonb(h) order by course_id,tee_id,hole_number) from scoring_authority.tournament_setup_course_holes_v1 h where tournament_id='2026'),
 'roundCourse',(select to_jsonb(c) from scoring_authority.tournament_setup_round_courses_v1 c where tournament_id='2026' and round_number=target_round));
 for m in select * from scoring_authority.matches where tournament_id='2026' and round_number=target_round order by match_id loop
 initial:=production_control.assert_production_match_scoring_ready_v1(m.match_id);
 resume:=case when m.status='LIVE' and m.scoring_locked then production_control.assert_production_match_resume_ready_v1(m.match_id) else null end;
 select coalesce(jsonb_agg(to_jsonb(p) order by player_id),'[]') into perms from scoring_authority.scoring_permissions p where match_id=m.match_id;
 select count(*) into active from scoring_authority.scoring_permissions where match_id=m.match_id and (can_score or revoked_at is null);
 select count(*) into leases from scoring_authority.scoring_ingress_leases where tournament_id='2026' and match_id=m.match_id and expires_at>clock_timestamp();
 select to_jsonb(d) into detail from scoring_authority.tournament_setup_match_details_v1 d where match_id=m.match_id;
 open_reasons:=coalesce(initial->'reasons','[]');
 if m.status<>'UPCOMING' then open_reasons:=open_reasons||jsonb_build_array(jsonb_build_object('code','MATCH_NOT_UPCOMING'));end if;
 if m.scoring_locked then open_reasons:=open_reasons||jsonb_build_array(jsonb_build_object('code','MATCH_LOCKED'));end if;
 if active>0 then open_reasons:=open_reasons||jsonb_build_array(jsonb_build_object('code','ACCESS_NOT_REVOKED'));end if;
 if leases>0 then open_reasons:=open_reasons||jsonb_build_array(jsonb_build_object('code','ACTIVE_SCORING_LEASE'));end if;
 if pair_count<>24 or unique_count<>24 or roster_count<>24 then open_reasons:=open_reasons||jsonb_build_array(jsonb_build_object('code','ROUND_PLAYER_COVERAGE_INVALID'));end if;
 resume_reasons:=coalesce(resume->'reasons','[]');
 item:=jsonb_build_object('matchId',m.match_id,'status',m.status,'locked',m.scoring_locked,'accessActive',active>0,'activeLeases',leases,
 'matchRevision',m.match_revision,'permissionRevision',m.permission_revision,'snapshotId',m.scoring_snapshot_id,
 'ready',coalesce((initial->>'ready')::boolean,false),'openReasons',open_reasons,'resumeReasons',resume_reasons,
 'resumeReady',coalesce((resume->>'ready')::boolean,false));
 matches:=matches||jsonb_build_array(item);
 manifest:=manifest||jsonb_build_array(jsonb_build_object('match',to_jsonb(m),'permissions',perms,'detail',detail,'activeLeases',leases,
 'snapshot',(select to_jsonb(s) from scoring_authority.scoring_snapshots s where snapshot_id=m.scoring_snapshot_id),
 'participants',(select jsonb_agg(to_jsonb(p) order by team_side,player_slot) from scoring_authority.match_participants p where match_id=m.match_id),
 'holes',(select jsonb_agg(to_jsonb(h) order by hole_number) from scoring_authority.match_holes h where match_id=m.match_id),
 'scores',(select jsonb_agg(to_jsonb(h) order by hole_number) from scoring_authority.hole_scores h where match_id=m.match_id),
 'history',(select jsonb_agg(to_jsonb(h) order by next_match_revision) from scoring_authority.score_revision_history h where match_id=m.match_id),
 'mutations',(select jsonb_agg(to_jsonb(h) order by next_match_revision,mutation_key) from scoring_authority.score_mutations h where match_id=m.match_id),
 'finals',(select jsonb_agg(to_jsonb(f) order by snapshot_id) from scoring_authority.finalized_scorecard_snapshots f where match_id=m.match_id)));
 end loop;
 actions:='{}';
 foreach op in array array['OPEN','LOCK','RESUME'] loop
 targets:='[]';failures:='[]';
 if op<>'LOCK' and jsonb_array_length(matches)<>expected then failures:=failures||jsonb_build_array(jsonb_build_object('matchId',null,'code','ROUND_MATCH_COUNT_INVALID'));end if;
 for item in select value from jsonb_array_elements(matches) loop
 if op='OPEN' or (item->>'status'='LIVE' and (op='LOCK' or (item->>'locked')::boolean)) then
 targets:=targets||jsonb_build_array(item->>'matchId');
 if op<>'LOCK' then
 for reason in select value from jsonb_array_elements(case op when 'OPEN' then item->'openReasons' else item->'resumeReasons' end) loop
 failures:=failures||jsonb_build_array(jsonb_build_object('matchId',item->>'matchId','code',reason->>'code'));end loop;
 if op='RESUME' and not (item->>'resumeReady')::boolean and jsonb_array_length(item->'resumeReasons')=0 then failures:=failures||jsonb_build_array(jsonb_build_object('matchId',item->>'matchId','code','RESUME_NOT_READY'));end if;
 end if;
 end if;
 end loop;
 if jsonb_array_length(targets)=0 then failures:=failures||jsonb_build_array(jsonb_build_object('matchId',null,'code','NO_APPLICABLE_MATCHES'));end if;
 actions:=actions||jsonb_build_object(op,jsonb_build_object('allowed',jsonb_array_length(failures)=0,'targets',targets,'failures',failures));
 end loop;
 return jsonb_build_object('round',target_round,'expectedMatches',expected,'format',authority#>>'{round,format}','handicapRevision',authority->'handicapRevision',
 'fingerprint',encode(extensions.digest(jsonb_build_object('authority',authority,'matches',manifest)::text,'sha256'),'hex'),
 'matches',matches,'actions',actions,'summary',jsonb_build_object('total',jsonb_array_length(matches),
 'ready',(select count(*) from jsonb_array_elements(matches) x where (x->>'ready')::boolean),
 'upcoming',(select count(*) from jsonb_array_elements(matches)x where x->>'status'='UPCOMING'),
 'live',(select count(*) from jsonb_array_elements(matches)x where x->>'status'='LIVE'),
 'final',(select count(*) from jsonb_array_elements(matches)x where x->>'status'='FINAL'),
 'accessActive',(select count(*) from jsonb_array_elements(matches)x where (x->>'accessActive')::boolean),
 'locked',(select count(*) from jsonb_array_elements(matches)x where (x->>'locked')::boolean),
 'activeLeases',(select coalesce(sum((x->>'activeLeases')::integer),0) from jsonb_array_elements(matches)x)));
end$$;

create function public.read_production_round_scoring_v1(input jsonb) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,production_control,scoring_authority as $$
declare state jsonb;begin
 perform production_control.assert_production_scoring_runtime(input);
 perform production_control.assert_production_scoring_actor(input,true);
 if input->>'tournament_id' is distinct from '2026' then raise exception 'ROUND_SCOPE_INVALID';end if;
 state:=production_control.round_scoring_state_v1((input->>'round')::integer);
 return jsonb_build_object('ok',true,'data',state||jsonb_build_object('history',(select coalesce(jsonb_agg(receipt order by created_at desc),'[]') from (select receipt,created_at from production_control.round_scoring_receipts_v1 where round_number=(input->>'round')::integer order by created_at desc limit 20) h)));
end$$;

create function public.mutate_production_round_scoring_v1(input jsonb) returns jsonb
 language plpgsql security definer set search_path=pg_catalog,production_control,scoring_authority as $$
declare op text:=input->>'operation';rid integer:=(input->>'round')::integer; oid uuid:=(input->>'operation_id')::uuid;
 before_value jsonb;after_value jsonb;receipt_value jsonb; saved production_control.round_scoring_receipts_v1%rowtype;
 request_hash_value text; mid text; step text; response jsonb; child jsonb;m scoring_authority.matches%rowtype;fail_code text;
begin
 perform production_control.assert_production_scoring_runtime(input);
 perform production_control.assert_production_scoring_actor(input,true);
 if input->>'tournament_id' is distinct from '2026' or rid not between 1 and 3 or rid is null or oid is null or op not in('OPEN','LOCK','RESUME') or op is null
 or coalesce(input->>'expected_fingerprint','') !~ '^[a-f0-9]{64}$' or input ?| array['matches','match_ids','matchIds','targets','match_id'] then raise exception 'ROUND_INPUT_INVALID';end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'ROUND_REFRESH_REQUIRED';end if;
 perform set_config('lock_timeout','5s',true);
 -- Same governance/setup ordering as existing access-granting controls. All round
 -- rows are locked before the first transition. Lease table lock fences phantom
 -- admission; it does not revoke/delete or manufacture any lease.
 perform pg_advisory_xact_lock(hashtextextended('production-access-governance-v1:2026',0));
 perform pg_advisory_xact_lock(hashtextextended('production-tournament-setup-v1:2026',0));
 lock table scoring_authority.scoring_ingress_leases in share row exclusive mode;
 perform match_id from scoring_authority.matches where tournament_id='2026' and round_number=rid order by match_id for update;
 perform production_control.assert_production_scoring_runtime(input);
 perform production_control.assert_production_scoring_actor(input,true);
 before_value:=production_control.round_scoring_state_v1(rid);
 request_hash_value:=encode(extensions.digest(jsonb_build_object('operation',op,'round',rid,'expected',input->>'expected_fingerprint','actor',input->'authorization')::text,'sha256'),'hex');
 select * into saved from production_control.round_scoring_receipts_v1 where operation_id=oid;
 if found then
 if saved.request_hash<>request_hash_value then return jsonb_build_object('ok',false,'code','ROUND_IDEMPOTENCY_CONFLICT');end if;
 if saved.after_fingerprint<>before_value->>'fingerprint' then return jsonb_build_object('ok',false,'code','ROUND_RECEIPT_STATE_CHANGED');end if;
 return jsonb_build_object('ok',true,'idempotent',true,'receipt',saved.receipt,'data',before_value);
 end if;
 if before_value->>'fingerprint'<>input->>'expected_fingerprint' then return jsonb_build_object('ok',false,'code','ROUND_STATE_CHANGED','data',before_value);end if;
 if not (before_value#>>array['actions',op,'allowed'])::boolean then return jsonb_build_object('ok',false,'code','ROUND_PREFLIGHT_FAILED','failures',before_value#>array['actions',op,'failures'],'data',before_value,'matchesChanged',0);end if;
 -- A subtransaction rolls back earlier match calls, histories and outbox rows
 -- even when a later existing control returns a denial rather than throwing.
 begin
 for mid in select jsonb_array_elements_text(before_value#>array['actions',op,'targets']) loop
 foreach step in array (case op when 'OPEN' then array['MARK_LIVE','ACCESS_ACTIVATE'] when 'LOCK' then array['SCORING_LOCK'] else array['SCORING_UNLOCK'] end) loop
 select * into strict m from scoring_authority.matches where match_id=mid;
 child:=input||jsonb_build_object('operation',step,'match_id',mid,'mutation_key','round:'||oid::text||':'||mid||':'||step,'expected_match_revision',m.match_revision,
 'authorization',(input->'authorization')||jsonb_build_object('match_id',mid,'permission_revision',m.permission_revision));
 response:=public.mutate_production_match_control(child);
 if response->>'ok' is distinct from 'true' then fail_code:=response->>'code';raise exception using errcode='P0001',message='ROUND_TARGET_DENIED';end if;
 end loop;end loop;
 after_value:=production_control.round_scoring_state_v1(rid);
 receipt_value:=jsonb_build_object('operationId',oid,'tournament','2026','round',rid,'operation',op,'director',input#>>'{authorization,player_id}',
 'affectedMatches',before_value#>array['actions',op,'targets'],'before',before_value->'matches','after',after_value->'matches','beforeFingerprint',before_value->'fingerprint','afterFingerprint',after_value->'fingerprint',
 'handicapRevision',before_value->'handicapRevision','at',clock_timestamp(),'result','SUCCESS','failures',0);
 insert into production_control.round_scoring_receipts_v1 values(oid,'2026',rid,op,input#>>'{authorization,player_id}',request_hash_value,before_value->>'fingerprint',after_value->>'fingerprint',receipt_value,clock_timestamp());
 exception when others then
 return jsonb_build_object('ok',false,'code','ROUND_TRANSACTION_ABORTED','failures',jsonb_build_array(jsonb_build_object('matchId',mid,'code',coalesce(fail_code,'ROUND_WRITE_FAILED'))),'matchesChanged',0);
 end;
 return jsonb_build_object('ok',true,'idempotent',false,'receipt',receipt_value,'data',after_value);
end$$;
revoke all on function production_control.reject_round_scoring_receipt_mutation_v1(),production_control.round_scoring_state_v1(integer),public.read_production_round_scoring_v1(jsonb),public.mutate_production_round_scoring_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_production_round_scoring_v1(jsonb),public.mutate_production_round_scoring_v1(jsonb) to service_role;
commit;
