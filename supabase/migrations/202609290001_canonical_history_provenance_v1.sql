-- Phase2C.1 Preview-only candidate. Generated with local migration-new and
-- numbered using the repository Preview stream. No provider deployment.
-- Source workbook identifiers here are retained import provenance, not runtime
-- Google configuration, credentials, or destination authority.
begin;
create function public.read_canonical_2026_historical_view(target_tournament_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $history$
declare target text:=btrim(coalesce(target_tournament_id,'')); provenance text;
begin
 if target<>'2026' then
  return jsonb_build_object('ok',false,'code','APPROVED_2026_HISTORY_CONTEXT_REQUIRED');
 end if;
 select source_workbook_id into provenance from scoring_authority.tournaments
 where tournament_id=target and tournament_year=2026 and scoring_authority='SUPABASE';
 if provenance is null or btrim(provenance)='' then
  return jsonb_build_object('ok',false,'code','PREVIEW_2026_HISTORY_SOURCE_MISMATCH');
 end if;
 -- Existing public-safe projection retains its non-Production identity fence,
 -- completeness, snapshot coherence, financial/private-data exclusions.
 return public.read_preview_2026_historical_view(target,provenance);
end;
$history$;
revoke all on function public.read_canonical_2026_historical_view(text) from public,anon,authenticated;
grant execute on function public.read_canonical_2026_historical_view(text) to service_role;
comment on function public.read_canonical_2026_historical_view(text) is
 'Service-only canonical History projection; source provenance comes from SQL, never Google configuration or live Google calls. Production uses its separately admitted read contract.';
commit;
