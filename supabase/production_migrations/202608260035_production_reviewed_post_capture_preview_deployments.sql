begin;

-- Extend the live Vercel inventory assertion with the exact Preview
-- deployments created while correcting the Step 11.6 candidate after the
-- retained 1,140-record inventory was frozen. The current candidate remains a
-- separate dynamic tuple, and provider-proven same-SHA redeploys remain
-- supported for the eventual Preview + Production cutover pair.
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
  normalized_retained jsonb;
  normalized_reviewed jsonb;
  normalized_live jsonb;
  expected_candidate jsonb;
  expected_candidate_record jsonb;
  live_count integer;
begin
  if candidate_deployment_target not in ('PREVIEW', 'PRODUCTION')
     or pg_catalog.jsonb_typeof(live_inventory) is distinct from 'array' then
    raise exception using errcode = '22023',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_INPUT_INVALID';
  end if;
  normalized_retained :=
    production_control.normalized_vercel_origin_inventory(retained_inventory);
  normalized_reviewed := production_control.normalized_vercel_origin_inventory(
    '[
      [
        "dpl_32Upq6iEQoD2MVdxcWWVihj66hEg",
        "41b0517e4e1679536438109ea61028663c80508f",
        "https://bagger-c1miwfnb1-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ],
      [
        "dpl_44fXUMdcS7QbQiJvMimX1DozcZrR",
        "fdda563eaab6569a6c8e0442ef8118fdc0db8569",
        "https://bagger-m3t3ao7ui-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ],
      [
        "dpl_ENU4XkC1dpbj9aho5gTz2x8zw9qP",
        "85eb5efce7f5c9d9292e007fc093c05d7dd5c356",
        "https://bagger-7zpm6cjp3-sandbagger-invitational.vercel.app",
        "FEATURE_PREVIEW", "READY", "GIT"
      ]
    ]'::jsonb
  );
  normalized_live :=
    production_control.normalized_vercel_origin_inventory(live_inventory);
  expected_candidate := production_control.expected_vercel_live_inventory(
    '[]'::jsonb, candidate_deployment_id, candidate_deployment_commit,
    candidate_immutable_origin, candidate_deployment_target
  );
  expected_candidate_record := expected_candidate->0;
  live_count := pg_catalog.jsonb_array_length(normalized_live);

  if normalized_live is distinct from live_inventory
     or live_count < pg_catalog.jsonb_array_length(normalized_retained)
       + pg_catalog.jsonb_array_length(normalized_reviewed) + 1
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         normalized_retained || normalized_reviewed
       ) required(record)
       where required.record->>0 = candidate_deployment_id
          or required.record->>2 = pg_catalog.lower(pg_catalog.rtrim(
            candidate_immutable_origin, '/'
          ))
     )
     or (select pg_catalog.count(distinct value->>0)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       live_count
     or (select pg_catalog.count(distinct value->>2)
       from pg_catalog.jsonb_array_elements(normalized_live) value) <>
       live_count
     or exists (
       select value from pg_catalog.jsonb_array_elements(normalized_retained)
       except
       select value from pg_catalog.jsonb_array_elements(normalized_live)
     )
     or exists (
       select value from pg_catalog.jsonb_array_elements(normalized_reviewed)
       except
       select value from pg_catalog.jsonb_array_elements(normalized_live)
     )
     or (select pg_catalog.count(*)
       from pg_catalog.jsonb_array_elements(normalized_live) value
       where value = expected_candidate_record) <> 1
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(normalized_live) value
       where (value->>0 = candidate_deployment_id
           or value->>2 = pg_catalog.lower(pg_catalog.rtrim(
             candidate_immutable_origin, '/'
           )))
         and value is distinct from expected_candidate_record
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) live(record)
       join pg_catalog.jsonb_array_elements(normalized_reviewed) reviewed(record)
         on live.record->>0 = reviewed.record->>0
           or live.record->>2 = reviewed.record->>2
       where live.record is distinct from reviewed.record
     )
     or exists (
       select 1
       from pg_catalog.jsonb_array_elements(normalized_live) live(record)
       where pg_catalog.jsonb_typeof(live.record) is distinct from 'array'
         or pg_catalog.jsonb_array_length(live.record) <> 6
         or coalesce(live.record->>0, '') !~ '^dpl_[A-Za-z0-9]{8,64}$'
         or (live.record->1 <> 'null'::jsonb
           and coalesce(live.record->>1, '') !~ '^[0-9a-f]{40}$')
         or coalesce(live.record->>2, '') !~ '^https://[a-z0-9.-]+$'
         or live.record->>3 not in (
           'MAIN_PRODUCTION', 'FEATURE_PREVIEW',
           'CUTOVER_PRODUCTION_CANDIDATE'
         )
         or live.record->>4 not in ('READY', 'ERROR', 'BLOCKED')
         or live.record->>5 not in (
           'GIT', 'REDEPLOY_INHERITED_GIT',
           'VERCEL_API_RESOLVED_GIT',
           'VERCEL_CLI_SHA_UNAVAILABLE'
         )
         or (not exists (
           select 1
           from pg_catalog.jsonb_array_elements(normalized_retained)
             retained(record)
           where retained.record = live.record
         ) and not exists (
           select 1
           from pg_catalog.jsonb_array_elements(normalized_reviewed)
             reviewed(record)
           where reviewed.record = live.record
         ) and (
           live.record->1 = 'null'::jsonb
           or live.record->>1 <> pg_catalog.lower(candidate_deployment_commit)
           or (candidate_deployment_target = 'PREVIEW'
             and live.record->>3 <> 'FEATURE_PREVIEW')
           or (candidate_deployment_target = 'PRODUCTION'
             and live.record->>3 not in (
               'FEATURE_PREVIEW', 'CUTOVER_PRODUCTION_CANDIDATE'
             ))
           or live.record->>5 <> 'GIT'
         ))
     ) then
    raise exception using errcode = '55000',
      message = 'PRODUCTION_VERCEL_LIVE_ORIGIN_INVENTORY_MISMATCH';
  end if;
end;
$$;

revoke all on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) to service_role;

comment on function production_control.assert_exact_vercel_live_inventory(
  jsonb, jsonb, text, text, text, text
) is 'Fail-closed exact Vercel live-origin assertion with three reviewed post-capture Preview deployments and one dynamic cutover candidate.';

commit;
