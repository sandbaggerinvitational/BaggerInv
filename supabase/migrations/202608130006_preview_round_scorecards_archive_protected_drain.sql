-- The Preview deployment is SSO-protected. Reuse its existing automation-bypass
-- credential for pg_net delivery while retaining the archive worker's independent
-- bearer secret. This does not disable or weaken Preview Deployment Protection.

alter table scoring_authority.scorecard_archive_worker_configuration
  add column vercel_protection_bypass text;

alter table scoring_authority.scorecard_archive_worker_configuration
  add constraint scorecard_archive_worker_bypass_valid
  check (vercel_protection_bypass is null or length(vercel_protection_bypass) >= 32);

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
  if length(coalesce(configuration.vercel_protection_bypass, '')) < 32 then
    raise exception using errcode = 'P0001', message = 'PREVIEW_AUTOMATION_BYPASS_REQUIRED';
  end if;
  select net.http_post(
    url := configuration.endpoint_url,
    headers := jsonb_build_object(
      'x-vercel-protection-bypass', configuration.vercel_protection_bypass,
      'Authorization', 'Bearer ' || configuration.worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'Sandbagger-Supabase-Archive-Cron/1.0'
    ),
    body := jsonb_build_object('source', 'supabase-cron', 'project_ref', configuration.project_ref),
    timeout_milliseconds := 60000
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
  bypass_value text := btrim(coalesce(input->>'vercel_protection_bypass', ''));
  actor text := btrim(coalesce(input->>'actor_id', ''));
  enabled_value boolean := coalesce((input->>'enabled')::boolean, false);
begin
  if upper(btrim(coalesce(input->>'environment', ''))) <> 'PREVIEW'
     or btrim(coalesce(input->>'project_ref', '')) <> 'idgigvjjqkfbqjeredpb'
     or actor = '' or endpoint !~ '^https://[A-Za-z0-9.-]+/api/cron/round-scorecards-archive$'
     or length(secret_value) < 32 or length(bypass_value) < 32 then
    return jsonb_build_object('ok', false, 'code', 'PREVIEW_WORKER_CONFIGURATION_INVALID');
  end if;
  insert into scoring_authority.scorecard_archive_worker_configuration (
    configuration_id, project_ref, endpoint_url, worker_secret,
    vercel_protection_bypass, enabled, configured_by
  ) values (true, 'idgigvjjqkfbqjeredpb', endpoint, secret_value, bypass_value, enabled_value, actor)
  on conflict (configuration_id) do update set
    endpoint_url = excluded.endpoint_url, worker_secret = excluded.worker_secret,
    vercel_protection_bypass = excluded.vercel_protection_bypass,
    enabled = excluded.enabled, configured_by = excluded.configured_by,
    configured_at = now(), updated_at = now();
  insert into scoring_authority.audit_events (tournament_id, action, actor_id, metadata)
  select t.tournament_id, 'SCORECARD_ARCHIVE_WORKER_CONFIGURED', actor,
    jsonb_build_object('enabled', enabled_value, 'endpoint_host', split_part(replace(endpoint, 'https://', ''), '/', 1),
      'schedule', '*/5 * * * *', 'worker_secret_stored', true, 'deployment_bypass_stored', true)
  from scoring_authority.tournaments t order by t.tournament_year desc limit 1;
  return jsonb_build_object('ok', true, 'enabled', enabled_value,
    'endpoint_host', split_part(replace(endpoint, 'https://', ''), '/', 1), 'schedule', '*/5 * * * *');
end;
$$;

revoke all on function scoring_authority.invoke_preview_scorecard_archive_worker() from public, anon, authenticated;
revoke all on function public.configure_preview_scorecard_archive_worker(jsonb) from public, anon, authenticated;
grant execute on function public.configure_preview_scorecard_archive_worker(jsonb) to service_role;

notify pgrst, 'reload schema';
