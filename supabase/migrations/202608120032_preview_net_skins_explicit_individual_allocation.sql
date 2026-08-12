-- The legacy Net Skins contract uses the per-round Player Stroke value from
-- the Director workbook. Preserve it as explicit, fingerprinted configuration
-- instead of inferring it from either match-relative strokes or playing HCP.

alter table scoring_authority.net_skins_configuration_entries
  add column individual_stroke_allocation numeric(10,3)
    generated always as (
      nullif(btrim(coalesce(source_payload->>'Individual Stroke Allocation', '')), '')::numeric
    ) stored;

alter table scoring_authority.net_skins_configuration_entries
  add constraint net_skins_individual_allocation_shape
  check (format <> 'SC' or individual_stroke_allocation is null);
