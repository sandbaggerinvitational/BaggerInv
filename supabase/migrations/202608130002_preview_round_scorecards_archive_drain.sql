-- Preview archive drain scheduler. Configuration is service-only and empty/disabled by default.
-- pg_cron invokes the stable Preview Vercel endpoint through pg_net every five minutes;
-- the application endpoint independently enforces VERCEL_ENV=preview and its server flag.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table scoring_authority.scorecard_archive_worker_configuration (
  configuration_id boolean primary key default true check (configuration_id),
  project_ref text not null,
  endpoint_url text not null,
  worker_secret text not null,
  enabled boolean not null default false,
  configured_by text not null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_request_id bigint,
  last_requested_at timestamptz,
  check (project_ref = 'idgigvjjqkfbqjeredpb'),
  check (endpoint_url ~ '^https://[A-Za-z0-9.-]+/api/cron/round-scorecards-archive$'),
  check (length(worker_secret) >= 32)
);

alter table scoring_authority.scorecard_archive_worker_configuration enable row level security;
revoke all on scoring_authority.scorecard_archive_worker_configuration from public, anon, authenticated;

create or replace function scoring_authority.invoke_preview_scorecard_archive_worker()
returns bigint
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, net, pg_temp
as $$
declare
  configuration scoring_authority.scorecard_archive_worker_configuration%rowtype;
  request_id bigint;
begin
  select * into configuration from scoring_authority.scorecard_archive_worker_configuration
  where configuration_id and enabled;
  if not found then return null; end if;
  select net.http_post(
    url := configuration.endpoint_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || configuration.worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'Sandbagger-Supabase-Archive-Cron/1.0'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'project_ref', configuration.project_ref),
    timeout_milliseconds := 10000
  ) into request_id;
  update scoring_authority.scorecard_archive_worker_configuration set
    last_request_id = request_id, last_requested_at = now(), updated_at = now()
  where configuration_id;
  return request_id;
end;
$$;

create or replace function public.configure_preview_scorecard_archive_worker(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = scoring_authority, public, extensions, pg_temp
as $$
declare
  endpoint text := btrim(coalesce(input->>'endpoint_url', ''));
  secret_value text := btrim(coalesce(input->>'worker_secret', ''));
  actor text := btrim(coalesce(input->>'actor_id', ''));
  enabled_value boolean := coalesce((input->>'enabled')::boolean, false);
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> 'idgigvjjqkfbqjeredpb'
     or actor = '' or endpoint !~ '^https://[A-Za-z0-9.-]+/api/cron/round-scorecards-archive$'
     or length(secret_value) < 32 then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_WORKER_CONFIGURATION_INVALID');
  end if;
  insert into scoring_authority.scorecard_archive_worker_configuration (
    configuration_id, project_ref, endpoint_url, worker_secret, enabled, configured_by
  ) values (true, 'idgigvjjqkfbqjeredpb', endpoint, secret_value, enabled_value, actor)
  on conflict (configuration_id) do update set
    endpoint_url = excluded.endpoint_url, worker_secret = excluded.worker_secret,
    enabled = excluded.enabled, configured_by = excluded.configured_by,
    configured_at = now(), updated_at = now();
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  select t.tournament_id, 'SCORECARD_ARCHIVE_WORKER_CONFIGURED', actor,
    jsonb_build_object('enabled', enabled_value, 'endpoint_host', split_part(replace(endpoint, 'https://', ''), '/', 1),
      'schedule', '*/5 * * * *', 'secret_stored', true)
  from scoring_authority.tournaments t order by t.tournament_year desc limit 1;
  return jsonb_build_object('ok', true, 'enabled', enabled_value,
    'endpoint_host', split_part(replace(endpoint, 'https://', ''), '/', 1), 'schedule', '*/5 * * * *');
end;
$$;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'preview-round-scorecards-archive-drain';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'preview-round-scorecards-archive-drain',
    '*/5 * * * *',
    $schedule$select scoring_authority.invoke_preview_scorecard_archive_worker();$schedule$
  );
end;
$$;

revoke all on function scoring_authority.invoke_preview_scorecard_archive_worker() from public, anon, authenticated;
revoke all on function public.configure_preview_scorecard_archive_worker(jsonb) from public, anon, authenticated;
grant execute on function public.configure_preview_scorecard_archive_worker(jsonb) to service_role;

notify pgrst, 'reload schema';
