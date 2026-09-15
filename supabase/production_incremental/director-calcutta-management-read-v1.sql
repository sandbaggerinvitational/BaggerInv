-- Additive, inert Director-only projection. No financial facts are written.
begin;
create function production_control.director_calcutta_management_projection_v1(target text, predecessor bigint default null)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'tournament_id', target,
    'state', coalesce(c.state, 'NOT_CONFIGURED'),
    'publication_state', coalesce(c.publication_state, 'UNPUBLISHED'),
    'configuration_revision', coalesce(c.configuration_revision, 0),
    'configuration_revision_id', c.configuration_revision_id,
    'configuration_fingerprint', c.configuration_fingerprint,
    'auction_revision', coalesce(c.auction_revision, 0),
    'auction_revision_id', c.auction_revision_id,
    'auction_fingerprint', c.auction_fingerprint,
    'publication_revision', coalesce(c.publication_revision, 0),
    'currency_code', coalesce(cfg.configuration_manifest->>'currency_code', 'USD'),
    'configured_at', cfg.configured_at,
    'point_structure', coalesce((select jsonb_agg(jsonb_build_object('place', (r->>'place')::int,
      'round_1_award', r->>'round_1_award', 'round_2_award', r->>'round_2_award', 'round_3_award', r->>'round_3_award') order by (r->>'place')::int)
      from jsonb_array_elements(cfg.configuration_manifest->'point_structure') r), '[]'::jsonb),
    'payout_structure', coalesce((select jsonb_agg(jsonb_build_object('place', (r->>'place')::int,
      'round_1_fraction', r->>'round_1_fraction', 'round_2_fraction', r->>'round_2_fraction',
      'round_3_fraction', r->>'round_3_fraction', 'overall_fraction', r->>'overall_fraction') order by (r->>'place')::int)
      from jsonb_array_elements(cfg.configuration_manifest->'payout_structure') r), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(jsonb_build_object('player_id', r->>'player_id', 'purchase_price', r->>'purchase_price') order by r->>'player_id') from jsonb_array_elements(a.auction_manifest->'purchases') r), '[]'::jsonb),
    'ownership', coalesce((select jsonb_agg(jsonb_build_object('player_id', r->>'player_id', 'owner_player_id', r->>'owner_player_id', 'ownership_fraction', r->>'ownership_fraction') order by r->>'player_id', r->>'owner_player_id') from jsonb_array_elements(a.auction_manifest->'ownership') r), '[]'::jsonb),
    'predecessor_auction_revision', predecessor,
    'predecessor_auction_fingerprint', base.auction_fingerprint,
    'predecessor_purchases', coalesce((select jsonb_agg(jsonb_build_object('player_id', r->>'player_id', 'purchase_price', r->>'purchase_price') order by r->>'player_id') from jsonb_array_elements(base.auction_manifest->'purchases') r), '[]'::jsonb),
    'predecessor_ownership', coalesce((select jsonb_agg(jsonb_build_object('player_id', r->>'player_id', 'owner_player_id', r->>'owner_player_id', 'ownership_fraction', r->>'ownership_fraction') order by r->>'player_id', r->>'owner_player_id') from jsonb_array_elements(base.auction_manifest->'ownership') r), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', p.player_id, 'display_name', p.display_name) order by p.display_name, p.player_id)
      from scoring_authority.tournament_players tp join scoring_authority.players p using(player_id)
      where tp.tournament_id = target and tp.participation_status = 'ACTIVE'), '[]'::jsonb)
  ) from (select target as tournament_id) t
  left join scoring_authority.calcutta_v1_current c using(tournament_id)
  left join scoring_authority.calcutta_v1_configuration_revisions cfg
    on cfg.configuration_revision_id = c.configuration_revision_id and cfg.tournament_id = target
  left join scoring_authority.calcutta_v1_auction_fact_revisions a
    on a.auction_revision_id = c.auction_revision_id and a.tournament_id = target
  left join scoring_authority.calcutta_v1_auction_fact_revisions base
    on base.tournament_id = target and base.auction_revision = predecessor and predecessor <= c.auction_revision;
$$;

create function public.read_production_calcutta_management_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare target text;
begin
  perform production_control.assert_production_service_role();
  perform production_control.assert_production_calcutta_v1_runtime(input);
  perform production_control.assert_production_scoring_actor(input, true);
  if input->>'contract_version' is distinct from 'production-calcutta-v1' then
    raise exception using errcode = '42501', message = 'PRODUCTION_CALCUTTA_MANAGEMENT_CONTRACT_REQUIRED';
  end if;
  select tournament_id into strict target from production_control.current_tournament_pointer_v1
    where scope_key = 'BAGGER_INV_PRODUCTION';
  if target is distinct from input->>'tournament_id' then
    raise exception using errcode = '40001', message = 'PRODUCTION_CALCUTTA_TOURNAMENT_CONFLICT';
  end if;
  return jsonb_build_object('ok', true, 'data', production_control.director_calcutta_management_projection_v1(target, (input->>'predecessor_auction_revision')::bigint));
end;
$$;

insert into production_control.annual_scoring_rpc_allowlist_v1
 (operation_name, target_rpc, required_phase, operation_class, required_worker)
values ('read_production_calcutta_management_v1',
 'public.future_production_read_calcutta_management_v1', 'OBSERVATION', 'READ', null);

create function public.future_production_read_calcutta_management_v1(input jsonb)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare target text;
begin
  target := production_control.assert_annual_calcutta_runtime_v1(input, 'read_production_calcutta_management_v1');
  perform production_control.assert_production_scoring_actor(input, true);
  return jsonb_build_object('ok', true, 'data', production_control.director_calcutta_management_projection_v1(target, (input->>'predecessor_auction_revision')::bigint));
end;
$$;
revoke all on function production_control.director_calcutta_management_projection_v1(text,bigint),
 public.read_production_calcutta_management_v1(jsonb),
 public.future_production_read_calcutta_management_v1(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.read_production_calcutta_management_v1(jsonb) to service_role;
commit;
