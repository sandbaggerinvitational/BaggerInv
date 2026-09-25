-- Exact Release-134 Net Skins expression repair. No data writes or grant changes.
begin;
do $repair$
declare d text; prior_hash text; next_hash text; signature text;
begin
  signature := 'public.read_production_net_skins_frozen_2026_v1(jsonb)';
  d := pg_catalog.pg_get_functiondef(signature::regprocedure);
  prior_hash := pg_catalog.encode(extensions.digest(d, 'sha256'), 'hex');
  if prior_hash not in ('14db325604945d85df28779fc6ab71268139897b4262c9abaccc99ccbd771f40', 'dd97ea9dbb9357f294a1d36f3804228233adb50da939cf2c0ed0a22b1fc5801c') then
    raise exception 'PRODUCTION_NET_SKINS_SQL_SOURCE_MISMATCH: %', signature;
  end if;
  if prior_hash = '14db325604945d85df28779fc6ab71268139897b4262c9abaccc99ccbd771f40' then
    d := replace(replace(d, 'pg_catalog.least(', 'least('), 'pg_catalog.greatest(', 'greatest(');
    execute d;
  end if;
  next_hash := pg_catalog.encode(extensions.digest(pg_catalog.pg_get_functiondef(signature::regprocedure), 'sha256'), 'hex');
  if next_hash <> 'dd97ea9dbb9357f294a1d36f3804228233adb50da939cf2c0ed0a22b1fc5801c' then
    raise exception 'PRODUCTION_NET_SKINS_SQL_RESULT_MISMATCH: %', signature;
  end if;
  signature := 'public.claim_production_net_skins_v1_recalculation(jsonb)';
  d := pg_catalog.pg_get_functiondef(signature::regprocedure);
  prior_hash := pg_catalog.encode(extensions.digest(d, 'sha256'), 'hex');
  if prior_hash not in ('a11731571b3e938b33d09b8cd71f4edc085a54bdfa34cdec2f64aae54058dd98', 'b7480e6db44b622332bda265ae47ac2eca859a9aa03c9bceb816f93ef58290db') then
    raise exception 'PRODUCTION_NET_SKINS_SQL_SOURCE_MISMATCH: %', signature;
  end if;
  if prior_hash = 'a11731571b3e938b33d09b8cd71f4edc085a54bdfa34cdec2f64aae54058dd98' then
    d := replace(replace(d, 'pg_catalog.least(', 'least('), 'pg_catalog.greatest(', 'greatest(');
    execute d;
  end if;
  next_hash := pg_catalog.encode(extensions.digest(pg_catalog.pg_get_functiondef(signature::regprocedure), 'sha256'), 'hex');
  if next_hash <> 'b7480e6db44b622332bda265ae47ac2eca859a9aa03c9bceb816f93ef58290db' then
    raise exception 'PRODUCTION_NET_SKINS_SQL_RESULT_MISMATCH: %', signature;
  end if;
  signature := 'production_control.normalize_production_net_skins_v1_official_result(integer,jsonb)';
  d := pg_catalog.pg_get_functiondef(signature::regprocedure);
  prior_hash := pg_catalog.encode(extensions.digest(d, 'sha256'), 'hex');
  if prior_hash not in ('6b31051ba4673f13b2f390380052d846e0371e3b073d67a63bd1bdf38c873b31', 'ae9aee1eda0066c1261e07f6ac892665d88a2cb89c5e515f72f9d83ccd0c3ed4') then
    raise exception 'PRODUCTION_NET_SKINS_SQL_SOURCE_MISMATCH: %', signature;
  end if;
  if prior_hash = '6b31051ba4673f13b2f390380052d846e0371e3b073d67a63bd1bdf38c873b31' then
    d := replace(replace(d, 'pg_catalog.least(', 'least('), 'pg_catalog.greatest(', 'greatest(');
    execute d;
  end if;
  next_hash := pg_catalog.encode(extensions.digest(pg_catalog.pg_get_functiondef(signature::regprocedure), 'sha256'), 'hex');
  if next_hash <> 'ae9aee1eda0066c1261e07f6ac892665d88a2cb89c5e515f72f9d83ccd0c3ed4' then
    raise exception 'PRODUCTION_NET_SKINS_SQL_RESULT_MISMATCH: %', signature;
  end if;
end $repair$;
commit;
