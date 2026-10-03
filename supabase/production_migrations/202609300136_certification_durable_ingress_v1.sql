-- Owner-approved Certification-only durable ingress. CLI scaffold 20260930184220.
-- Production provider/lease schema and APIs retain their original semantics.
begin;
-- Serialize installation with all admitted canonical work. An old PL/pgSQL
-- invocation can already be waiting on this fence, so advance the existing
-- Certification admission token as well; its old token must fail on resume.
select pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
with advanced as (
 update production_control.certification_admission_v1 set admission_revision=admission_revision+1
 returning resource_id,governance_tournament_id,admission_revision
)
insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,result,details)
select 'CERTIFICATION_INGRESS_PROTOCOL_INSTALLED','CERTIFICATION',governance_tournament_id,current_user,'SUCCEEDED',
 jsonb_build_object('resource_id',resource_id,'admission_revision',admission_revision,'reason','Durable ingress installation fences predecessor invocation tokens')
from advanced;

create table production_control.certification_ingress_generations_v1 (
 resource_id text not null references production_control.canonical_resource_v1(resource_id),
 generation_id uuid not null default extensions.gen_random_uuid(),
 resource_class text not null default 'CERTIFICATION' check(resource_class='CERTIFICATION'),
 tournament_id text not null references scoring_authority.tournaments(tournament_id),
 authority_epoch_id uuid not null references scoring_authority.authority_epochs(epoch_id),
 pointer_revision bigint not null check(pointer_revision>0),
 revision bigint not null default 1 check(revision>0),
 state text not null default 'OPEN' check(state in('OPEN','CLOSING','CLOSED')),
 predecessor_generation_id uuid,
 high_watermark bigint check(high_watermark>=0),
 closing_revision bigint,
 lease_fingerprint text check(lease_fingerprint~'^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),closed_at timestamptz,
 primary key(resource_id,generation_id),unique(generation_id),
 foreign key(resource_id,resource_class) references production_control.canonical_resource_v1(resource_id,resource_class),
 foreign key(resource_id,predecessor_generation_id) references production_control.certification_ingress_generations_v1(resource_id,generation_id),
 check((state='OPEN' and high_watermark is null and closing_revision is null and closed_at is null)
    or(state='CLOSING' and high_watermark is not null and closing_revision is not null and closed_at is null)
    or(state='CLOSED' and high_watermark is not null and closing_revision is not null and closed_at is not null and lease_fingerprint is not null))
);
create unique index certification_ingress_current_generation_v1 on production_control.certification_ingress_generations_v1(resource_id) where state in('OPEN','CLOSING');
create table production_control.certification_ingress_leases_v1 (
 lease_id uuid primary key default extensions.gen_random_uuid(),
 admission_sequence bigint generated always as identity unique,
 resource_id text not null,admission_generation_id uuid not null,
 tournament_id text not null,authority_epoch_id uuid not null,
 operation_id text not null,operation_request_id text not null check(operation_request_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
 target_key text not null,match_id text,domain_action text,
 actor_auth_user_id uuid not null,actor_player_id text not null,actor_role text not null check(actor_role in('PLAYER','DIRECTOR')),
 request_hash text not null check(request_hash~'^[0-9a-f]{64}$'),
 context_token text not null check(context_token~'^[0-9a-f]{64}$'),
 admission_context jsonb not null check(jsonb_typeof(admission_context)='object'),
 predecessor_auction_revision bigint check(predecessor_auction_revision>=0),
 state text not null default 'ADMITTED' check(state in('ADMITTED','UNKNOWN','COMMITTED','NOT_COMMITTED')),
 result jsonb,committed_generation_revision bigint,
 admitted_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 resolved_at timestamptz,
 foreign key(resource_id,admission_generation_id) references production_control.certification_ingress_generations_v1(resource_id,generation_id),
 unique(resource_id,operation_id,target_key,operation_request_id),
 check((state in('ADMITTED','UNKNOWN') and result is null and resolved_at is null and committed_generation_revision is null)
  or(state='COMMITTED' and jsonb_typeof(result)='object' and resolved_at is not null and committed_generation_revision is not null)
  or(state='NOT_COMMITTED' and jsonb_typeof(result)='object' and resolved_at is not null and committed_generation_revision is null))
);
create index certification_ingress_generation_sequence_v1 on production_control.certification_ingress_leases_v1(resource_id,admission_generation_id,admission_sequence);
create index certification_ingress_unresolved_v1 on production_control.certification_ingress_leases_v1(resource_id,admission_generation_id,state) where state in('ADMITTED','UNKNOWN');
-- The canonical score receipt key is shared by scoring and match control.
-- Operation identity remains part of the request hash, never a second namespace.
create unique index certification_ingress_match_mutation_v1
 on production_control.certification_ingress_leases_v1(resource_id,target_key,operation_request_id)
 where operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL');
create table production_control.certification_ingress_execution_v1 (
 backend_pid integer not null,transaction_id xid8 not null,lease_id uuid not null references production_control.certification_ingress_leases_v1(lease_id),
 primary key(backend_pid,transaction_id)
);
alter table production_control.certification_ingress_generations_v1 enable row level security;
alter table production_control.certification_ingress_leases_v1 enable row level security;
alter table production_control.certification_ingress_execution_v1 enable row level security;
revoke all on production_control.certification_ingress_generations_v1,production_control.certification_ingress_leases_v1,production_control.certification_ingress_execution_v1 from public,anon,authenticated,service_role;
revoke all on sequence production_control.certification_ingress_leases_v1_admission_sequence_seq from public,anon,authenticated,service_role;

create unique index certification_ingress_successor_v1 on production_control.certification_ingress_generations_v1(resource_id,predecessor_generation_id) where predecessor_generation_id is not null;
create function production_control.guard_certification_ingress_generation_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='DELETE'or(to_jsonb(new)-array['state','revision','high_watermark','closing_revision','lease_fingerprint','closed_at'])
  is distinct from(to_jsonb(old)-array['state','revision','high_watermark','closing_revision','lease_fingerprint','closed_at'])
  or(old.state='CLOSED'and to_jsonb(new)is distinct from to_jsonb(old))
  or(old.state='CLOSING'and(new.state not in('CLOSING','CLOSED')or new.high_watermark is distinct from old.high_watermark
   or new.closing_revision is distinct from old.closing_revision or new.revision<>old.revision))
  or(old.state='OPEN'and(new.state<>'CLOSING'or new.revision<>old.revision+1 or new.closing_revision<>new.revision))then
  raise exception using errcode='55000',message='CERTIFICATION_INGRESS_GENERATION_IMMUTABLE';end if;
 return new;
end;$$;
create trigger guard_certification_ingress_generation_v1 before update or delete on production_control.certification_ingress_generations_v1
 for each row execute function production_control.guard_certification_ingress_generation_v1();

create function production_control.certification_ingress_required_v1(operation_id text)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(operation_id=any(array['SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH',
 'DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS','DIRECTOR.MATCH_CONTROL','DIRECTOR.SAVE_NET_SKINS_ENTRIES',
 'DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION']),false)
$$;
create function production_control.initialize_certification_ingress_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare p production_control.current_tournament_pointer_v1%rowtype;
begin
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=new.resource_id;
 insert into production_control.certification_ingress_generations_v1(resource_id,tournament_id,authority_epoch_id,pointer_revision)
 values(new.resource_id,p.tournament_id,new.authority_epoch_id,p.pointer_revision);
 return new;
end;$$;
create trigger initialize_certification_ingress_v1 after insert on production_control.certification_admission_v1
 for each row execute function production_control.initialize_certification_ingress_v1();
-- Upgrade only existing truthful Certification resources; never synthesize Production authority.
insert into production_control.certification_ingress_generations_v1(resource_id,tournament_id,authority_epoch_id,pointer_revision)
 select a.resource_id,p.tournament_id,a.authority_epoch_id,p.pointer_revision
 from production_control.certification_admission_v1 a join production_control.current_tournament_pointer_v1 p on p.scope_key=a.resource_id;

create function production_control.guard_certification_ingress_lease_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_HISTORY_IMMUTABLE';end if;
 if tg_op='UPDATE' and ((to_jsonb(new)-array['state','result','committed_generation_revision','resolved_at'])
  is distinct from (to_jsonb(old)-array['state','result','committed_generation_revision','resolved_at'])
  or(old.state in('COMMITTED','NOT_COMMITTED')and to_jsonb(new)is distinct from to_jsonb(old))
  or(old.state='UNKNOWN'and new.state='ADMITTED'))then
  raise exception using errcode='55000',message='CERTIFICATION_INGRESS_OUTCOME_IMMUTABLE';end if;
 return new;
end;$$;
create trigger guard_certification_ingress_lease_v1 before update or delete on production_control.certification_ingress_leases_v1
 for each row execute function production_control.guard_certification_ingress_lease_v1();

-- Recovery binds the current registered deployment, but not current write
-- admission/current tournament. The original lease fixes the historical target.
create function production_control.certification_ingress_recovery_resource_v1(input jsonb)
returns production_control.canonical_resource_v1 language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;a production_control.certification_admission_v1%rowtype;
begin
 perform production_control.assert_production_service_role();
 perform pg_advisory_xact_lock_shared(production_control.scoring_admission_lock_key());
 select * into strict r from production_control.canonical_resource_v1 where singleton for share;
 select * into strict a from production_control.certification_admission_v1 where resource_id=r.resource_id for share;
 if input->>'contract_version' is distinct from 'certification-runtime-v1'
  or r.resource_class<>'CERTIFICATION' or r.database_name<>current_database()
  or exists(select 1 from production_control.resource_scope)or exists(select 1 from production_control.cutover_activation_state)
  or input#>>'{resource,resource_class}' is distinct from r.resource_class
  or input#>>'{resource,resource_id}'is distinct from r.resource_id
  or input#>>'{resource,installation_id}'is distinct from r.installation_id::text
  or input#>>'{resource,project_ref}'is distinct from r.project_ref or input#>>'{resource,project_url}'is distinct from r.project_url
  or input#>>'{resource,schema_contract}'is distinct from r.schema_contract or input#>>'{resource,schema_digest}'is distinct from r.schema_digest
  or input#>>'{resource,registration_revision}'is distinct from r.registration_revision::text
  or input#>>'{resource,manifest_digest}'is distinct from r.manifest_digest
  or input#>>'{deployment,vercel_team_id}'is distinct from r.vercel_team_id
  or input#>>'{deployment,vercel_project_id}'is distinct from r.vercel_project_id
  or input#>>'{deployment,git_branch}'is distinct from a.git_branch
  or input#>>'{deployment,deployment_class}'is distinct from a.deployment_class
  or input#>>'{deployment,release_commit}'is distinct from a.release_commit
  or input#>>'{deployment,deployment_id}'is distinct from a.deployment_id
  or input#>>'{deployment,deployment_origin}'is distinct from a.deployment_origin then
   raise exception using errcode='42501',message='CERTIFICATION_INGRESS_RESOURCE_DENIED';end if;
 return r;
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_SCHEMA_REQUIRED';
end;$$;

create function production_control.assert_certification_ingress_recovery_actor_v1(input jsonb,target_tournament text,require_director boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare actor text:=input#>>'{authorization,player_id}';role_name text:=input#>>'{authorization,role}';
 auth_id uuid:=(input#>>'{authorization,auth_user_id}')::uuid;
begin
 if actor is null or auth_id is null or role_name is null or role_name not in('PLAYER','DIRECTOR')
  or(require_director and role_name<>'DIRECTOR')or not exists(
   select 1 from participant_identity.user_player_links l
   join auth.users u on u.id=l.auth_user_id and u.email_confirmed_at is not null
   join participant_identity.participant_auth_identifiers v on v.auth_user_id=l.auth_user_id and v.player_id=l.player_id
    and v.identifier_type='EMAIL'and v.status='VERIFIED'and v.revoked_at is null
   join participant_identity.tournament_roles r on r.tournament_id=target_tournament and r.auth_user_id=l.auth_user_id
    and r.role=case when role_name='DIRECTOR'then'DIRECTOR'else'PARTICIPANT'end and r.role_active and r.revoked_at is null
   join scoring_authority.tournament_players t on t.tournament_id=target_tournament and t.player_id=l.player_id and t.participation_status='ACTIVE'
   where l.auth_user_id=auth_id and l.player_id=actor and l.status='ACTIVE'and l.revoked_at is null)
  or(role_name='DIRECTOR'and not exists(select 1 from production_control.director_entitlements e
   where e.auth_user_id=auth_id and e.player_id=actor and e.tournament_id=target_tournament
    and e.role in('DIRECTOR','OWNER')and e.status='ACTIVE'and e.revoked_at is null))then
   raise exception using errcode='42501',message='CERTIFICATION_INGRESS_RECOVERY_AUTHORIZATION_REQUIRED';end if;
 if target_tournament<>'2026'then
  -- Installed by the separately reviewed annual identity extension. Until then,
  -- future-target recovery fails closed; it cannot borrow current write gates.
  perform production_control.assert_certification_historical_identity_v1(target_tournament,actor,auth_id,role_name);
 end if;
end;$$;

create function production_control.certification_ingress_identity_v1(input jsonb,recovery boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare op text:=input->>'operation_id';id text:=input->>'operation_request_id';target text:=input#>>'{authorization,tournament_id}';
 m text:=input#>>'{payload,match_id}';actor text:=input#>>'{authorization,player_id}';role_name text:=input#>>'{authorization,role}';
 auth_id uuid:=(input#>>'{authorization,auth_user_id}')::uuid;
begin
 if not production_control.certification_ingress_required_v1(op)or id is null or id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
  or target is null or target!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' or actor is null or auth_id is null
  or role_name not in('PLAYER','DIRECTOR')or role_name is null then
   raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';end if;
 if(op like 'SCORING.%'or op='DIRECTOR.MATCH_CONTROL')and(m is null or m!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$')then
  raise exception using errcode='22023',message='CERTIFICATION_INGRESS_MATCH_REQUIRED';end if;
 if op like 'DIRECTOR.%'and id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'then
  raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';end if;
 if op like 'SCORING.%'and input#>>'{authorization,match_id}'is distinct from m then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_MATCH_DENIED';end if;
 if recovery then perform production_control.assert_certification_ingress_recovery_actor_v1(input,target,op like 'DIRECTOR.%'or op='SCORING.REOPEN_MATCH');
 elsif target='2026'then perform production_control.assert_production_scoring_actor(input,op like 'DIRECTOR.%'or op='SCORING.REOPEN_MATCH');
 else perform production_control.assert_future_production_scoring_actor_v1(input,target,op like 'DIRECTOR.%'or op='SCORING.REOPEN_MATCH');end if;
 return jsonb_build_object('operation_id',op,'operation_request_id',id,'tournament_id',target,'match_id',m,
  'target_key',case when op like 'SCORING.%'or op='DIRECTOR.MATCH_CONTROL'then 'MATCH:'||m else 'TOURNAMENT'end,
  'actor_auth_user_id',auth_id,'actor_player_id',actor,'actor_role',role_name);
exception when invalid_text_representation then raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';
end;$$;
create function production_control.certification_ingress_request_hash_v1(input jsonb,identity_value jsonb)
returns text language sql immutable set search_path=pg_catalog as $$
 select production_control.cutover_payload_hash(jsonb_build_object('identity',identity_value,'payload',input->'payload'))
$$;
create function production_control.certification_ingress_response_v1(lease production_control.certification_ingress_leases_v1)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_strip_nulls(jsonb_build_object('ok',true,'contract','certification-ingress-v1','lease_id',lease.lease_id,
  'admission_generation_id',lease.admission_generation_id,'admission_sequence',lease.admission_sequence,
  'operation_request_id',lease.operation_request_id,'request_hash',lease.request_hash,'state',lease.state,'result',lease.result,
  'context',lease.admission_context))
$$;

create function production_control.certification_ingress_lookup_v1(input jsonb,lock_row boolean)
returns production_control.certification_ingress_leases_v1 language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;i jsonb;l production_control.certification_ingress_leases_v1%rowtype;
 target_key_value text;recovery_input jsonb;
begin
 r:=production_control.certification_ingress_recovery_resource_v1(input);
 if not production_control.certification_ingress_required_v1(input->>'operation_id')
   or coalesce(input->>'operation_request_id','')!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'then
  raise exception using errcode='22023',message='CERTIFICATION_INGRESS_IDENTITY_INVALID';end if;
 target_key_value:=case when input->>'operation_id'like'SCORING.%'or input->>'operation_id'='DIRECTOR.MATCH_CONTROL'
  then'MATCH:'||(input#>>'{payload,match_id}')else'TOURNAMENT'end;
 -- Origin filtering makes another actor's operation indistinguishable from absence.
 -- Historical target is derived only from the exact stored operation in this DB.
 if lock_row then
  select * into l from production_control.certification_ingress_leases_v1 where resource_id=r.resource_id
   and operation_id=input->>'operation_id'and target_key=target_key_value and operation_request_id=input->>'operation_request_id'
   and actor_auth_user_id::text=input#>>'{authorization,auth_user_id}'and actor_player_id=input#>>'{authorization,player_id}'
   and actor_role=input#>>'{authorization,role}'for update;
 else
  select * into l from production_control.certification_ingress_leases_v1 where resource_id=r.resource_id
   and operation_id=input->>'operation_id'and target_key=target_key_value and operation_request_id=input->>'operation_request_id'
   and actor_auth_user_id::text=input#>>'{authorization,auth_user_id}'and actor_player_id=input#>>'{authorization,player_id}'
   and actor_role=input#>>'{authorization,role}';end if;
 recovery_input:=case when l.lease_id is null then input else jsonb_set(input,'{authorization,tournament_id}',to_jsonb(l.tournament_id))end;
 i:=production_control.certification_ingress_identity_v1(recovery_input,true);
 if l.lease_id is not null then
  if coalesce((input->>'verify_request')::boolean,false)and l.request_hash is distinct from production_control.certification_ingress_request_hash_v1(input,i)then
   raise exception using errcode='23505',message='CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT';end if;
  if(input#>>'{ingress,lease_id}'is not null and input#>>'{ingress,lease_id}'is distinct from l.lease_id::text)
    or(input#>>'{ingress,admission_generation_id}'is not null and input#>>'{ingress,admission_generation_id}'is distinct from l.admission_generation_id::text)then
   raise exception using errcode='42501',message='CERTIFICATION_INGRESS_BINDING_DENIED';end if;
 end if;
 return l;
end;$$;

-- Read only the exact canonical receipt key. Used to prevent a pre-protocol
-- committed identity from acquiring a contradictory new admission outcome.
create function production_control.certification_ingress_canonical_receipt_v1(lease production_control.certification_ingress_leases_v1)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare value jsonb;action_name text;binding uuid;fp text;
begin
 if lease.operation_id like'SCORING.%'or lease.operation_id='DIRECTOR.MATCH_CONTROL'then
  select m.result into value from scoring_authority.score_mutations m join scoring_authority.matches mt using(match_id)
   where m.match_id=lease.match_id and m.mutation_key=lease.operation_request_id and mt.tournament_id=lease.tournament_id;
 elsif lease.operation_id in('DIRECTOR.MUTATE_SETUP','DIRECTOR.MUTATE_PAIRINGS')then
  action_name:=case lease.domain_action when'update-tournament'then'UPDATE_TOURNAMENT'when'update-team'then'UPDATE_TEAM'
   when'assign-roster-team'then'ASSIGN_ROSTER_TEAM'when'update-round'then'UPDATE_ROUND'when'upsert-course'then'UPSERT_COURSE'
   when'upsert-match'then'UPSERT_MATCH'when'replace-pairings'then'REPLACE_PAIRINGS'when'prepare-scoring-context'then'PREPARE_SCORING_CONTEXT'
   when'replace-round-pairings'then'REPLACE_ROUND_PAIRINGS'end;
  select r.response into value from production_control.tournament_setup_operation_receipts_v1 r
   where r.tournament_id=lease.tournament_id and r.action=action_name and r.operation_request_id=lease.operation_request_id::uuid;
 elsif lease.operation_id='DIRECTOR.SAVE_NET_SKINS_ENTRIES'then
  select r.response into value from production_control.net_skins_entry_revisions_v1 r
   where r.tournament_id=lease.tournament_id and r.request_id=lease.operation_request_id::uuid;
 elsif lease.operation_id in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')then
  select a.binding_id into strict binding from production_control.certification_admission_v1 a where resource_id=lease.resource_id;
  action_name:=case lease.operation_id when'DIRECTOR.REPLACE_CALCUTTA_AUCTION'then'replace-auction'else'clear-entry'end;
  fp:=production_control.calcutta_v1_hash(jsonb_build_object('binding_id',binding::text,'family','CALCUTTA_MANAGEMENT',
   'action',action_name,'operation_request_id',lease.operation_request_id));
  select r.response into value from production_control.cutover_operation_receipts r where request_fingerprint=fp;
 end if;
 return value;
end;$$;

create function public.admit_certification_operation_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r production_control.canonical_resource_v1%rowtype;i jsonb;ctx jsonb;phase text;hash text;
 l production_control.certification_ingress_leases_v1%rowtype;g production_control.certification_ingress_generations_v1%rowtype;
 m scoring_authority.matches%rowtype;
begin
 r:=production_control.certification_ingress_recovery_resource_v1(input);
 i:=jsonb_build_object('operation_id',input->>'operation_id','operation_request_id',input->>'operation_request_id',
  'target_key',case when input->>'operation_id'like'SCORING.%'or input->>'operation_id'='DIRECTOR.MATCH_CONTROL'
  then'MATCH:'||(input#>>'{payload,match_id}')else'TOURNAMENT'end);
 if jsonb_typeof(input->'payload')is distinct from 'object'or input->'payload'?|array['resource','deployment','authorization','environment','project_ref','project_url',
 'actor_player_id','actor_auth_user_id','auth_user_id','role','context_token','expected_context_token','binding_id','resource_id','resource_class',
 'installation_id','release_commit','activation_revision','admission_revision','governance_tournament_id']
 or(input->'payload'?'player_id'and not coalesce(input->>'operation_id'='DIRECTOR.CLEAR_CALCUTTA_AUCTION'
  or(input->>'operation_id'='DIRECTOR.MUTATE_SETUP'and input#>>'{payload,action}'='assign-roster-team'),false))then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_PAYLOAD_INVALID';end if;
 -- Match mutation keys share canonical receipt identity across all four families.
 -- Serialize their admission before any row exists; other families retain their
 -- existing operation-specific namespace.
 perform pg_advisory_xact_lock(hashtextextended(r.resource_id||':'||
  case when i->>'operation_id'in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')
   then 'MATCH_MUTATION'else i->>'operation_id'end||':'||(i->>'target_key')||':'||(i->>'operation_request_id'),19361));
 l:=production_control.certification_ingress_lookup_v1(input||jsonb_build_object('verify_request',true),true);
 if l.lease_id is not null then return production_control.certification_ingress_response_v1(l);end if;
 if coalesce((input->>'replay_only')::boolean,false)then
  return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN','lease_id',null,'operation_request_id',i->>'operation_request_id');end if;
 i:=production_control.certification_ingress_identity_v1(input);
 hash:=production_control.certification_ingress_request_hash_v1(input,i);
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',true);
 ctx:=production_control.push_certification_context_v1(input,phase,true);
 if i->>'tournament_id'is distinct from ctx->>'tournament_id'then raise exception using errcode='42501',message='CERTIFICATION_INGRESS_TARGET_DENIED';end if;
 if(input#>>'{payload,tournament_id}'is not null and input#>>'{payload,tournament_id}'is distinct from ctx->>'tournament_id')
  or(input#>>'{payload,expected_epoch_id}'is not null and input#>>'{payload,expected_epoch_id}'is distinct from ctx->>'authority_epoch_id')
  or(input->>'operation_id'like'SCORING.%'and input#>>'{payload,mutation_key}'is distinct from input->>'operation_request_id')then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_TARGET_DENIED';end if;
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=r.resource_id and state='OPEN'for share;
 if g.tournament_id is distinct from ctx->>'tournament_id'or g.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id'
  or g.pointer_revision::text is distinct from ctx->>'pointer_revision'then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_GENERATION_STALE';end if;
 if i->>'match_id'is not null then
  select * into strict m from scoring_authority.matches where match_id=i->>'match_id'and tournament_id=g.tournament_id for share;
  if i->>'actor_role'='PLAYER'and not exists(select 1 from scoring_authority.scoring_permissions p
   where p.match_id=m.match_id and p.player_id=i->>'actor_player_id'and p.can_score and p.revoked_at is null
    and p.permission_revision=m.permission_revision
    and p.permission_revision::text=input#>>'{authorization,permission_revision}')then
   raise exception using errcode='42501',message='CERTIFICATION_INGRESS_PERMISSION_DENIED';end if;
 end if;
 if i->>'operation_id'in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL')
  and exists(select 1 from production_control.certification_ingress_leases_v1 existing
   where existing.resource_id=r.resource_id and existing.target_key=i->>'target_key'
    and existing.operation_request_id=i->>'operation_request_id'and existing.operation_id<>i->>'operation_id'
    and existing.operation_id in('SCORING.SUBMIT_HOLE','SCORING.FINALIZE_MATCH','SCORING.REOPEN_MATCH','DIRECTOR.MATCH_CONTROL'))then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_IDEMPOTENCY_CONFLICT';end if;
 l.resource_id:=r.resource_id;l.tournament_id:=g.tournament_id;l.operation_id:=i->>'operation_id';
 l.operation_request_id:=i->>'operation_request_id';l.match_id:=i->>'match_id';l.domain_action:=input#>>'{payload,action}';
 if production_control.certification_ingress_canonical_receipt_v1(l)is not null then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_EXISTING_RECEIPT_REQUIRES_RECOVERY';end if;
 insert into production_control.certification_ingress_leases_v1(resource_id,admission_generation_id,tournament_id,authority_epoch_id,
 operation_id,operation_request_id,target_key,match_id,domain_action,actor_auth_user_id,actor_player_id,actor_role,request_hash,context_token,admission_context,predecessor_auction_revision)
 values(r.resource_id,g.generation_id,g.tournament_id,g.authority_epoch_id,i->>'operation_id',i->>'operation_request_id',i->>'target_key',
 i->>'match_id',input#>>'{payload,action}',(i->>'actor_auth_user_id')::uuid,i->>'actor_player_id',i->>'actor_role',hash,ctx->>'context_token',
  ctx-array['authorization','actor_auth_user_id','actor_player_id','resource','deployment'],case when i->>'operation_id'in('DIRECTOR.REPLACE_CALCUTTA_AUCTION','DIRECTOR.CLEAR_CALCUTTA_AUCTION')
   then(input#>>'{payload,expected_auction_revision}')::bigint else null end)returning * into l;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_INGRESS_ADMITTED','CERTIFICATION',l.tournament_id,l.actor_player_id,hash,'SUCCEEDED',
 jsonb_build_object('resource_id',r.resource_id,'generation_id',g.generation_id,'lease_id',l.lease_id,'operation_id',l.operation_id,
 'operation_request_id',l.operation_request_id,'admission_sequence',l.admission_sequence));
 perform production_control.pop_certification_context_v1();return production_control.certification_ingress_response_v1(l);
exception when no_data_found then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_AUTHORITY_UNAVAILABLE';
end;$$;

create function production_control.require_certification_ingress_execution_v1()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l production_control.certification_ingress_leases_v1%rowtype;ctx jsonb;g production_control.certification_ingress_generations_v1%rowtype;
begin
 ctx:=production_control.current_certification_context_v1();
 select l0.* into strict l from production_control.certification_ingress_execution_v1 x
 join production_control.certification_ingress_leases_v1 l0 using(lease_id)
 where x.backend_pid=pg_backend_pid()and x.transaction_id=pg_current_xact_id()for update of l0;
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=l.resource_id and generation_id=l.admission_generation_id for share;
 if g.state<>'OPEN'or l.state not in('ADMITTED','UNKNOWN')or l.resource_id is distinct from ctx->>'resource_id'
  or l.tournament_id is distinct from ctx->>'tournament_id'or l.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id'
  or l.context_token is distinct from ctx->>'context_token'or l.operation_request_id is distinct from ctx->>'operation_request_id'
  or l.actor_auth_user_id::text is distinct from ctx#>>'{authorization,auth_user_id}'
  or l.actor_player_id is distinct from ctx#>>'{authorization,player_id}'then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_EXECUTION_REQUIRED';end if;
 return to_jsonb(l)-array['result','admitted_at','expires_at','resolved_at'];
exception when no_data_found then raise exception using errcode='42501',message='CERTIFICATION_INGRESS_EXECUTION_REQUIRED';
end;$$;

-- Preserve the original public OID and exact existing dispatcher implementation,
-- but remove any direct runtime-role route to the extracted body.
do $extract$declare p pg_proc%rowtype;definition text;begin
 select * into strict p from pg_proc where oid='public.execute_certification_operation_v1(jsonb)'::regprocedure;
 if encode(extensions.digest(p.prosrc,'sha256'),'hex')<>'7fbf362130d7b934349af1727de36d3c298fdd5efe7eb76f8ea22fd5d7149d82' or p.proowner<>(select oid from pg_roles where rolname=current_user)or not p.prosecdef or p.proconfig is distinct from array['search_path=pg_catalog']::text[] then
  raise exception 'CERTIFICATION_INGRESS_EXECUTE_PREDECESSOR_MISMATCH';end if;
 definition:=pg_get_functiondef(p.oid);
 definition:=replace(definition,'public.execute_certification_operation_v1','production_control.execute_certification_operation_core_v1');
 execute definition;
end;$extract$;
create or replace function public.execute_certification_operation_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l production_control.certification_ingress_leases_v1%rowtype;g production_control.certification_ingress_generations_v1%rowtype;
 ctx jsonb;domain_result jsonb;phase text;rejected boolean:=false;
begin
 if not production_control.certification_ingress_required_v1(input->>'operation_id')then
  return production_control.execute_certification_operation_core_v1(input);end if;
 if input#>>'{ingress,lease_id}'is null or input#>>'{ingress,admission_generation_id}'is null then
  raise exception using errcode='42501',message='CERTIFICATION_INGRESS_LEASE_REQUIRED';end if;
 l:=production_control.certification_ingress_lookup_v1(input||jsonb_build_object('verify_request',true),true);
 if l.lease_id is null then raise exception using errcode='42501',message='CERTIFICATION_INGRESS_LEASE_REQUIRED';end if;
 if l.state in('COMMITTED','NOT_COMMITTED')then return l.result;end if;
 phase:=production_control.certification_operation_phase_v1(input->>'operation_id',true);
 ctx:=production_control.push_certification_context_v1(input,phase,true);
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=l.resource_id and generation_id=l.admission_generation_id for share;
 if g.state<>'OPEN'or g.tournament_id is distinct from ctx->>'tournament_id'
  or g.authority_epoch_id::text is distinct from ctx->>'authority_epoch_id'or g.pointer_revision::text is distinct from ctx->>'pointer_revision'
  or l.context_token is distinct from ctx->>'context_token'or l.expires_at<=clock_timestamp()then
  raise exception using errcode='40001',message='CERTIFICATION_INGRESS_EXECUTION_FENCED';end if;
 insert into production_control.certification_ingress_execution_v1 values(pg_backend_pid(),pg_current_xact_id(),l.lease_id);
 begin
  domain_result:=production_control.execute_certification_operation_core_v1(input);
  if domain_result->>'ok'is distinct from 'true'then raise exception using errcode='P1360',message='CERTIFICATION_DOMAIN_REJECTION_ROLLBACK';end if;
  if not coalesce((domain_result->>'semantic_noop')::boolean,false)
    and production_control.certification_ingress_canonical_receipt_v1(l)is null then
   raise exception using errcode='55000',message='CERTIFICATION_INGRESS_RECEIPT_CONTRADICTION';end if;
 exception when sqlstate 'P1360'then rejected:=true;
 end;
 update production_control.certification_ingress_leases_v1 set state=case when rejected then 'NOT_COMMITTED'else 'COMMITTED'end,
  result=domain_result,resolved_at=clock_timestamp(),committed_generation_revision=case when rejected then null else g.revision end
  where lease_id=l.lease_id returning * into l;
 insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
 values('CERTIFICATION_INGRESS_TERMINAL','CERTIFICATION',l.tournament_id,l.actor_player_id,l.request_hash,'SUCCEEDED',
  jsonb_build_object('resource_id',l.resource_id,'lease_id',l.lease_id,'generation_id',l.admission_generation_id,
   'operation_id',l.operation_id,'operation_request_id',l.operation_request_id,'state',l.state,'admission_sequence',l.admission_sequence));
 delete from production_control.certification_ingress_execution_v1 where backend_pid=pg_backend_pid()and transaction_id=pg_current_xact_id();
 perform production_control.pop_certification_context_v1();return l.result;
end;$$;

create function public.read_certification_ingress_status_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l production_control.certification_ingress_leases_v1%rowtype;
begin
 l:=production_control.certification_ingress_lookup_v1(input,false);
 if l.lease_id is null then return jsonb_build_object('ok',true,'contract','certification-ingress-v1','state','UNKNOWN',
 'lease_id',null,'operation_request_id',input->>'operation_request_id');end if;
 if l.state='COMMITTED'and not coalesce((l.result->>'semantic_noop')::boolean,false)
  and production_control.certification_ingress_canonical_receipt_v1(l)is null then
   raise exception using errcode='55000',message='CERTIFICATION_INGRESS_RECEIPT_CONTRADICTION';end if;
 return production_control.certification_ingress_response_v1(l);
end;$$;
create function public.mark_certification_ingress_unknown_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l production_control.certification_ingress_leases_v1%rowtype;
begin
 l:=production_control.certification_ingress_lookup_v1(input,true);
 if l.lease_id is null then return public.read_certification_ingress_status_v1(input);end if;
 if l.state='ADMITTED'then update production_control.certification_ingress_leases_v1 set state='UNKNOWN'where lease_id=l.lease_id returning * into l;end if;
 return production_control.certification_ingress_response_v1(l);
end;$$;
create function public.resolve_certification_ingress_v1(input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare l production_control.certification_ingress_leases_v1%rowtype;
begin
 l:=production_control.certification_ingress_lookup_v1(input,true);
 if l.lease_id is null then return public.read_certification_ingress_status_v1(input);end if;
 if l.state in('ADMITTED','UNKNOWN')then
  if production_control.certification_ingress_canonical_receipt_v1(l)is not null then
   raise exception using errcode='55000',message='CERTIFICATION_INGRESS_RECEIPT_CONTRADICTION';end if;
  -- Same row lock held throughout canonical execution. No committed execution
  -- can be present without its atomic terminal state. Fencing is irreversible.
  update production_control.certification_ingress_leases_v1 set state='NOT_COMMITTED',resolved_at=clock_timestamp(),
   result=jsonb_build_object('ok',false,'code','CERTIFICATION_INGRESS_NOT_COMMITTED','operation_request_id',l.operation_request_id)
   where lease_id=l.lease_id returning * into l;
  insert into production_control.operation_audit_events(event_type,domain,tournament_id,actor,request_fingerprint,result,details)
  values('CERTIFICATION_INGRESS_RESOLVED','CERTIFICATION',l.tournament_id,l.actor_player_id,l.request_hash,'SUCCEEDED',
   jsonb_build_object('resource_id',l.resource_id,'generation_id',l.admission_generation_id,'lease_id',l.lease_id,
    'operation_request_id',l.operation_request_id,'state','NOT_COMMITTED'));
 end if;
 return production_control.certification_ingress_response_v1(l);
end;$$;

create function production_control.certification_ingress_evidence_v1(target_resource_id text,target_generation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare g production_control.certification_ingress_generations_v1%rowtype;summary jsonb;fp text;
begin
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=target_resource_id and generation_id=target_generation_id for update;
 select jsonb_build_object('admitted_count',count(*),'high_watermark',coalesce(max(admission_sequence),0),
 'active_count',count(*)filter(where state='ADMITTED'),'unknown_count',count(*)filter(where state='UNKNOWN'),
 'committed_count',count(*)filter(where state='COMMITTED'),'not_committed_count',count(*)filter(where state='NOT_COMMITTED'),
 'post_close_admissions',count(*)filter(where g.high_watermark is not null and admission_sequence>g.high_watermark),
 'post_close_writes',count(*)filter(where g.closing_revision is not null and committed_generation_revision>=g.closing_revision))into summary
 from production_control.certification_ingress_leases_v1 where resource_id=target_resource_id and admission_generation_id=target_generation_id;
 select production_control.cutover_payload_hash(coalesce(jsonb_agg(jsonb_build_object('sequence',admission_sequence,'operation',operation_id,
 'operation_id',operation_request_id,'target',target_key,'hash',request_hash,'state',state,'committed_revision',committed_generation_revision)
 order by admission_sequence),'[]'::jsonb))into fp
 from production_control.certification_ingress_leases_v1 where resource_id=target_resource_id and admission_generation_id=target_generation_id;
 return summary||jsonb_build_object('resource_id',target_resource_id,'generation_id',target_generation_id,'tournament_id',g.tournament_id,
 'authority_epoch_id',g.authority_epoch_id,'generation_revision',g.revision,'state',g.state,'fingerprint',fp,
 'captured_high_watermark',g.high_watermark,'captured_fingerprint',g.lease_fingerprint,
 'drained',(summary->>'active_count')::bigint=0 and(summary->>'unknown_count')::bigint=0
 and(summary->>'post_close_admissions')::bigint=0 and(summary->>'post_close_writes')::bigint=0,
 'fingerprint_matches',g.state<>'CLOSED'or g.lease_fingerprint=fp);
end;$$;
create function production_control.close_certification_ingress_generation_v1(target_resource_id text,target_generation_id uuid,expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare g production_control.certification_ingress_generations_v1%rowtype;e jsonb;
begin
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict g from production_control.certification_ingress_generations_v1 where resource_id=target_resource_id and generation_id=target_generation_id for update;
 if g.revision<>expected_revision then raise exception using errcode='40001',message='CERTIFICATION_INGRESS_GENERATION_STALE';end if;
 e:=production_control.certification_ingress_evidence_v1(target_resource_id,target_generation_id);
 if g.state='CLOSED'then
  if not(e->>'fingerprint_matches')::boolean or not(e->>'drained')::boolean then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_CLOSED_EVIDENCE_INVALID';end if;
  return e;end if;
 if g.state='OPEN'then
  update production_control.certification_ingress_generations_v1 set state='CLOSING',revision=revision+1,
   closing_revision=revision+1,high_watermark=(e->>'high_watermark')::bigint
   where resource_id=target_resource_id and generation_id=target_generation_id returning * into g;
 end if;
 e:=production_control.certification_ingress_evidence_v1(target_resource_id,target_generation_id);
 if(e->>'drained')::boolean then
  update production_control.certification_ingress_generations_v1 set state='CLOSED',lease_fingerprint=e->>'fingerprint',closed_at=clock_timestamp()
   where resource_id=target_resource_id and generation_id=target_generation_id;
 end if;
 return production_control.certification_ingress_evidence_v1(target_resource_id,target_generation_id);
end;$$;
create function production_control.reopen_certification_ingress_generation_v1(target_resource_id text,prior_generation_id uuid,expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare old_generation production_control.certification_ingress_generations_v1%rowtype;g production_control.certification_ingress_generations_v1%rowtype;
 p production_control.current_tournament_pointer_v1%rowtype;a production_control.certification_admission_v1%rowtype;e jsonb;
begin
 perform pg_advisory_xact_lock(production_control.scoring_admission_lock_key());
 select * into strict old_generation from production_control.certification_ingress_generations_v1 where resource_id=target_resource_id and generation_id=prior_generation_id for update;
 if old_generation.revision<>expected_revision then raise exception using errcode='40001',message='CERTIFICATION_INGRESS_GENERATION_STALE';end if;
 select * into g from production_control.certification_ingress_generations_v1 where resource_id=target_resource_id and predecessor_generation_id=prior_generation_id;
 if found then return to_jsonb(g);end if;
 e:=production_control.close_certification_ingress_generation_v1(target_resource_id,prior_generation_id,expected_revision);
 if e->>'state'<>'CLOSED'or not(e->>'drained')::boolean then raise exception using errcode='55000',message='CERTIFICATION_INGRESS_UNRESOLVED';end if;
 select * into strict p from production_control.current_tournament_pointer_v1 where scope_key=target_resource_id for update;
 select * into strict a from production_control.certification_admission_v1 where resource_id=target_resource_id for update;
 insert into production_control.certification_ingress_generations_v1(resource_id,tournament_id,authority_epoch_id,pointer_revision,predecessor_generation_id)
 values(target_resource_id,p.tournament_id,a.authority_epoch_id,p.pointer_revision,prior_generation_id)returning * into g;
 update production_control.certification_admission_v1 set admission_revision=admission_revision+1 where resource_id=target_resource_id;
 return to_jsonb(g);
end;$$;

-- No extra runtime-role surface on private schema, including extracted body.
do $acl$declare fn record;begin
 for fn in select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='production_control'and(p.proname like '%certification_ingress%'
 or p.proname='execute_certification_operation_core_v1')loop
  execute 'revoke all on function '||fn.signature||' from public,anon,authenticated,service_role';end loop;
end;$acl$;
do $private_acl$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  where n.nspname='production_control'and(p.proname like'%certification_ingress%'or p.proname='execute_certification_operation_core_v1')
   and(a.grantee<>p.proowner or p.proowner<>(select oid from pg_roles where rolname=current_user)
    or p.proconfig is distinct from array['search_path=pg_catalog']::text[]))then
  raise exception 'CERTIFICATION_INGRESS_PRIVATE_PRIVILEGE_EXPANSION';end if;
end;$private_acl$;
revoke all on function public.admit_certification_operation_v1(jsonb),public.read_certification_ingress_status_v1(jsonb),
 public.mark_certification_ingress_unknown_v1(jsonb),public.resolve_certification_ingress_v1(jsonb)from public,anon,authenticated,service_role;
grant execute on function public.admit_certification_operation_v1(jsonb),public.read_certification_ingress_status_v1(jsonb),
 public.mark_certification_ingress_unknown_v1(jsonb),public.resolve_certification_ingress_v1(jsonb)to service_role;
do $public_acl$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
  where n.nspname='public'and p.proname in('admit_certification_operation_v1','execute_certification_operation_v1',
   'read_certification_ingress_status_v1','mark_certification_ingress_unknown_v1','resolve_certification_ingress_v1')
   and(a.grantee not in(p.proowner,(select oid from pg_roles where rolname='service_role'))
    or p.proowner<>(select oid from pg_roles where rolname=current_user)or not p.prosecdef
    or p.proconfig is distinct from array['search_path=pg_catalog']::text[]))then
  raise exception 'CERTIFICATION_INGRESS_PUBLIC_PRIVILEGE_EXPANSION';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S'then's'::"char"else'r'::"char"end,c.relowner)))a
  where n.nspname='production_control'and c.relname like'certification_ingress_%'and c.relkind in('r','S')
   and(a.grantee<>c.relowner or c.relowner<>(select oid from pg_roles where rolname=current_user)))then
  raise exception 'CERTIFICATION_INGRESS_PRIVATE_RELATION_PRIVILEGE_EXPANSION';end if;
end;$public_acl$;
notify pgrst,'reload schema';
commit;
