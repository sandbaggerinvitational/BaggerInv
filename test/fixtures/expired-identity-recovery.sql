-- Disposable synthetic substrate. No production values or network transport.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions; create extension pgcrypto with schema extensions;
create schema participant_identity; create schema scoring_authority; create schema production_control;
create table auth.users(id uuid primary key,email text,phone text,phone_change text,email_confirmed_at timestamptz,
 phone_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_app_meta_data jsonb,created_at timestamptz default now());
create table production_control.release_attempts_v1(state text);
create table production_control.resource_scope(scope_key text,google_workbook_id text);
create table production_control.tournament_owner_capabilities_v1(tournament_id text,player_id text,auth_user_id uuid,status text,revoked_at timestamptz);
create table production_control.player_governance_profiles_v1(player_id text,global_status text);
create table scoring_authority.players(player_id text primary key);
create table scoring_authority.tournament_players(tournament_id text,player_id text,participation_status text);
create table participant_identity.participant_identity_contacts(tournament_id text,player_id text,email_normalized text,
 identity_active boolean,configuration_revision bigint,source_workbook_id text);
create table participant_identity.identity_context_revisions(tournament_id text,context_revision bigint,configuration_fingerprint text);
create table participant_identity.identity_config_import_runs(tournament_id text,configuration_revision bigint,source_fingerprint text,status text,approved_at timestamptz);
create table participant_identity.user_player_links(link_id uuid primary key default extensions.gen_random_uuid(),auth_user_id uuid unique references auth.users(id) on delete cascade,
 player_id text,status text,link_revision bigint default 1,link_method text,email_identity_hash text,revoked_at timestamptz,linked_at timestamptz,linked_by text,updated_at timestamptz default now());
create table participant_identity.participant_auth_identifiers(identifier_id uuid primary key default extensions.gen_random_uuid(),auth_user_id uuid references auth.users(id) on delete cascade,
 player_id text,identifier_type text,normalized_value_private text,status text,revision bigint default 1,verified_at timestamptz,verification_source text,
 source_tournament_id text,source_configuration_revision bigint,revoked_at timestamptz,updated_by text,updated_at timestamptz default now());
create table participant_identity.tournament_roles(tournament_id text,auth_user_id uuid references auth.users(id) on delete cascade,role text,role_active boolean,
 revoked_at timestamptz,revoked_by text,granted_by text,role_revision bigint default 1,updated_at timestamptz default now(),primary key(tournament_id,auth_user_id,role));
create table participant_identity.participant_auth_otp_attempts(request_id uuid primary key default extensions.gen_random_uuid(),tournament_id text default '2026',player_id text,
 auth_user_id uuid,email_identity_hash text,client_request_hash text,status text,safe_reason text,verification_type text,
 requested_at timestamptz default now(),sent_at timestamptz,verified_at timestamptz,updated_at timestamptz default now(),verification_duration_ms integer);
create table participant_identity.production_participant_enrollment_claims(claim_id uuid default extensions.gen_random_uuid(),tournament_id text,player_id text,
 auth_user_id uuid,email_identity_hash text,source_configuration_revision bigint,status text,client_request_hash text,expires_at timestamptz default now()+interval '10 minutes');
create table participant_identity.player_approved_phones_v1(tournament_id text,player_id text,phone_e164 text,status text,phone_revision bigint,verified_at timestamptz);
create table participant_identity.account_deletion_requests_v1(auth_user_id uuid,status text);
create table participant_identity.identity_audit_events(event_type text,tournament_id text,auth_user_id uuid,player_id text,actor_name text,request_id text,safe_metadata jsonb);
-- Runtime dependencies are isolated fixture gates; production uses installed
-- cutover/owner authority. Test their denial and the actual new function ACLs.
create function production_control.assert_production_participant_identity_cutover() returns production_control.resource_scope
language plpgsql as $$ declare r production_control.resource_scope; begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'PRODUCTION_SERVICE_ROLE_REQUIRED'; end if;
 select * into r from production_control.resource_scope; if not found then raise exception 'CUTOVER_DISABLED'; end if;return r;end $$;
create function production_control.assert_access_governance_owner_v1(t text,p text,u uuid) returns void language plpgsql as $$begin
 if not exists(select 1 from production_control.tournament_owner_capabilities_v1 where tournament_id=t and player_id=p and auth_user_id=u and status='ACTIVE' and revoked_at is null) then raise exception 'ACTIVE_OWNER_REQUIRED'; end if;end $$;
create function production_control.access_governance_global_status_v1(p text) returns text language sql as $$select global_status from production_control.player_governance_profiles_v1 where player_id=p$$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('a0000000-0000-4000-8000-000000000001','hm@fixture.local',now()-interval '2 hours','{"player_id":"HM01","tournament_id":"2026","provisioning_scope":"production_controlled_first_login"}'),
 ('a0000000-0000-4000-8000-000000000002','nj@fixture.local',now()-interval '2 hours','{"player_id":"NJ01","tournament_id":"2026","provisioning_scope":"production_controlled_first_login"}'),
 ('a0000000-0000-4000-8000-000000000003','owner@fixture.local',now(),'{}');
insert into production_control.resource_scope values('BAGGER_INV_PRODUCTION','fixture-workbook');
insert into production_control.tournament_owner_capabilities_v1 values('2026','CB01','a0000000-0000-4000-8000-000000000003','ACTIVE',null);
insert into scoring_authority.players values('HM01'),('NJ01');
insert into scoring_authority.tournament_players values('2026','HM01','ACTIVE'),('2026','NJ01','ACTIVE');
insert into production_control.player_governance_profiles_v1 values('HM01','ACTIVE'),('NJ01','ACTIVE');
insert into participant_identity.participant_identity_contacts values('2026','HM01','hm@fixture.local',true,25,'fixture-workbook'),('2026','NJ01','nj@fixture.local',true,25,'fixture-workbook');
insert into participant_identity.identity_context_revisions values('2026',25,repeat('b',64));
insert into participant_identity.identity_config_import_runs values('2026',25,repeat('b',64),'APPROVED',now());
insert into participant_identity.user_player_links(auth_user_id,player_id,status,link_method,email_identity_hash)
 select id,raw_app_meta_data->>'player_id','PENDING','PRODUCTION_CONTROLLED_FIRST_LOGIN',encode(extensions.digest(email,'sha256'),'hex') from auth.users where email<>'owner@fixture.local';
insert into participant_identity.participant_auth_identifiers(auth_user_id,player_id,identifier_type,normalized_value_private,status,source_tournament_id,source_configuration_revision)
 select id,raw_app_meta_data->>'player_id','EMAIL',email,'VERIFICATION_PENDING','2026',25 from auth.users where email<>'owner@fixture.local';
insert into participant_identity.production_participant_enrollment_claims(tournament_id,player_id,auth_user_id,email_identity_hash,source_configuration_revision,status)
 select '2026',raw_app_meta_data->>'player_id',id,encode(extensions.digest(email,'sha256'),'hex'),25,'CONSUMED' from auth.users where email<>'owner@fixture.local';
insert into participant_identity.player_approved_phones_v1 values('2026','HM01','+12025550101','APPROVED',1,null),('2026','NJ01','+12025550102','APPROVED',1,null);
insert into participant_identity.participant_auth_otp_attempts(request_id,player_id,auth_user_id,email_identity_hash,status,safe_reason,verification_type,requested_at,sent_at)
 select case when raw_app_meta_data->>'player_id'='HM01' then 'b0000000-0000-4000-8000-000000000001' else 'b0000000-0000-4000-8000-000000000002' end::uuid,
 raw_app_meta_data->>'player_id',id,encode(extensions.digest(email,'sha256'),'hex'),'SENT','DELIVERY_ACCEPTED','signup',now()-interval '3 hours',now()-interval '3 hours'+interval '1 second' from auth.users where email<>'owner@fixture.local';
