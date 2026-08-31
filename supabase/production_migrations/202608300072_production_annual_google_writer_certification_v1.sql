-- Step 13E.7B bounded annual Google destination and writer-target
-- certification.
-- Migration: 202608300072_production_annual_google_writer_certification_v1.
--
-- Installation is deliberately inert. It creates no tournament, destination,
-- writer generation, target, job claim, or Google write. The only callable
-- operations require the existing Production service-role + Director + Owner
-- scope assertion. The browser never supplies a destination: Stage 1 adopts
-- only resource_scope.google_workbook_id and Stage 2 certifies only that
-- already-adopted immutable resource.
begin;

do $assert_empty_pre_certification_targets$
begin
  if exists (
    select 1 from production_control.future_google_writer_targets_v2
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_PREEXISTING_TARGET_REVIEW_REQUIRED';
  end if;
end;
$assert_empty_pre_certification_targets$;

alter table production_control.future_google_writer_targets_v2
  add column certification_contract_version text not null check (
    certification_contract_version =
      'production-annual-google-writer-certification-v1'
  ),
  add column resource_revision bigint not null check (
    resource_revision > 0
  ),
  add column promotion_revision bigint not null check (
    promotion_revision > 0
  ),
  add column source_setup_revision bigint not null check (
    source_setup_revision > 0
  ),
  add column promoted_manifest_fingerprint text not null check (
    promoted_manifest_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add column resource_binding_fingerprint text not null check (
    resource_binding_fingerprint ~ '^[0-9a-f]{64}$'
  );

create table production_control.future_google_writer_certification_receipts_v1 (
  receipt_id uuid not null default extensions.gen_random_uuid() unique,
  action text not null check (action in (
    'ADOPT_ANNUAL_GOOGLE_DESTINATION',
    'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET'
  )),
  target_tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  operation_request_id uuid not null,
  declared_request_payload_hash text not null check (
    declared_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  database_request_payload_hash text not null check (
    database_request_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id)
    on delete restrict,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  response jsonb not null check (
    pg_catalog.jsonb_typeof(response) = 'object'
    and not (response ?| array[
      'email', 'phone', 'auth_user_id', 'authUserId', 'token', 'secret',
      'destination_workbook_id', 'source_workbook_id'
    ])
  ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (action, operation_request_id)
);

create table production_control.future_google_writer_certification_audit_v1 (
  event_id uuid primary key default extensions.gen_random_uuid(),
  action text not null check (action in (
    'ADOPT_ANNUAL_GOOGLE_DESTINATION',
    'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET'
  )),
  target_tournament_id text not null references
    production_control.future_tournament_catalog_v1(tournament_id)
    on delete restrict,
  actor_player_id text not null references scoring_authority.players(player_id)
    on delete restrict,
  operation_request_id uuid not null,
  prior_revision bigint not null check (prior_revision >= 0),
  next_revision bigint not null check (next_revision >= prior_revision),
  result text not null check (result in ('CHANGED', 'NO_CHANGE')),
  safe_metadata jsonb not null check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
    and not (safe_metadata ?| array[
      'email', 'phone', 'auth_user_id', 'authUserId', 'token', 'secret',
      'destination_workbook_id', 'source_workbook_id'
    ])
  ),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index production_future_google_writer_certification_audit_timeline_v1
  on production_control.future_google_writer_certification_audit_v1(
    target_tournament_id, occurred_at desc, event_id
  );

alter table production_control.future_google_writer_certification_receipts_v1
  enable row level security;
alter table production_control.future_google_writer_certification_audit_v1
  enable row level security;

create trigger production_future_google_writer_receipt_immutable_v1
before update or delete
on production_control.future_google_writer_certification_receipts_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

create trigger production_future_google_writer_audit_immutable_v1
before update or delete
on production_control.future_google_writer_certification_audit_v1
for each row execute function
  production_control.reject_future_runtime_immutable_v2();

-- Keep the original runtime assertion as the resource/lifecycle predecessor.
-- The public writer RPCs continue to call the same signature below, whose new
-- wrapper also proves that the live installed SQL/ACL/trigger topology is the
-- implementation that was certified.  A source or privilege change therefore
-- invalidates a retained writer generation instead of silently inheriting it.
alter function production_control.assert_future_google_writer_v2(jsonb, boolean)
  rename to assert_future_google_writer_pre_implementation_cert_v2;

revoke all on function
  production_control.future_runtime_hash_v2(jsonb),
  production_control.future_google_match_manifest_v1(text),
  production_control.reject_future_runtime_immutable_v2(),
  production_control.sync_future_google_writer_binding_v2()
from public, anon, authenticated, service_role;

create or replace function
  production_control.future_google_writer_implementation_manifest_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $implementation_manifest$
declare
  signatures constant text[] := array[
    'production_control.future_runtime_hash_v2(jsonb)',
    'production_control.sync_future_google_writer_job_v2(text,text)',
    'production_control.sync_future_google_writer_binding_v2()',
    'production_control.reject_future_runtime_immutable_v2()',
    'production_control.future_google_match_manifest_v1(text)',
    'production_control.future_google_match_manifest_v2(text)',
    'production_control.assert_future_google_writer_pre_implementation_cert_v2(jsonb,boolean)',
    'production_control.future_google_writer_implementation_manifest_v2()',
    'production_control.future_google_writer_implementation_fingerprint_v2()',
    'production_control.future_google_writer_generation_id_v2(text,text)',
    'production_control.future_google_writer_resource_fingerprint_v1(text)',
    'production_control.future_google_writer_target_fingerprint_v1(text)',
    'production_control.assert_future_google_writer_live_implementation_v2(text)',
    'production_control.assert_future_google_writer_v2(jsonb,boolean)',
    'public.resolve_production_future_match_google_compatibility_v2(jsonb)',
    'public.claim_production_future_match_google_compatibility_v2(jsonb)',
    'public.complete_production_future_match_google_compatibility_v2(jsonb)',
    'public.fail_production_future_match_google_compatibility_v2(jsonb)',
    'public.adopt_production_future_google_destination_v1(jsonb)',
    'public.certify_production_future_google_writer_target_v1(jsonb)'
  ];
  trigger_names constant text[] := array[
    'sync_future_google_writer_binding_v2',
    'future_google_writer_generation_immutable_v2',
    'future_google_writer_target_immutable_v2',
    'production_future_google_writer_receipt_immutable_v1',
    'production_future_google_writer_audit_immutable_v1'
  ];
  relation_names constant text[] := array[
    'production_control.future_runtime_match_bindings_v2',
    'production_control.future_match_google_compatibility_jobs_v1',
    'production_control.future_google_writer_generations_v2',
    'production_control.future_google_writer_targets_v2',
    'production_control.future_google_writer_certification_receipts_v1',
    'production_control.future_google_writer_certification_audit_v1'
  ];
  function_manifest jsonb;
  trigger_manifest jsonb;
  relation_manifest jsonb;
begin
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signature', requested.signature,
    'source', procedure_value.prosrc,
    'securityDefiner', procedure_value.prosecdef,
    'volatility', procedure_value.provolatile::text,
    'configuration', coalesce(
      pg_catalog.to_jsonb(procedure_value.proconfig), '[]'::jsonb
    ),
    'acl', coalesce(
      pg_catalog.to_jsonb(procedure_value.proacl), '[]'::jsonb
    ),
    'anonExecute', pg_catalog.has_function_privilege(
      'anon', procedure_value.oid, 'EXECUTE'
    ),
    'authenticatedExecute', pg_catalog.has_function_privilege(
      'authenticated', procedure_value.oid, 'EXECUTE'
    ),
    'serviceRoleExecute', pg_catalog.has_function_privilege(
      'service_role', procedure_value.oid, 'EXECUTE'
    )
  ) order by requested.ordinality) into function_manifest
  from pg_catalog.unnest(signatures) with ordinality
    requested(signature, ordinality)
  join pg_catalog.pg_proc procedure_value
    on procedure_value.oid = pg_catalog.to_regprocedure(requested.signature);
  if pg_catalog.jsonb_array_length(coalesce(
       function_manifest, '[]'::jsonb
     )) <> pg_catalog.cardinality(signatures) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_FUNCTION_REQUIRED';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(signatures) requested(signature)
    join pg_catalog.pg_proc procedure_value
      on procedure_value.oid = pg_catalog.to_regprocedure(requested.signature)
    where (
         requested.signature = any(array[
           'production_control.reject_future_runtime_immutable_v2()',
           'production_control.future_runtime_hash_v2(jsonb)',
           'production_control.future_google_writer_generation_id_v2(text,text)'
         ])
         and (
           procedure_value.prosecdef
           or not (
             case requested.signature
               when 'production_control.future_runtime_hash_v2(jsonb)'
                 then 'search_path=pg_catalog, extensions'
               else 'search_path=pg_catalog, production_control'
             end = any(coalesce(
               procedure_value.proconfig, array[]::text[]
             ))
           )
         )
       )
       or (
         requested.signature <> all(array[
           'production_control.reject_future_runtime_immutable_v2()',
           'production_control.future_runtime_hash_v2(jsonb)',
           'production_control.future_google_writer_generation_id_v2(text,text)'
         ])
         and (
           not procedure_value.prosecdef
           or not ('search_path=pg_catalog' = any(coalesce(
             procedure_value.proconfig, array[]::text[]
           )))
         )
       )
       or pg_catalog.has_function_privilege(
         'anon', procedure_value.oid, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'authenticated', procedure_value.oid, 'EXECUTE'
       )
       or (
         requested.signature like 'public.%'
         and not pg_catalog.has_function_privilege(
           'service_role', procedure_value.oid, 'EXECUTE'
         )
       )
       or (
         requested.signature not like 'public.%'
         and pg_catalog.has_function_privilege(
           'service_role', procedure_value.oid, 'EXECUTE'
         )
       )
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_PRIVILEGE_REQUIRED';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name', trigger_value.tgname,
    'table', namespace_value.nspname || '.' || relation_value.relname,
    'definition', pg_catalog.pg_get_triggerdef(trigger_value.oid, true),
    'enabled', trigger_value.tgenabled::text,
    'function', trigger_value.tgfoid::pg_catalog.regprocedure::text,
    'functionSource', trigger_function.prosrc,
    'functionSecurityDefiner', trigger_function.prosecdef,
    'functionConfiguration', coalesce(
      pg_catalog.to_jsonb(trigger_function.proconfig), '[]'::jsonb
    ),
    'functionAcl', coalesce(
      pg_catalog.to_jsonb(trigger_function.proacl), '[]'::jsonb
    )
  ) order by trigger_value.tgname) into trigger_manifest
  from pg_catalog.pg_trigger trigger_value
  join pg_catalog.pg_class relation_value
    on relation_value.oid = trigger_value.tgrelid
  join pg_catalog.pg_namespace namespace_value
    on namespace_value.oid = relation_value.relnamespace
  join pg_catalog.pg_proc trigger_function
    on trigger_function.oid = trigger_value.tgfoid
  where not trigger_value.tgisinternal
    and trigger_value.tgname = any(trigger_names);
  if pg_catalog.jsonb_array_length(coalesce(
       trigger_manifest, '[]'::jsonb
     )) <> pg_catalog.cardinality(trigger_names) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_TRIGGER_REQUIRED';
  end if;
  -- A trigger name alone is not a safety boundary.  Prove the exact relation,
  -- function, timing/event mask and update-column set that the certified
  -- writer relies on.  This prevents a later migration from moving a named
  -- trigger to a harmless table while retaining the same apparent inventory.
  if 1 <> (
       select pg_catalog.count(*)
       from pg_catalog.pg_trigger trigger_value
       where not trigger_value.tgisinternal
         and trigger_value.tgname = 'sync_future_google_writer_binding_v2'
         and trigger_value.tgrelid = pg_catalog.to_regclass(
           'production_control.future_runtime_match_bindings_v2'
         )
         and trigger_value.tgfoid = pg_catalog.to_regprocedure(
           'production_control.sync_future_google_writer_binding_v2()'
         )
         and trigger_value.tgtype = 21
         and (
            select pg_catalog.array_agg(
              attribute_value.attname::text
              order by target_attribute.ordinality
            )
           from pg_catalog.unnest(
             trigger_value.tgattr::smallint[]
           ) with ordinality target_attribute(attnum, ordinality)
           join pg_catalog.pg_attribute attribute_value
             on attribute_value.attrelid = trigger_value.tgrelid
            and attribute_value.attnum = target_attribute.attnum
         ) = array[
           'runtime_state', 'runtime_revision',
           'structural_setup_revision', 'configuration_fingerprint'
         ]::text[]
     )
     or 1 <> (
       select pg_catalog.count(*)
       from pg_catalog.pg_trigger trigger_value
       where not trigger_value.tgisinternal
         and trigger_value.tgname =
           'future_google_writer_generation_immutable_v2'
         and trigger_value.tgrelid = pg_catalog.to_regclass(
           'production_control.future_google_writer_generations_v2'
         )
         and trigger_value.tgfoid = pg_catalog.to_regprocedure(
           'production_control.reject_future_runtime_immutable_v2()'
         )
         and trigger_value.tgtype = 27
         and pg_catalog.cardinality(
           trigger_value.tgattr::smallint[]
         ) = 0
     )
     or 1 <> (
       select pg_catalog.count(*)
       from pg_catalog.pg_trigger trigger_value
       where not trigger_value.tgisinternal
         and trigger_value.tgname = 'future_google_writer_target_immutable_v2'
         and trigger_value.tgrelid = pg_catalog.to_regclass(
           'production_control.future_google_writer_targets_v2'
         )
         and trigger_value.tgfoid = pg_catalog.to_regprocedure(
           'production_control.reject_future_runtime_immutable_v2()'
         )
         and trigger_value.tgtype = 27
         and pg_catalog.cardinality(
           trigger_value.tgattr::smallint[]
         ) = 0
     )
     or 1 <> (
       select pg_catalog.count(*)
       from pg_catalog.pg_trigger trigger_value
       where not trigger_value.tgisinternal
         and trigger_value.tgname =
           'production_future_google_writer_receipt_immutable_v1'
         and trigger_value.tgrelid = pg_catalog.to_regclass(
           'production_control.future_google_writer_certification_receipts_v1'
         )
         and trigger_value.tgfoid = pg_catalog.to_regprocedure(
           'production_control.reject_future_runtime_immutable_v2()'
         )
         and trigger_value.tgtype = 27
         and pg_catalog.cardinality(
           trigger_value.tgattr::smallint[]
         ) = 0
     )
     or 1 <> (
       select pg_catalog.count(*)
       from pg_catalog.pg_trigger trigger_value
       where not trigger_value.tgisinternal
         and trigger_value.tgname =
           'production_future_google_writer_audit_immutable_v1'
         and trigger_value.tgrelid = pg_catalog.to_regclass(
           'production_control.future_google_writer_certification_audit_v1'
         )
         and trigger_value.tgfoid = pg_catalog.to_regprocedure(
           'production_control.reject_future_runtime_immutable_v2()'
         )
         and trigger_value.tgtype = 27
         and pg_catalog.cardinality(
           trigger_value.tgattr::smallint[]
         ) = 0
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_TRIGGER_TOPOLOGY_REQUIRED';
  end if;
  if 5 <> (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger trigger_value
    where not trigger_value.tgisinternal
      and trigger_value.tgrelid = any(array[
        pg_catalog.to_regclass(
          'production_control.future_runtime_match_bindings_v2'
        ),
        pg_catalog.to_regclass(
          'production_control.future_match_google_compatibility_jobs_v1'
        ),
        pg_catalog.to_regclass(
          'production_control.future_google_writer_generations_v2'
        ),
        pg_catalog.to_regclass(
          'production_control.future_google_writer_targets_v2'
        ),
        pg_catalog.to_regclass(
          'production_control.future_google_writer_certification_receipts_v1'
        ),
        pg_catalog.to_regclass(
          'production_control.future_google_writer_certification_audit_v1'
        )
      ]::oid[])
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_TRIGGER_TOPOLOGY_REQUIRED';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_trigger trigger_value
    join pg_catalog.pg_proc trigger_function
      on trigger_function.oid = trigger_value.tgfoid
    where not trigger_value.tgisinternal
      and trigger_value.tgname = any(trigger_names)
      and (trigger_value.tgenabled <> 'O'
        or (trigger_value.tgname = 'sync_future_google_writer_binding_v2'
          and not trigger_function.prosecdef)
        or not (
          'search_path=pg_catalog' = any(coalesce(
            trigger_function.proconfig, array[]::text[]
          ))
          or 'search_path=pg_catalog, production_control' = any(coalesce(
            trigger_function.proconfig, array[]::text[]
          ))
        )
        or pg_catalog.has_function_privilege(
          'anon', trigger_function.oid, 'EXECUTE'
        )
        or pg_catalog.has_function_privilege(
          'authenticated', trigger_function.oid, 'EXECUTE'
        )
        or pg_catalog.has_function_privilege(
          'service_role', trigger_function.oid, 'EXECUTE'
        ))
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_TRIGGER_SECURITY_REQUIRED';
  end if;

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'relation', requested.relation_name,
    'owner', pg_catalog.pg_get_userbyid(relation_value.relowner),
    'rowSecurity', relation_value.relrowsecurity,
    'forceRowSecurity', relation_value.relforcerowsecurity,
    'acl', coalesce(pg_catalog.to_jsonb(relation_value.relacl), '[]'::jsonb),
    'policies', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', policy_value.polname,
        'command', policy_value.polcmd::text,
        'permissive', policy_value.polpermissive,
        'using', pg_catalog.pg_get_expr(
          policy_value.polqual, policy_value.polrelid
        ),
        'check', pg_catalog.pg_get_expr(
          policy_value.polwithcheck, policy_value.polrelid
        )
      ) order by policy_value.polname)
      from pg_catalog.pg_policy policy_value
      where policy_value.polrelid = relation_value.oid
    ), '[]'::jsonb),
    'anonDataAccess', pg_catalog.has_table_privilege(
      'anon', relation_value.oid, 'SELECT'
    ) or pg_catalog.has_table_privilege(
      'anon', relation_value.oid, 'INSERT'
    ) or pg_catalog.has_table_privilege(
      'anon', relation_value.oid, 'UPDATE'
    ) or pg_catalog.has_table_privilege(
      'anon', relation_value.oid, 'DELETE'
    ),
    'authenticatedDataAccess', pg_catalog.has_table_privilege(
      'authenticated', relation_value.oid, 'SELECT'
    ) or pg_catalog.has_table_privilege(
      'authenticated', relation_value.oid, 'INSERT'
    ) or pg_catalog.has_table_privilege(
      'authenticated', relation_value.oid, 'UPDATE'
    ) or pg_catalog.has_table_privilege(
      'authenticated', relation_value.oid, 'DELETE'
    ),
    'serviceRoleDataAccess', pg_catalog.has_table_privilege(
      'service_role', relation_value.oid, 'SELECT'
    ) or pg_catalog.has_table_privilege(
      'service_role', relation_value.oid, 'INSERT'
    ) or pg_catalog.has_table_privilege(
      'service_role', relation_value.oid, 'UPDATE'
    ) or pg_catalog.has_table_privilege(
      'service_role', relation_value.oid, 'DELETE'
    )
  ) order by requested.ordinality) into relation_manifest
  from pg_catalog.unnest(relation_names) with ordinality
    requested(relation_name, ordinality)
  join pg_catalog.pg_class relation_value
    on relation_value.oid = pg_catalog.to_regclass(requested.relation_name);
  if pg_catalog.jsonb_array_length(coalesce(
       relation_manifest, '[]'::jsonb
     )) <> pg_catalog.cardinality(relation_names) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_RELATION_REQUIRED';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(relation_names) requested(relation_name)
    join pg_catalog.pg_class relation_value
      on relation_value.oid = pg_catalog.to_regclass(requested.relation_name)
    where not relation_value.relrowsecurity
       or relation_value.relforcerowsecurity
       or exists (
         select 1 from pg_catalog.pg_policy policy_value
         where policy_value.polrelid = relation_value.oid
       )
       or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'SELECT'
       ) or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'INSERT'
       ) or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'UPDATE'
       ) or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'DELETE'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'SELECT'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'INSERT'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'UPDATE'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'DELETE'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'SELECT'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'INSERT'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'UPDATE'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'DELETE'
       ) or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'TRUNCATE'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'TRUNCATE'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'TRUNCATE'
       ) or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'REFERENCES'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'REFERENCES'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'REFERENCES'
       ) or pg_catalog.has_table_privilege(
         'anon', relation_value.oid, 'TRIGGER'
       ) or pg_catalog.has_table_privilege(
         'authenticated', relation_value.oid, 'TRIGGER'
       ) or pg_catalog.has_table_privilege(
         'service_role', relation_value.oid, 'TRIGGER'
       ) or pg_catalog.has_any_column_privilege(
         'anon', relation_value.oid, 'SELECT,INSERT,UPDATE,REFERENCES'
       ) or pg_catalog.has_any_column_privilege(
         'authenticated', relation_value.oid,
         'SELECT,INSERT,UPDATE,REFERENCES'
       ) or pg_catalog.has_any_column_privilege(
         'service_role', relation_value.oid,
         'SELECT,INSERT,UPDATE,REFERENCES'
       )
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_RELATION_SECURITY_REQUIRED';
  end if;
  if pg_catalog.has_schema_privilege(
       'anon', 'production_control', 'CREATE'
     ) or pg_catalog.has_schema_privilege(
       'authenticated', 'production_control', 'CREATE'
     ) or pg_catalog.has_schema_privilege(
       'service_role', 'production_control', 'CREATE'
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_SCHEMA_SECURITY_REQUIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-google-writer-implementation-v3',
    'installedContract',
      '202608300071_production_annual_reads_workers_v1',
    'requiredArtifacts', pg_catalog.jsonb_build_array(
      'LIVE_MATCHES_ROW', 'MATCHES_ROW'
    ),
    'leaseBound', true,
    'readbackRequired', true,
    'nonAuthoritative', true,
    'rollbackAllowed', false,
    'functions', function_manifest,
    'triggers', trigger_manifest,
    'relations', relation_manifest
  );
end;
$implementation_manifest$;

create or replace function
  production_control.future_google_writer_implementation_fingerprint_v2()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $implementation_fingerprint$
  select production_control.future_runtime_hash_v2(
    production_control.future_google_writer_implementation_manifest_v2()
  )
$implementation_fingerprint$;

create or replace function
  production_control.assert_future_google_writer_live_implementation_v2(
    target_tournament_id text
  )
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $assert_future_google_writer_live_implementation$
declare
  target production_control.future_google_writer_targets_v2%rowtype;
  writer production_control.future_google_writer_generations_v2%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  target_id text := pg_catalog.btrim(target_tournament_id);
begin
  select target_value.* into strict target
  from production_control.future_google_writer_targets_v2 target_value
  where target_value.tournament_id = target_id
    and target_value.contract_status = 'CERTIFIED';
  select generation.* into strict writer
  from production_control.future_google_writer_generations_v2 generation
  where generation.writer_generation_id = target.writer_generation_id
    and generation.certification_status = 'CERTIFIED';
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_id;
  select value.* into strict promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_id;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_id;
  if writer.implementation_fingerprint is distinct from
       production_control.future_google_writer_implementation_fingerprint_v2()
     or target.certification_contract_version is distinct from
       'production-annual-google-writer-certification-v1'
     or target.destination_workbook_id is distinct from
       resource.source_workbook_id
     or target.resource_revision is distinct from resource.resource_revision
     or target.resource_binding_fingerprint is distinct from
       production_control.future_google_writer_resource_fingerprint_v1(
         target_id
       )
     or target.promotion_revision is distinct from
       promotion.promotion_revision
     or target.source_setup_revision is distinct from
       promotion.source_setup_revision
     or target.source_setup_revision is distinct from catalog.setup_revision
     or target.promoted_manifest_fingerprint is distinct from
       promotion.promoted_manifest_fingerprint
     or target.target_contract_fingerprint is distinct from
       production_control.future_google_writer_target_fingerprint_v1(
         target_id
       )
  then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_IMPLEMENTATION_CERTIFICATION_STALE';
  end if;
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT_REQUIRED';
end;
$assert_future_google_writer_live_implementation$;

create or replace function production_control.assert_future_google_writer_v2(
  input jsonb,
  require_exact_contract boolean default true
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $assert_future_google_writer_implementation$
declare
  target_id text;
begin
  target_id := production_control
    .assert_future_google_writer_pre_implementation_cert_v2(
      input, require_exact_contract
    );
  perform production_control
    .assert_future_google_writer_live_implementation_v2(target_id);
  return target_id;
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT_REQUIRED';
end;
$assert_future_google_writer_implementation$;

create or replace function
  production_control.future_google_writer_generation_id_v2(
    destination_workbook text,
    implementation_fingerprint text
  )
returns uuid
language sql
immutable
set search_path = pg_catalog, production_control
as $generation_id$
  select (
    pg_catalog.substr(value.fingerprint, 1, 8) || '-' ||
    pg_catalog.substr(value.fingerprint, 9, 4) || '-5' ||
    pg_catalog.substr(value.fingerprint, 14, 3) || '-8' ||
    pg_catalog.substr(value.fingerprint, 18, 3) || '-' ||
    pg_catalog.substr(value.fingerprint, 21, 12)
  )::uuid
  from (
    select production_control.future_runtime_hash_v2(
      pg_catalog.jsonb_build_object(
        'contractVersion', 'production-future-google-writer-generation-v2',
        'destinationWorkbookId', destination_workbook,
        'implementationFingerprint', implementation_fingerprint
      )
    ) fingerprint
  ) value
$generation_id$;

create or replace function
  production_control.future_google_writer_resource_fingerprint_v1(
    target_tournament text
  )
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $resource_fingerprint$
declare
  resource production_control.future_tournament_resources_v1%rowtype;
begin
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_tournament;
  return production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-annual-google-resource-binding-v1',
      'tournamentId', resource.tournament_id,
      'projectRef', resource.project_ref,
      'projectUrl', resource.project_url,
      'destinationWorkbookId', resource.source_workbook_id,
      'resourceStatus', resource.resource_status,
      'resourceRevision', resource.resource_revision,
      'compatibilityPolicy', resource.google_compatibility_policy
    )
  );
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'PRODUCTION_FUTURE_GOOGLE_RESOURCE_REQUIRED';
end;
$resource_fingerprint$;

create or replace function
  production_control.future_google_writer_target_fingerprint_v1(
    target_tournament text
  )
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $target_fingerprint$
declare
  target production_control.future_google_writer_targets_v2%rowtype;
  writer production_control.future_google_writer_generations_v2%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  implementation_fingerprint text;
  resource_fingerprint text;
begin
  select value.* into strict target
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = pg_catalog.btrim(target_tournament);
  select value.* into strict writer
  from production_control.future_google_writer_generations_v2 value
  where value.writer_generation_id = target.writer_generation_id;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target.tournament_id;
  select value.* into strict promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target.tournament_id;
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target.tournament_id;
  implementation_fingerprint := production_control
    .future_google_writer_implementation_fingerprint_v2();
  resource_fingerprint := production_control
    .future_google_writer_resource_fingerprint_v1(target.tournament_id);
  return production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-annual-google-writer-certification-v1',
      'writerContractVersion',
        'production-future-google-match-provisioning-v2',
      'targetTournamentId', target.tournament_id,
      'tournamentYear', catalog.tournament_year,
      'setupRevision', catalog.setup_revision,
      'promotionRevision', promotion.promotion_revision,
      'promotedManifestFingerprint',
        promotion.promoted_manifest_fingerprint,
      'resourceRevision', resource.resource_revision,
      'resourceBindingFingerprint', resource_fingerprint,
      'writerGenerationId', production_control
        .future_google_writer_generation_id_v2(
          resource.source_workbook_id, implementation_fingerprint
        ),
      'implementationFingerprint', implementation_fingerprint,
      'requiredArtifacts', pg_catalog.jsonb_build_array(
        'LIVE_MATCHES_ROW', 'MATCHES_ROW'
      ),
      'nonAuthoritative', true,
      'rollbackAllowed', false
    )
  );
exception when no_data_found then
  raise exception using errcode = '55000',
    message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_CONTRACT_REQUIRED';
end;
$target_fingerprint$;

create or replace function public.adopt_production_future_google_destination_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $adopt_annual_destination$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  receipt production_control.future_google_writer_certification_receipts_v1%rowtype;
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  operation_id uuid;
  expected_resource_revision bigint;
  expected_setup_revision bigint;
  database_hash text;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  result_value jsonb;
begin
  perform production_control.assert_future_runtime_service_scope_v2(
    input, true, true
  );
  if input->>'action' is distinct from 'ADOPT_ANNUAL_GOOGLE_DESTINATION'
     or input ?| array[
       'destination_workbook_id', 'annual_destination_workbook_id',
       'target_workbook_id', 'writer_destination_workbook_id'
     ] then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_DESTINATION_INPUT_INVALID';
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    operation_id := (input->>'operation_request_id')::uuid;
    expected_resource_revision :=
      (input->>'expected_resource_revision')::bigint;
    expected_setup_revision :=
      (input->>'expected_setup_revision')::bigint;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_DESTINATION_INPUT_INVALID';
  end;
  if target_id !~ '^[0-9]{4}$' or target_id <= '2026'
     or expected_resource_revision <= 0 or expected_setup_revision < 0 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_DESTINATION_INPUT_INVALID';
  end if;
  perform production_control.assert_access_governance_safe_reason_v1(
    input->>'reason'
  );
  database_hash := production_control.future_runtime_hash_v2(
    input - 'request_payload_hash'
  );
  if declared_hash !~ '^[0-9a-f]{64}$'
     or declared_hash <> database_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_HASH_INVALID';
  end if;
  select value.* into receipt
  from production_control.future_google_writer_certification_receipts_v1 value
  where value.action = 'ADOPT_ANNUAL_GOOGLE_DESTINATION'
    and value.operation_request_id = operation_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'annual-google-writer-certification:' || target_id, 0
    )
  );
  select value.* into receipt
  from production_control.future_google_writer_certification_receipts_v1 value
  where value.action = 'ADOPT_ANNUAL_GOOGLE_DESTINATION'
    and value.operation_request_id = operation_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_id
  for update;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_id
  for update;
  if pointer.tournament_id = target_id
     or catalog.lifecycle not in ('DRAFT', 'CONFIGURING')
     or catalog.setup_revision <> expected_setup_revision
     or resource.resource_revision <> expected_resource_revision
     or resource.resource_status <> 'ANNUAL_RESOURCE_REQUIRED'
     or resource.source_workbook_id is not null
     or resource.google_compatibility_policy <> 'PROVISIONING_REQUIRED'
     or resource.project_ref is distinct from scope.project_ref
     or resource.project_url is distinct from scope.project_url
     or exists (
       select 1 from production_control.future_runtime_promotions_v2 value
       where value.tournament_id = target_id
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_FUTURE_GOOGLE_DESTINATION_PREDECESSOR_INVALID';
  end if;
  update production_control.future_tournament_resources_v1 value set
    source_workbook_id = scope.google_workbook_id,
    resource_status = 'CURRENT_RESOURCE_BOUND',
    google_compatibility_policy = 'PROVISIONING_REQUIRED',
    resource_revision = resource.resource_revision + 1,
    updated_by_player_id = actor_player,
    updated_at = pg_catalog.clock_timestamp()
  where value.tournament_id = target_id;
  result_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_FUTURE_GOOGLE_DESTINATION_ADOPTED',
    'action', 'ADOPT_ANNUAL_GOOGLE_DESTINATION',
    'targetTournamentId', target_id,
    'destinationClass', 'CURRENT_CERTIFIED_PRODUCTION_WORKBOOK',
    'priorResourceRevision', resource.resource_revision,
    'resourceRevision', resource.resource_revision + 1,
    'setupRevision', catalog.setup_revision,
    'nonAuthoritative', true,
    'idempotent', false
  );
  insert into production_control.future_google_writer_certification_receipts_v1 (
    action, target_tournament_id, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, prior_revision, next_revision,
    response
  ) values (
    'ADOPT_ANNUAL_GOOGLE_DESTINATION', target_id, operation_id,
    declared_hash, database_hash, actor_player, actor_auth,
    resource.resource_revision, resource.resource_revision + 1, result_value
  );
  insert into production_control.future_google_writer_certification_audit_v1 (
    action, target_tournament_id, actor_player_id, operation_request_id,
    prior_revision, next_revision, result, safe_metadata
  ) values (
    'ADOPT_ANNUAL_GOOGLE_DESTINATION', target_id, actor_player, operation_id,
    resource.resource_revision, resource.resource_revision + 1, 'CHANGED',
    pg_catalog.jsonb_build_object(
      'summary', 'Certified Production workbook adopted for future runtime',
      'destinationClass', 'CURRENT_CERTIFIED_PRODUCTION_WORKBOOK',
      'resourceRevision', resource.resource_revision + 1,
      'setupRevision', catalog.setup_revision,
      'nonAuthoritative', true
    )
  );
  return result_value;
exception when no_data_found then
  raise exception using errcode = '40001',
    message = 'PRODUCTION_FUTURE_GOOGLE_DESTINATION_PREDECESSOR_INVALID';
end;
$adopt_annual_destination$;

create or replace function public.certify_production_future_google_writer_target_v1(
  input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $certify_writer_target$
declare
  scope production_control.resource_scope%rowtype;
  pointer production_control.current_tournament_pointer_v1%rowtype;
  catalog production_control.future_tournament_catalog_v1%rowtype;
  resource production_control.future_tournament_resources_v1%rowtype;
  promotion production_control.future_runtime_promotions_v2%rowtype;
  writer production_control.future_google_writer_generations_v2%rowtype;
  target production_control.future_google_writer_targets_v2%rowtype;
  receipt production_control.future_google_writer_certification_receipts_v1%rowtype;
  target_id text := pg_catalog.btrim(coalesce(
    input->>'target_tournament_id', ''
  ));
  actor_player text := pg_catalog.upper(pg_catalog.btrim(coalesce(
    input#>>'{authorization,player_id}', ''
  )));
  actor_auth uuid;
  operation_id uuid;
  expected_resource_revision bigint;
  expected_setup_revision bigint;
  expected_promotion_revision bigint;
  implementation_fingerprint text;
  writer_generation_id_value uuid;
  resource_fingerprint text;
  target_fingerprint text;
  database_hash text;
  declared_hash text := pg_catalog.lower(pg_catalog.btrim(coalesce(
    input->>'request_payload_hash', ''
  )));
  result_value jsonb;
  changed_value boolean := true;
  attempts_before bigint;
  attempts_after bigint;
  jobs_bound integer;
  job record;
begin
  perform production_control.assert_future_runtime_service_scope_v2(
    input, true, true
  );
  if input->>'action'
       is distinct from 'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET'
     or input ?| array[
       'destination_workbook_id', 'annual_destination_workbook_id',
       'target_workbook_id', 'writer_destination_workbook_id'
     ] then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_INPUT_INVALID';
  end if;
  begin
    actor_auth := (input#>>'{authorization,auth_user_id}')::uuid;
    operation_id := (input->>'operation_request_id')::uuid;
    expected_resource_revision :=
      (input->>'expected_resource_revision')::bigint;
    expected_setup_revision :=
      (input->>'expected_setup_revision')::bigint;
    expected_promotion_revision :=
      (input->>'expected_promotion_revision')::bigint;
  exception when others then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_INPUT_INVALID';
  end;
  if target_id !~ '^[0-9]{4}$' or target_id <= '2026'
     or expected_resource_revision <= 0 or expected_setup_revision <= 0
     or expected_promotion_revision <= 0 then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_INPUT_INVALID';
  end if;
  perform production_control.assert_access_governance_safe_reason_v1(
    input->>'reason'
  );
  database_hash := production_control.future_runtime_hash_v2(
    input - 'request_payload_hash'
  );
  if declared_hash !~ '^[0-9a-f]{64}$'
     or declared_hash <> database_hash then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_HASH_INVALID';
  end if;
  select value.* into receipt
  from production_control.future_google_writer_certification_receipts_v1 value
  where value.action = 'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET'
    and value.operation_request_id = operation_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'annual-google-writer-certification:' || target_id, 0
    )
  );
  select value.* into receipt
  from production_control.future_google_writer_certification_receipts_v1 value
  where value.action = 'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET'
    and value.operation_request_id = operation_id;
  if receipt.receipt_id is not null then
    if receipt.database_request_payload_hash <> database_hash
       or receipt.declared_request_payload_hash <> declared_hash then
      raise exception using errcode = '23505',
        message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_IDEMPOTENCY_CONFLICT';
    end if;
    return receipt.response || pg_catalog.jsonb_build_object(
      'idempotent', true
    );
  end if;
  select value.* into strict scope
  from production_control.resource_scope value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict pointer
  from production_control.current_tournament_pointer_v1 value
  where value.scope_key = 'BAGGER_INV_PRODUCTION';
  select value.* into strict catalog
  from production_control.future_tournament_catalog_v1 value
  where value.tournament_id = target_id
  for update;
  select value.* into strict resource
  from production_control.future_tournament_resources_v1 value
  where value.tournament_id = target_id
  for update;
  select value.* into strict promotion
  from production_control.future_runtime_promotions_v2 value
  where value.tournament_id = target_id
  for update;
  if pointer.tournament_id = target_id
     or catalog.lifecycle <> 'CONFIGURING'
     or catalog.setup_revision <> expected_setup_revision
     or resource.resource_revision <> expected_resource_revision
     or resource.resource_status <> 'CURRENT_RESOURCE_BOUND'
     or resource.source_workbook_id is distinct from scope.google_workbook_id
     or resource.google_compatibility_policy <> 'PROVISIONING_REQUIRED'
     or resource.project_ref is distinct from scope.project_ref
     or resource.project_url is distinct from scope.project_url
     or promotion.promotion_revision <> expected_promotion_revision
     or promotion.source_setup_revision <> expected_setup_revision
     or promotion.runtime_status <> 'PROMOTED'
     or exists (
       select 1
       from production_control.future_match_google_compatibility_jobs_v1 value
       where value.tournament_id = target_id
         and (value.status = 'PROCESSING' or value.claim_token is not null
           or value.claimed_by is not null or value.lease_expires_at is not null)
     ) then
    raise exception using errcode = '40001',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_PREDECESSOR_INVALID';
  end if;
  implementation_fingerprint := production_control
    .future_google_writer_implementation_fingerprint_v2();
  writer_generation_id_value := production_control
    .future_google_writer_generation_id_v2(
      scope.google_workbook_id, implementation_fingerprint
    );
  resource_fingerprint := production_control
    .future_google_writer_resource_fingerprint_v1(target_id);
  target_fingerprint := production_control.future_runtime_hash_v2(
    pg_catalog.jsonb_build_object(
      'contractVersion',
        'production-annual-google-writer-certification-v1',
      'writerContractVersion',
        'production-future-google-match-provisioning-v2',
      'targetTournamentId', target_id,
      'tournamentYear', catalog.tournament_year,
      'setupRevision', catalog.setup_revision,
      'promotionRevision', promotion.promotion_revision,
      'promotedManifestFingerprint',
        promotion.promoted_manifest_fingerprint,
      'resourceRevision', resource.resource_revision,
      'resourceBindingFingerprint', resource_fingerprint,
      'writerGenerationId', writer_generation_id_value,
      'implementationFingerprint', implementation_fingerprint,
      'requiredArtifacts', pg_catalog.jsonb_build_array(
        'LIVE_MATCHES_ROW', 'MATCHES_ROW'
      ),
      'nonAuthoritative', true,
      'rollbackAllowed', false
    )
  );
  insert into production_control.future_google_writer_generations_v2 (
    writer_generation_id, contract_version, destination_workbook_id,
    implementation_fingerprint, certification_status
  ) values (
    writer_generation_id_value,
    'production-future-google-match-provisioning-v2',
    scope.google_workbook_id, implementation_fingerprint, 'CERTIFIED'
  ) on conflict (destination_workbook_id) where
    certification_status = 'CERTIFIED' do nothing;
  select value.* into strict writer
  from production_control.future_google_writer_generations_v2 value
  where value.destination_workbook_id = scope.google_workbook_id
    and value.certification_status = 'CERTIFIED';
  if writer.writer_generation_id is distinct from writer_generation_id_value
     or writer.contract_version is distinct from
       'production-future-google-match-provisioning-v2'
     or writer.implementation_fingerprint is distinct from
       implementation_fingerprint then
    raise exception using errcode = '23505',
      message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_GENERATION_CONFLICT';
  end if;
  select value.* into target
  from production_control.future_google_writer_targets_v2 value
  where value.tournament_id = target_id;
  if target.tournament_id is null then
    insert into production_control.future_google_writer_targets_v2 (
      tournament_id, writer_generation_id, destination_workbook_id,
      target_contract_fingerprint, contract_status,
      certification_contract_version, resource_revision,
      promotion_revision, source_setup_revision,
      promoted_manifest_fingerprint, resource_binding_fingerprint
    ) values (
      target_id, writer_generation_id_value, scope.google_workbook_id,
      target_fingerprint, 'CERTIFIED',
      'production-annual-google-writer-certification-v1',
      resource.resource_revision, promotion.promotion_revision,
      promotion.source_setup_revision,
      promotion.promoted_manifest_fingerprint, resource_fingerprint
    );
  elsif target.writer_generation_id is distinct from writer_generation_id_value
     or target.destination_workbook_id is distinct from
       scope.google_workbook_id
     or target.target_contract_fingerprint is distinct from target_fingerprint
     or target.contract_status <> 'CERTIFIED'
     or target.certification_contract_version is distinct from
       'production-annual-google-writer-certification-v1'
     or target.resource_revision <> resource.resource_revision
     or target.promotion_revision <> promotion.promotion_revision
     or target.source_setup_revision <> promotion.source_setup_revision
     or target.promoted_manifest_fingerprint is distinct from
       promotion.promoted_manifest_fingerprint
     or target.resource_binding_fingerprint is distinct from
       resource_fingerprint then
    raise exception using errcode = '23505',
      message = 'PRODUCTION_FUTURE_GOOGLE_WRITER_TARGET_CONFLICT';
  else
    changed_value := false;
  end if;
  select coalesce(pg_catalog.sum(value.attempts), 0) into attempts_before
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.tournament_id = target_id;
  for job in
    select value.match_id
    from production_control.future_match_google_compatibility_jobs_v1 value
    where value.tournament_id = target_id
    order by value.match_id
  loop
    perform production_control.sync_future_google_writer_job_v2(
      target_id, job.match_id
    );
  end loop;
  select coalesce(pg_catalog.sum(value.attempts), 0),
    pg_catalog.count(*) filter (where value.writer_installed)
      into attempts_after, jobs_bound
  from production_control.future_match_google_compatibility_jobs_v1 value
  where value.tournament_id = target_id;
  if attempts_after <> attempts_before or exists (
    select 1
    from production_control.future_match_google_compatibility_jobs_v1 value
    where value.tournament_id = target_id
      and (value.status = 'PROCESSING' or value.claim_token is not null
        or value.claimed_by is not null or value.lease_expires_at is not null)
  ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_CLAIM_FORBIDDEN';
  end if;
  -- Recompute the installed implementation and the complete live target
  -- attestation after every binding update, before persisting the immutable
  -- success receipt. A changed function/ACL/trigger/resource cannot be
  -- certified by a hash sampled only at the start of this transaction.
  perform production_control
    .assert_future_google_writer_live_implementation_v2(target_id);
  result_value := pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'PRODUCTION_FUTURE_GOOGLE_WRITER_TARGET_CERTIFIED',
    'action', 'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET',
    'targetTournamentId', target_id,
    'writerGenerationId', writer_generation_id_value,
    'implementationFingerprint', implementation_fingerprint,
    'targetContractFingerprint', target_fingerprint,
    'resourceBindingFingerprint', resource_fingerprint,
    'resourceRevision', resource.resource_revision,
    'promotionRevision', promotion.promotion_revision,
    'setupRevision', promotion.source_setup_revision,
    'jobsBound', jobs_bound,
    'jobsClaimed', 0,
    'googleWrites', 0,
    'nonAuthoritative', true,
    'idempotent', not changed_value
  );
  insert into production_control.future_google_writer_certification_receipts_v1 (
    action, target_tournament_id, operation_request_id,
    declared_request_payload_hash, database_request_payload_hash,
    actor_player_id, actor_auth_user_id, prior_revision, next_revision,
    response
  ) values (
    'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET', target_id, operation_id,
    declared_hash, database_hash, actor_player, actor_auth,
    promotion.promotion_revision, promotion.promotion_revision, result_value
  );
  insert into production_control.future_google_writer_certification_audit_v1 (
    action, target_tournament_id, actor_player_id, operation_request_id,
    prior_revision, next_revision, result, safe_metadata
  ) values (
    'CERTIFY_ANNUAL_GOOGLE_WRITER_TARGET', target_id, actor_player,
    operation_id, promotion.promotion_revision, promotion.promotion_revision,
    case when changed_value then 'CHANGED' else 'NO_CHANGE' end,
    pg_catalog.jsonb_build_object(
      'summary', 'Future Google compatibility writer target certified',
      'resourceRevision', resource.resource_revision,
      'promotionRevision', promotion.promotion_revision,
      'setupRevision', promotion.source_setup_revision,
      'jobsBound', jobs_bound,
      'jobsClaimed', 0,
      'googleWrites', 0,
      'nonAuthoritative', true
    )
  );
  return result_value;
exception when no_data_found then
  raise exception using errcode = '40001',
    message = 'PRODUCTION_FUTURE_GOOGLE_CERTIFICATION_PREDECESSOR_INVALID';
end;
$certify_writer_target$;

revoke all on table
  production_control.future_google_writer_certification_receipts_v1,
  production_control.future_google_writer_certification_audit_v1
from public, anon, authenticated, service_role;

revoke all on function
  production_control.future_google_writer_implementation_manifest_v2(),
  production_control.future_google_writer_implementation_fingerprint_v2(),
  production_control.future_google_writer_generation_id_v2(text, text),
  production_control.future_google_writer_resource_fingerprint_v1(text),
  production_control.future_google_writer_target_fingerprint_v1(text),
  production_control
    .assert_future_google_writer_live_implementation_v2(text),
  production_control.assert_future_google_writer_v2(jsonb, boolean),
  production_control
    .assert_future_google_writer_pre_implementation_cert_v2(jsonb, boolean),
  public.adopt_production_future_google_destination_v1(jsonb),
  public.certify_production_future_google_writer_target_v1(jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.adopt_production_future_google_destination_v1(jsonb),
  public.certify_production_future_google_writer_target_v1(jsonb)
to service_role;

comment on function public.adopt_production_future_google_destination_v1(jsonb)
is 'Owner-only Stage 1 adoption of the exact resource_scope Production workbook for an unpromoted future tournament; no caller destination is accepted.';

comment on function public.certify_production_future_google_writer_target_v1(jsonb)
is 'Owner-only Stage 2 deterministic certification of the V2 non-authoritative future Google compatibility writer after runtime promotion; binds jobs without claiming or writing Google.';

commit;
