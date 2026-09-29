-- Phase 2C: runtime-proven special-expression corrections and ordered worker locks.
-- Candidate only. No score formulas, authorization, publication policy, or response changes.
-- Install after migration 121 (and the independent additive recovery migration 122).
begin;

do $certification_boundary$
begin
  if exists (select 1 from production_control.annual_side_game_runtime_certifications_v1) then
    raise exception using errcode = '55000',
      message = 'PHASE2C_WORKER_SQL_EXISTING_CERTIFICATION_REQUIRES_REVIEW';
  end if;
end;
$certification_boundary$;

-- Migration 066 named the obsolete 064 false-only CHECK incorrectly, leaving it
-- installed beside 071's certified-writer shape. Remove only that exact obsolete
-- constraint; retain the positive certification/shape, defaults, and NOT NULL.
do $obsolete_writer_constraint$
declare relation regclass := 'production_control.future_match_google_compatibility_jobs_v1'::regclass;
begin
  if not exists (select 1 from pg_constraint where conrelid=relation
    and conname='future_match_google_compatibility_jobs_v_writer_installed_check'
    and contype='c' and convalidated and pg_get_constraintdef(oid)='CHECK ((NOT writer_installed))')
    or not exists (select 1 from pg_constraint where conrelid=relation
      and conname='production_future_google_certified_writer_shape_v2' and contype='c' and convalidated
      and encode(extensions.digest(pg_get_constraintdef(oid),'sha256'),'hex')=
        '4a126be40f616a76422fc71606b42ff2fdfff72b8e6fccdb0583934f47197c28')
    or not exists (select 1 from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=relation and a.attname='writer_installed' and a.attnotnull
        and pg_get_expr(d.adbin,d.adrelid)='false') then
    raise exception 'PHASE2C_WRITER_CONSTRAINT_PRECONDITION_FAILED';
  end if;
  alter table production_control.future_match_google_compatibility_jobs_v1
    drop constraint future_match_google_compatibility_jobs_v_writer_installed_check;
end;
$obsolete_writer_constraint$;

-- LEAST/GREATEST are PostgreSQL expressions, not schema-qualified functions.
-- Explicit installed-source hashes also cover renamed pre-generation/frozen helpers.
-- Do not edit historical migration or certificate evidence in place.
do $expressions$
declare
  item record;
  definition text;
  source text;
  attributes jsonb;
  attributes_after jsonb;
begin
  for item in select * from (values
    ('public.claim_production_future_match_google_compatibility_v2(jsonb)', 'ef39d500843b32f354a35cfa80d021a0ba2d74f11c0173d7d22698b1afde5965', 'f286ef70a44f1f7f5c27f356576b2903eed6085c6465a11763d19648cc49f0de'),
    ('public.future_production_claim_calcutta_recalculation_v1(jsonb)', '2deb97dcdc7f323dcb1fb264f0a275187d314c2a1ce2086ba9a668836b096473', '14d56a9903584df13d0e0f55e9e27e9622f4f3db6ea78e29da0f88c559af2715'),
    ('public.future_production_claim_competition_derived_jobs_v1(jsonb)', '28209a564555cb4a24554f1753e091186a442a71bcb7dbe1f7884e7d8b46352f', 'ad8805f52e950258a504f644f305e0e62ab3982c6c28d1e8491281fbd55081ab'),
    ('public.future_production_claim_google_outbox_event_pre_generation_v1(jsonb)', 'fb8ab38d78774c8b55ac8f33a77d75cd70140e0c22a41e289022f1f0e31d7d11', '7710a5971b9f2f7bd40e8423751f4303c50f9bc6b868656aaf665508d2b3314f'),
    ('public.future_production_claim_google_outbox_pre_generation_v1(jsonb)', 'd97711e2902ec8ca4a4002bc28a08782598e18a5418a9decb19c261d3c5449f5', '23524dc41af0bf330f808b94da82ce2238eabd74b76e149ab2d7786666bda28b'),
    ('public.future_production_claim_intelligence_derived_bundle_v1(jsonb)', 'e53b2e9761b5a18376f5a41573bcba4542366b08664bc8622733398000f195dc', '91b032510ed073e6029d6bfbc642024d4528279e69cd09d8766760649d4d459b'),
    ('public.future_production_claim_scorecard_archive_job_pre_generation_v1(jsonb)', 'f7256bb2f1a2f274d300fa86299760ac82ee75e63f7b2e53d0590314d24c20bf', '23792bdde5607d95b2a8aa87bd361ca72eca42f66ed843773b0bfe9356599886'),
    ('public.future_production_dispatch_odds_pre_withdrawal_v1(jsonb)', '92cf6ca7d19aa7f550dd9957b9b525a5132bd8c32af814caffd7eb1f47984d99', '2402f281143c0d4160451c69bfe96ed844695e38f98278e51c2a5aff233231dd'),
    ('public.future_production_fail_google_outbox_pre_generation_v1(jsonb)', '33d5993ecd8accee37b909c305d7578435fd40185363bc9b14f92ffba98661da', '30d6f1ea103671ba73b299e7e1612c5f02ff02c8fd07bbacd817809b5db14354'),
    ('public.future_production_fail_scorecard_archive_job_pre_generation_v1(jsonb)', 'd8e87d7c4e7666b89a1d0ee4b9b7808c807e7d39f2e68107d69eefda0cd0c795', 'e473a574683798bc16aca86315a6e14e4a89988d6fe5ca6150c6eedd84041631'),
    ('public.future_production_write_competition_derived_snapshot_v1(jsonb)', '945d8316fd5041f01d28f661a2846dd12aabf56eaf2d4292618f16fc806c2b4b', '55f94db2aa399af45b8176cdfdccdc5b0d76d57ecfe254149538698c89adf48c'),
    ('public.future_production_write_intelligence_derived_bundle_v1(jsonb)', '9cd9775c787fafab1f5f588b46107a84723a32690f159d83f74ea9c13bf51b44', '96d212e86791c6e9fa803b0890fa62f80e07dd56c7db6244dffa48ebbdecb92e'),
    ('production_control.frozen_2026_write_competition_derived_snapshot_v1(jsonb)', 'cae939c391a4ff509a10db0a10108b00ae33bc40388b4a459e071641aedb32bf', '7ae66018d409d3e8a559d84583408e0a724fbd3c0d6b2835cd92cff4ce2d3df5'),
    ('production_control.frozen_2026_write_intelligence_derived_bundle_v1(jsonb)', '866a84944e4240bff823ff394b77dc439a0eae601f57a2379e55c10df30ecc3d', '852390c7aa81228593e1c98a2884a1268c1bbaca32604bb6ebfb53b536ad8acc')
  ) value(signature, before_hash, after_hash)
  loop
    select pg_get_functiondef(p.oid), p.prosrc,
      jsonb_build_object('owner', p.proowner, 'acl', p.proacl,
        'definer', p.prosecdef, 'config', p.proconfig,
        'volatile', p.provolatile, 'parallel', p.proparallel)
      into strict definition, source, attributes
      from pg_proc p where p.oid = item.signature::regprocedure;
    if encode(extensions.digest(source, 'sha256'), 'hex') <> item.before_hash then
      raise exception 'PHASE2C_WORKER_SOURCE_MISMATCH: %', item.signature;
    end if;
    definition := replace(replace(definition,
      'pg_catalog.least(', 'least('), 'pg_catalog.greatest(', 'greatest(');
    execute definition;
    select p.prosrc,
      jsonb_build_object('owner', p.proowner, 'acl', p.proacl,
        'definer', p.prosecdef, 'config', p.proconfig,
        'volatile', p.provolatile, 'parallel', p.proparallel)
      into strict source, attributes_after
      from pg_proc p where p.oid = item.signature::regprocedure;
    if encode(extensions.digest(source, 'sha256'), 'hex') <> item.after_hash
       or attributes_after is distinct from attributes then
      raise exception 'PHASE2C_WORKER_PATCH_INTEGRITY_FAILED: %', item.signature;
    end if;
  end loop;
end;
$expressions$;

-- The first successful annual bundle invocation exposed a second dormant error:
-- its local variable shadowed the ON CONFLICT column name (SQLSTATE 42702).
-- Rename only the PL/pgSQL variable; table columns and fingerprints are unchanged.
do $annual_intelligence_ambiguity$
declare definition text; source text;
begin
  select pg_get_functiondef(oid),prosrc into strict definition,source from pg_proc
    where oid='public.future_production_write_intelligence_derived_bundle_v1(jsonb)'::regprocedure;
  if encode(extensions.digest(source,'sha256'),'hex')<>'96d212e86791c6e9fa803b0890fa62f80e07dd56c7db6244dffa48ebbdecb92e' then
    raise exception 'PHASE2C_ANNUAL_INTELLIGENCE_SOURCE_MISMATCH';
  end if;
  definition:=replace(replace(replace(definition,
    '  configuration_fingerprint text;','  target_configuration_fingerprint text;'),
    '    configuration_fingerprint :=','    target_configuration_fingerprint :='),
    'configuration_fingerprint, target_source','target_configuration_fingerprint, target_source');
  execute definition;
  select prosrc into strict source from pg_proc
    where oid='public.future_production_write_intelligence_derived_bundle_v1(jsonb)'::regprocedure;
  if encode(extensions.digest(source,'sha256'),'hex')<>'a5206fc9449802c7b837e821f73b9b03c38dccbde5b6c87f2a5f5a51b3007960' then
    raise exception 'PHASE2C_ANNUAL_INTELLIGENCE_PATCH_INTEGRITY_FAILED';
  end if;
end;
$annual_intelligence_ambiguity$;

-- A batch can enqueue R1 then R2 while another transaction does R2 then R1.
-- Sorting a single batch does not prevent a second flush in the same transaction
-- from inverting that order. Acquire the bounded three-round lock set first.
-- These are the existing enqueue locks, scoped to tournament/runtime generation.
-- Only Net Skins materialization/claim transactions serialize; scoring and the
-- external calculations do not acquire these locks. No new global lock exists.
do $ordered_net_skins_locks$
declare
  definition text;
  source text;
  needle text;
  replacement text;
begin
  select pg_get_functiondef(p.oid), p.prosrc into strict definition, source
    from pg_proc p where p.oid =
      'production_control.flush_score_derived_intents_v1(text,text,integer)'::regprocedure;
  if encode(extensions.digest(source, 'sha256'), 'hex') <>
     'a87a7b695ed6b74f0ca57709833cbe92c841be0cd51e24db11a181b2aa338e8f' then
    raise exception 'PHASE2C_NET_SKINS_LOCK_SOURCE_MISMATCH';
  end if;
  needle := E'  ready_at timestamptz := clock_timestamp();';
  replacement := needle || E'\n  round_lock_number integer;';
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'PHASE2C_NET_SKINS_LOCK_DECLARATION_MISMATCH';
  end if;
  definition := replace(definition, needle, replacement);
  needle := '  for intent in select * from scoring_authority.score_derived_intents_v1 value';
  replacement := $prefix$  -- Canonical round order before any intent or derived job row lock.
  if family_value = 'NET_SKINS' then
    for round_lock_number in 1..3 loop
      if target = '2026' then
        perform pg_advisory_xact_lock(hashtextextended(format(
          'production-net-skins-v1:enqueue:2026:R%s', round_lock_number),
          202608290055));
      else
        perform pg_advisory_xact_lock(hashtextextended(format(
          'production-net-skins-v1:enqueue:%s:%s:R%s', target, generation,
          round_lock_number), 202608300074));
      end if;
    end loop;
  end if;
$prefix$ || needle;
  if (length(definition) - length(replace(definition, needle, ''))) / length(needle) <> 1 then
    raise exception 'PHASE2C_NET_SKINS_LOCK_LOOP_MISMATCH';
  end if;
  execute replace(definition, needle, replacement);
end;
$ordered_net_skins_locks$;


-- Runtime-proven pre-existing102/072 integration defect: the manifest rejected
-- the sixth trigger installed to protect new actor attribution. Recognize only
-- that exact security contract; do not remove or weaken the trigger itself.
do $google_authorship_manifest$
declare definition text; source text; attributes jsonb; after_attributes jsonb;
begin
  select pg_get_functiondef(oid),prosrc,jsonb_build_object('owner',proowner,'acl',proacl,
    'definer',prosecdef,'config',proconfig,'volatile',provolatile,'parallel',proparallel)
    into strict definition,source,attributes from pg_proc where oid=
      'production_control.future_google_writer_implementation_manifest_v2()'::regprocedure;
  if encode(extensions.digest(source,'sha256'),'hex')<>'793b904e72090e62ba08cedecdcccdbb07ff0f7afafe1b5228573addc80ce314' then
    raise exception 'PHASE2C_GOOGLE_MANIFEST_SOURCE_MISMATCH';
  end if;
  definition:=replace(definition,'  relation_manifest jsonb;',E'  relation_manifest jsonb;\n  authorship_manifest jsonb;');
  definition:=replace(definition,'  if 5 <> (','  if 6 <> (');
  definition:=replace(definition,$anchor$  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-google-writer-implementation-v3',$anchor$,
    $authorship$  -- Migration102 added this exact security trigger to the receipt table.
  -- Preserve the old five-trigger topology and reject every unrecognized extra.
  if 1 <> (
    select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and t.tgname='bagger_live_actor_auth_user_id'
      and t.tgrelid='production_control.future_google_writer_certification_receipts_v1'::regclass
      and t.tgfoid='participant_identity.require_live_authorship_v1()'::regprocedure
      and t.tgtype=23 and t.tgenabled='O' and t.tgnargs=1
      and encode(t.tgargs,'hex')='6163746f725f617574685f757365725f696400'
      and cardinality(t.tgattr::smallint[])=1 and (select attnum from pg_attribute
        where attrelid=t.tgrelid and attname='actor_auth_user_id' and not attisdropped)=any(t.tgattr::smallint[])
      and p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[]
      and encode(extensions.digest(p.prosrc,'sha256'),'hex')='fdc0e44e1e1445256efb4018e37998df2c3a089ffd62103a415c695f1f8491b1'
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE')
  ) then
    raise exception using errcode='55000',message='PRODUCTION_FUTURE_GOOGLE_AUTHORSHIP_TOPOLOGY_REQUIRED';
  end if;
  select jsonb_build_object('name',t.tgname,'table',t.tgrelid::regclass::text,
    'definition',pg_get_triggerdef(t.oid,true),'type',t.tgtype,
    'attributes',t.tgattr::text,'arguments',encode(t.tgargs,'hex'),'enabled',t.tgenabled::text,
    'function',t.tgfoid::regprocedure::text,'functionSourceSha256',encode(extensions.digest(p.prosrc,'sha256'),'hex'),
    'functionSource',p.prosrc,'functionSecurityDefiner',p.prosecdef,
    'functionConfiguration',p.proconfig,'functionAcl',p.proacl) into authorship_manifest
    from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and t.tgname='bagger_live_actor_auth_user_id'
      and t.tgrelid='production_control.future_google_writer_certification_receipts_v1'::regclass;

$authorship$||$anchor$  return pg_catalog.jsonb_build_object(
    'contractVersion', 'production-future-google-writer-implementation-v3',$anchor$);
  definition:=replace(definition,$before$    'triggers', trigger_manifest,$before$,
    $after$    'triggers', trigger_manifest,
    'liveAuthorship', authorship_manifest,$after$);
  execute definition;
  select prosrc,jsonb_build_object('owner',proowner,'acl',proacl,'definer',prosecdef,
    'config',proconfig,'volatile',provolatile,'parallel',proparallel)
    into strict source,after_attributes from pg_proc where oid=
      'production_control.future_google_writer_implementation_manifest_v2()'::regprocedure;
  if encode(extensions.digest(source,'sha256'),'hex')<>'7a6da1360d45b3e2706bf793b7ef16af87abfa4a27d0c7d2d0cd3ff8e71a3ca8' or after_attributes is distinct from attributes then
    raise exception 'PHASE2C_GOOGLE_MANIFEST_PATCH_INTEGRITY_FAILED';
  end if;
end;
$google_authorship_manifest$;

commit;
