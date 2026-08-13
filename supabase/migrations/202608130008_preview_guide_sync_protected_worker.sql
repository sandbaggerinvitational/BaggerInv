-- Protected Preview Guide synchronization scheduler.
-- Configuration is intentionally empty and disabled at migration time.  A
-- service-only configuration RPC copies the already-established Preview Vercel
-- automation bypass inside Postgres and accepts a distinct Guide bearer secret.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table scoring_authority.guide_sync_worker_configuration (
  configuration_id boolean primary key default true check (configuration_id),
  project_ref text not null check (project_ref = 'idgigvjjqkfbqjeredpb'),
  tournament_id text not null check (tournament_id = '2026'),
  source_workbook_id text not null check (
    source_workbook_id <> '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4'
  ),
  endpoint_url text not null check (
    endpoint_url = 'https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app/api/cron/guide-sync'
  ),
  worker_secret text not null check (length(worker_secret) >= 32),
  vercel_protection_bypass text not null check (length(vercel_protection_bypass) >= 32),
  enabled boolean not null default false,
  configured_by text not null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_request_id bigint,
  last_invocation_id uuid,
  last_requested_at timestamptz,
  check (btrim(source_workbook_id) <> ''),
  check (btrim(configured_by) <> ''),
  check (worker_secret <> vercel_protection_bypass)
);

alter table scoring_authority.guide_sync_worker_configuration enable row level security;
revoke all on scoring_authority.guide_sync_worker_configuration from public, anon, authenticated;
revoke all on scoring_authority.guide_sync_worker_configuration from service_role;

create or replace function scoring_authority.invoke_preview_guide_sync_worker()
returns bigint
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, net, pg_temp
as $$
declare
  target_endpoint constant text :=
    'https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app/api/cron/guide-sync';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  configuration scoring_authority.guide_sync_worker_configuration%rowtype;
  request_id bigint;
  invocation_id uuid := gen_random_uuid();
begin
  select * into configuration
  from scoring_authority.guide_sync_worker_configuration c
  where c.configuration_id and c.enabled;
  if not found then return null; end if;
  if configuration.project_ref <> 'idgigvjjqkfbqjeredpb'
     or configuration.tournament_id <> '2026'
     or configuration.endpoint_url <> target_endpoint
     or configuration.source_workbook_id = production_workbook
     or length(coalesce(configuration.worker_secret, '')) < 32
     or length(coalesce(configuration.vercel_protection_bypass, '')) < 32
     or configuration.worker_secret = configuration.vercel_protection_bypass
     or not exists (
       select 1 from scoring_authority.tournaments t
       where t.tournament_id = '2026' and t.tournament_year = 2026
         and t.source_workbook_id = configuration.source_workbook_id
     ) then
    raise exception using errcode = 'P0001', message = 'PREVIEW_GUIDE_WORKER_CONFIGURATION_INVALID';
  end if;

  select net.http_post(
    url := configuration.endpoint_url,
    headers := jsonb_build_object(
      'x-vercel-protection-bypass', configuration.vercel_protection_bypass,
      'Authorization', 'Bearer ' || configuration.worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'Sandbagger-Supabase-Guide-Cron/1.0'
    ),
    body := jsonb_build_object(
      'source', 'supabase-cron',
      'trigger_type', 'SCHEDULED',
      'invocation_id', invocation_id,
      'project_ref', configuration.project_ref,
      'tournament_id', configuration.tournament_id
    ),
    timeout_milliseconds := 120000
  ) into request_id;

  update scoring_authority.guide_sync_worker_configuration set
    last_request_id = request_id,
    last_invocation_id = invocation_id,
    last_requested_at = now(),
    updated_at = now()
  where configuration_id;
  return request_id;
end;
$$;

create or replace function public.configure_preview_guide_sync_worker(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  target_project constant text := 'idgigvjjqkfbqjeredpb';
  target_tournament constant text := '2026';
  target_endpoint constant text :=
    'https://bagger-inv-git-feature-mock-tour-b4f752-sandbagger-invitational.vercel.app/api/cron/guide-sync';
  production_workbook constant text := '1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4';
  endpoint text := btrim(coalesce(input->>'endpoint_url', ''));
  secret_value text := btrim(coalesce(input->>'worker_secret', ''));
  source_workbook text := btrim(coalesce(input->>'source_workbook_id', ''));
  actor text := left(btrim(coalesce(input->>'actor_id', '')), 180);
  enabled_value boolean := coalesce((input->>'enabled')::boolean, false);
  bypass_value text;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> target_project
     or btrim(coalesce(input->>'tournament_id', '')) <> target_tournament
     or coalesce((input->>'tournament_year')::integer, 0) <> 2026
     or actor = '' or source_workbook = '' or source_workbook = production_workbook
     or length(secret_value) < 32 or endpoint <> target_endpoint then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_WORKER_CONFIGURATION_INVALID');
  end if;
  if not exists (
    select 1 from scoring_authority.tournaments t
    where t.tournament_id = target_tournament and t.tournament_year = 2026
      and t.source_workbook_id = source_workbook
  ) then return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_SOURCE_MISMATCH'); end if;

  -- The bypass never leaves Postgres.  It is copied from the separately secured,
  -- already-proven Round Scorecards worker configuration.
  select c.vercel_protection_bypass into bypass_value
  from scoring_authority.scorecard_archive_worker_configuration c
  where c.configuration_id and length(coalesce(c.vercel_protection_bypass, '')) >= 32;
  if length(coalesce(bypass_value, '')) < 32 then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_AUTOMATION_BYPASS_NOT_CONFIGURED');
  end if;
  if secret_value = bypass_value then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_AUTHORIZATION_LAYERS_NOT_DISTINCT');
  end if;

  insert into scoring_authority.guide_sync_worker_configuration (
    configuration_id, project_ref, tournament_id, source_workbook_id,
    endpoint_url, worker_secret, vercel_protection_bypass, enabled, configured_by
  ) values (
    true, target_project, target_tournament, source_workbook,
    endpoint, secret_value, bypass_value, enabled_value, actor
  ) on conflict (configuration_id) do update set
    project_ref = excluded.project_ref,
    tournament_id = excluded.tournament_id,
    source_workbook_id = excluded.source_workbook_id,
    endpoint_url = excluded.endpoint_url,
    worker_secret = excluded.worker_secret,
    vercel_protection_bypass = excluded.vercel_protection_bypass,
    enabled = excluded.enabled,
    configured_by = excluded.configured_by,
    configured_at = now(),
    updated_at = now();

  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values (target_tournament, 'GUIDE_SYNC_WORKER_CONFIGURED', actor,
    jsonb_build_object(
      'enabled', enabled_value,
      'endpointHost', split_part(replace(endpoint, 'https://', ''), '/', 1),
      'schedule', '*/5 * * * *',
      'applicationAuthorizationConfigured', true,
      'deploymentProtectionConfigured', true
    ));
  return jsonb_build_object(
    'ok', true,
    'enabled', enabled_value,
    'endpoint_host', split_part(replace(endpoint, 'https://', ''), '/', 1),
    'schedule', '*/5 * * * *',
    'application_authorization_configured', true,
    'deployment_protection_configured', true
  );
exception when invalid_text_representation then
  return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_WORKER_CONFIGURATION_INVALID');
end;
$$;

create or replace function public.request_preview_guide_sync_worker(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  actor text := left(btrim(coalesce(input->>'actor_id', '')), 180);
  request_id bigint;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> 'idgigvjjqkfbqjeredpb'
     or btrim(coalesce(input->>'tournament_id', '')) <> '2026'
     or actor = '' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_WORKER_REQUEST_INVALID');
  end if;
  request_id := scoring_authority.invoke_preview_guide_sync_worker();
  if request_id is null then
    return jsonb_build_object('ok', false, 'code', 'GUIDE_SYNC_WORKER_DISABLED');
  end if;
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  values ('2026', 'GUIDE_SYNC_WORKER_REQUESTED', actor,
    jsonb_build_object('requestId', request_id, 'triggerType', 'EXPLICIT_WORKER_REQUEST'));
  return jsonb_build_object('ok', true, 'request_id', request_id);
end;
$$;

create or replace function public.read_preview_guide_worker_status(input jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  configuration scoring_authority.guide_sync_worker_configuration%rowtype;
  response_value jsonb;
  cron_run_value jsonb;
  response_status integer;
  response_timed_out boolean;
  response_result text;
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> 'idgigvjjqkfbqjeredpb'
     or btrim(coalesce(input->>'tournament_id', '')) <> '2026' then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_GUIDE_WORKER_STATUS_INVALID');
  end if;
  select * into configuration
  from scoring_authority.guide_sync_worker_configuration c
  where c.configuration_id;
  if not found then
    return jsonb_build_object('ok', true, 'configured', false, 'enabled', false,
      'schedule', '*/5 * * * *');
  end if;

  -- pg_net responses are asynchronous and expire according to the extension's
  -- retention policy.  Expose only safe delivery metadata: never response
  -- headers/body or error text, either of which may contain protected context.
  if configuration.last_request_id is not null then
    begin
      select to_jsonb(r) into response_value
      from net._http_response r
      where (to_jsonb(r)->>'id')::bigint = configuration.last_request_id
      limit 1;
    exception
      when undefined_table or insufficient_privilege then response_value := null;
    end;
  end if;
  response_status := nullif(response_value->>'status_code', '')::integer;
  response_timed_out := coalesce((response_value->>'timed_out')::boolean, false);
  response_result := case
    when response_value is null then 'PENDING_OR_EXPIRED'
    when response_timed_out then 'TIMEOUT'
    when response_status between 200 and 299 then 'SUCCEEDED'
    when response_status is not null then 'HTTP_' || response_status::text
    when response_value ? 'error_msg' and nullif(response_value->>'error_msg', '') is not null
      then 'NETWORK_ERROR'
    else 'UNKNOWN'
  end;

  -- Likewise, expose cron scheduling health without returning its SQL command
  -- or return_message.
  begin
    select to_jsonb(d) into cron_run_value
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where j.jobname = 'preview-guide-content-sync'
    order by d.runid desc
    limit 1;
  exception
    when undefined_table or insufficient_privilege then cron_run_value := null;
  end;

  return jsonb_build_object(
    'ok', true,
    'configured', true,
    'enabled', configuration.enabled,
    'endpoint_host', split_part(replace(configuration.endpoint_url, 'https://', ''), '/', 1),
    'schedule', '*/5 * * * *',
    'application_authorization_configured', length(configuration.worker_secret) >= 32,
    'deployment_protection_configured', length(configuration.vercel_protection_bypass) >= 32,
    'configured_at', configuration.configured_at,
    'updated_at', configuration.updated_at,
    'last_request_id', configuration.last_request_id,
    'last_invocation_id', configuration.last_invocation_id,
    'last_requested_at', configuration.last_requested_at,
    'response_observed', response_value is not null,
    'last_response_status_code', response_status,
    'last_response_result', response_result,
    'last_response_at', response_value->>'created',
    'last_cron_status', cron_run_value->>'status',
    'last_cron_started_at', cron_run_value->>'start_time',
    'last_cron_completed_at', cron_run_value->>'end_time'
  );
end;
$$;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job where jobname = 'preview-guide-content-sync';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'preview-guide-content-sync',
    '*/5 * * * *',
    $schedule$select scoring_authority.invoke_preview_guide_sync_worker();$schedule$
  );
end;
$$;

revoke all on function scoring_authority.invoke_preview_guide_sync_worker()
  from public, anon, authenticated, service_role;
revoke all on function public.configure_preview_guide_sync_worker(jsonb)
  from public, anon, authenticated;
revoke all on function public.request_preview_guide_sync_worker(jsonb)
  from public, anon, authenticated;
revoke all on function public.read_preview_guide_worker_status(jsonb)
  from public, anon, authenticated;
grant execute on function public.configure_preview_guide_sync_worker(jsonb) to service_role;
grant execute on function public.request_preview_guide_sync_worker(jsonb) to service_role;
grant execute on function public.read_preview_guide_worker_status(jsonb) to service_role;

notify pgrst, 'reload schema';
