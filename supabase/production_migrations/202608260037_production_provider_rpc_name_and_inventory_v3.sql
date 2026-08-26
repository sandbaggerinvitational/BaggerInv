begin;

-- PostgreSQL silently truncates identifiers after 63 bytes. Migration 036's
-- SQL callers could resolve the truncated inspect function, but PostgREST uses
-- the requested RPC name literally and therefore could not expose it. Keep the
-- original terminal implementation intact and add one service-only RPC whose
-- complete name is safely below the PostgreSQL identifier limit.
create or replace function public.inspect_production_vercel_provider_challenge_abandonment(
  input jsonb
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog
as $$
  select public.inspect_production_vercel_provider_attestation_challenge_abando($1)
$$;

revoke all on function
  public.inspect_production_vercel_provider_challenge_abandonment(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function
  public.inspect_production_vercel_provider_challenge_abandonment(jsonb)
  to service_role;

comment on function
  public.inspect_production_vercel_provider_challenge_abandonment(jsonb)
  is 'PostgREST-safe service-only alias that locks and classifies one exact retained provider BEGIN challenge without mutation.';

-- Preserve migration 036's exact five-tuple assertion under an internal name,
-- then layer the exact reviewed b6f50d2 candidate on top. This keeps the prior
-- reviewed proof intact and prevents the next dynamic candidate from treating
-- this known different-SHA deployment as an arbitrary scope widening.
alter function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) rename to assert_exact_vercel_live_inventory_v2;

revoke all on function production_control.assert_exact_vercel_live_inventory_v2(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function production_control.assert_exact_vercel_live_inventory_v2(
  jsonb, jsonb, text, text, text, text
) to service_role;

create or replace function production_control.assert_exact_vercel_live_inventory(
  retained_inventory jsonb,
  live_inventory jsonb,
  candidate_deployment_id text,
  candidate_deployment_commit text,
  candidate_immutable_origin text,
  candidate_deployment_target text
)
returns void
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  normalized_live jsonb;
  reviewed_addition jsonb;
  reviewed_record jsonb;
  delegated_live jsonb;
begin
  normalized_live :=
    production_control.normalized_vercel_origin_inventory(live_inventory);
  reviewed_addition := production_control.normalized_vercel_origin_inventory(
    '[
      [
        "dpl_idZKEn956pcuEXctKS5HPoWfEn4Y",
        "b6f50d24d9a96c845305210b958ccf716bbf994d",
        "https://bagger-aggbtffot-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ]
    ]'::jsonb
  );
  reviewed_record := reviewed_addition->0;

  if normalized_live is distinct from live_inventory
     or candidate_deployment_id = reviewed_record->>0
     or pg_catalog.lower(pg_catalog.rtrim(candidate_immutable_origin, '/')) =
       reviewed_record->>2
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where value = reviewed_record) <> 1
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where (value->>0 = reviewed_record->>0
           or value->>2 = reviewed_record->>2)
         and value is distinct from reviewed_record
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      value order by (value->>0) collate "C",
        pg_catalog.lower(pg_catalog.rtrim(value->>2, '/'))
    ),
    '[]'::jsonb
  )
  into delegated_live
  from pg_catalog.jsonb_array_elements(normalized_live) value
  where value is distinct from reviewed_record;

  perform production_control.assert_exact_vercel_live_inventory_v2(
    retained_inventory,
    delegated_live,
    candidate_deployment_id,
    candidate_deployment_commit,
    candidate_immutable_origin,
    candidate_deployment_target
  );
end;
$$;

revoke all on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) to service_role;

comment on function production_control.assert_exact_vercel_live_inventory_v2(
  jsonb, jsonb, text, text, text, text
) is 'Internal migration-036 exact live-origin assertion retained for compositional reviewed-deployment verification.';
comment on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) is 'Fail-closed exact Vercel live-origin assertion with six reviewed post-capture Preview deployments and one collision-free dynamic cutover candidate.';

-- Make the new service-only RPC discoverable immediately by every PostgREST
-- instance. This notification changes schema metadata only.
notify pgrst, 'reload schema';

commit;
