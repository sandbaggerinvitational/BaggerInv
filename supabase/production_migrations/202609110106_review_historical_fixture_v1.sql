-- STEP 2K.1R: identity and historical read capability are independent.
-- Local source only. Creates no entitlement, fixture, match or account.
begin;
alter table participant_identity.review_access_v1 alter column final_match_id drop not null;
create or replace function public.read_native_review_context_v1(target_auth_user_id uuid,target_tournament_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
   raise exception using errcode='42501',message='SERVICE_AUTHORITY_REQUIRED';
 end if;
 select jsonb_build_object('kind','observer','authUserId',r.auth_user_id,'active',true,
   'contextRevision',r.revision,'expiresAt',r.expires_at,'admin',false,'scoring',false,
   'tournament',jsonb_build_object('id',t.tournament_id,'name',t.name,'year',t.tournament_year)) into result
 from participant_identity.review_access_v1 r
 join auth.users u on u.id=r.auth_user_id and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null
 join scoring_authority.tournaments t on t.tournament_id=r.tournament_id
 where r.auth_user_id=target_auth_user_id and r.tournament_id=target_tournament_id
 and r.active and r.expires_at>now()
 and not exists(select 1 from participant_identity.user_player_links l where l.auth_user_id=r.auth_user_id)
 and not exists(select 1 from participant_identity.tournament_roles a where a.auth_user_id=r.auth_user_id)
 and not exists(select 1 from production_control.director_entitlements a where a.auth_user_id=r.auth_user_id and a.status='ACTIVE')
 and not exists(select 1 from production_control.tournament_owner_capabilities_v1 a where a.auth_user_id=r.auth_user_id and a.status='ACTIVE');
 if result is null then return jsonb_build_object('ok',false,'code','REVIEW_ACCESS_UNAVAILABLE'); end if;
 return jsonb_build_object('ok',true,'data',result);
end;
$$;

-- Remove only the obsolete fixture dependency from replacement-credential safety.
-- Owner/final-admin safeguards and all identity checks remain intact.
do $$
declare definition text; obsolete text := E'        join scoring_authority.matches m on m.match_id = other.final_match_id\n          and m.tournament_id = other.tournament_id and m.status = ''FINAL'' and m.scorecard_complete\n';
begin
 definition:=pg_get_functiondef('participant_identity.account_deletion_status_v1(uuid)'::regprocedure);
 if strpos(definition,obsolete)=0 then raise exception 'REVIEW_DELETION_BOUNDARY_CHANGED'; end if;
 execute replace(definition,obsolete,'');
end;
$$;

create table participant_identity.review_history_fixtures_v1 (
 auth_user_id uuid primary key references participant_identity.review_access_v1(auth_user_id) on delete cascade,
 tournament_id text not null,
 tournament_year integer not null check(tournament_year between 2017 and 2025),
 revision_id uuid not null references scoring_authority.completed_history_revisions(revision_id),
 match_id text not null check(length(match_id) between 1 and 200),
 active boolean not null default false,
 revision bigint not null default 1 check(revision>0),
 changed_by text not null check(length(btrim(changed_by))>0),
 changed_at timestamptz not null default now(),
 foreign key(revision_id,match_id) references scoring_authority.completed_history_matches(revision_id,match_id)
);
alter table participant_identity.review_history_fixtures_v1 enable row level security;
revoke all on participant_identity.review_history_fixtures_v1 from public,anon,authenticated,service_role;
create function participant_identity.advance_review_history_fixture_v1()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.auth_user_id is distinct from old.auth_user_id then raise exception 'REVIEW_IDENTITY_IMMUTABLE'; end if;
 new.revision:=old.revision+1; new.changed_at:=clock_timestamp(); return new;
end;
$$;
create trigger advance_review_history_fixture_v1 before update on participant_identity.review_history_fixtures_v1
for each row execute function participant_identity.advance_review_history_fixture_v1();
revoke all on function participant_identity.advance_review_history_fixture_v1() from public,anon,authenticated,service_role;

-- This lookup is separate from OTP/certification. Unavailable history returns no capability.
create function public.read_native_review_history_fixture_v1(target_auth_user_id uuid,target_tournament_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
 raise exception using errcode='42501',message='SERVICE_AUTHORITY_REQUIRED'; end if;
 if public.read_native_review_context_v1(target_auth_user_id,target_tournament_id)->>'ok' is distinct from 'true' then
 return jsonb_build_object('ok',false,'code','REVIEW_FIXTURE_UNAVAILABLE'); end if;
 select jsonb_build_object('tournamentId',f.tournament_id,'year',f.tournament_year,
 'revisionId',f.revision_id,'matchId',f.match_id,'bindingRevision',f.revision) into result
 from participant_identity.review_history_fixtures_v1 f
 join scoring_authority.completed_history_current_revisions r on r.revision_id=f.revision_id
  and r.tournament_id=f.tournament_id and r.tournament_year=f.tournament_year
 join scoring_authority.completed_history_matches m on m.revision_id=f.revision_id and m.match_id=f.match_id and m.tournament_id=f.tournament_id
 join scoring_authority.completed_history_course_appearances c on c.revision_id=m.revision_id and c.appearance_id=m.course_appearance_id
 where f.auth_user_id=target_auth_user_id and f.active and m.lifecycle='FINAL' and m.completion_state='LEGACY_FINAL'
 and m.scorecard_coverage='COMPLETE' and jsonb_array_length(c.hole_definitions)=18
 and m.format in ('SI','BB','SC')
 and (select count(*) from scoring_authority.completed_history_match_participants p where p.revision_id=m.revision_id and p.match_id=m.match_id)=case when m.format='SI' then 2 else 4 end
 and (select count(*) from scoring_authority.completed_history_scorecards s where s.revision_id=m.revision_id and s.match_id=m.match_id)=case when m.format='BB' then 4 else 2 end
 and not exists(select 1 from scoring_authority.completed_history_scorecards s where s.revision_id=m.revision_id and s.match_id=m.match_id
   and (s.coverage_status<>'COMPLETE' or s.recorded_holes<>18 or jsonb_array_length(s.hole_values)<>18
    or exists(select 1 from jsonb_array_elements(s.hole_values) h where jsonb_typeof(h)<>'number' or h::text !~ '^[0-9]+$' or (h::text)::numeric not between 1 and 20)));
 if result is null then return jsonb_build_object('ok',false,'code','REVIEW_FIXTURE_UNAVAILABLE'); end if;
 return jsonb_build_object('ok',true,'data',result);
end;
$$;
revoke all on function public.read_native_review_history_fixture_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.read_native_review_history_fixture_v1(uuid,text) to service_role;
commit;
