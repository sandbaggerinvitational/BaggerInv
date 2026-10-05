-- Reviewed forward error-contract correction after bagger-canonical-bootstrap-v1.
-- Only the four Certification-only stale-context raises change SQLSTATE.
-- No predicate, other exception, data, ACL, owner, RLS or receipt is changed.
-- Managed installation requires separately verified/authorized Certification
-- project, valid registration/release, DISABLED admission and PAUSED ingress.
\set ON_ERROR_STOP on
begin;
do $correction$
declare target record; fn pg_catalog.pg_proc%rowtype; actual_hash text;
  definition text; old_raise constant text := 'errcode=''40001'',message=''CANONICAL_RESOURCE_CONTEXT_STALE''';
  new_raise constant text := 'errcode=''PT409'',message=''CANONICAL_RESOURCE_CONTEXT_STALE''';
begin
  -- Preflight every predecessor before replacing any definition.
  for target in select * from (values
    ('production_control.assert_certification_annual_abort_drain_v1(uuid,jsonb)','a8f20a3ce64f3a73ba75c53dcbbaefae46c1ba2e4afa66f995ebf09481ddfa58','91ac1f4e36f19e267f09cdceb91d03c81dc04de06fb406ff1820a9f763f820b8'),
    ('production_control.assert_certification_context_v1(jsonb,text,boolean)','229bbb96bac054e72e1e762a95485f63ddb511322e84a82c44f6240b62e897ad','36a266b5bf8e49f3c753807f0558c383c70a247fe4819cd9c65cb899d32f5f65'),
    ('production_control.current_certification_context_v1()','b04d83b624fff0fffef480631d152ebe0b2679304f16ce111ed132b1d09c3120','0491bd73421f65da67d49dd9588061c4ba7b70d1a00f0968f4c4ce8bbba29250'),
    ('production_control.install_certification_annual_reopened_generation_v1(uuid,uuid,jsonb)','c3a4df1ea84fe592d3316756141061f4d858fc47feddb051279702f34a5df13b','3f5cc0108c49441c2203e693881d2ecf1635723964e17afa9bad707f189d3fc6')
  ) as expected(signature,old_hash,new_hash) loop
    select * into strict fn from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if current_user <> 'postgres' or pg_get_userbyid(fn.proowner) <> 'postgres'
       or fn.proacl::text[] is distinct from array['postgres=X/postgres']
       or not fn.prosecdef or fn.proconfig is distinct from array['search_path=pg_catalog'] then
      raise exception using errcode='42501',message='CERTIFICATION_STALE_CONTEXT_CORRECTION_OWNER_CATALOG_REQUIRED';
    end if;
    actual_hash:=encode(extensions.digest(fn.prosrc,'sha256'),'hex');
    if actual_hash not in (target.old_hash,target.new_hash) then
      raise exception using errcode='55000',message='CERTIFICATION_STALE_CONTEXT_CORRECTION_PREDECESSOR_MISMATCH';
    end if;
  end loop;
  for target in select * from (values
    ('production_control.assert_certification_annual_abort_drain_v1(uuid,jsonb)','a8f20a3ce64f3a73ba75c53dcbbaefae46c1ba2e4afa66f995ebf09481ddfa58','91ac1f4e36f19e267f09cdceb91d03c81dc04de06fb406ff1820a9f763f820b8'),
    ('production_control.assert_certification_context_v1(jsonb,text,boolean)','229bbb96bac054e72e1e762a95485f63ddb511322e84a82c44f6240b62e897ad','36a266b5bf8e49f3c753807f0558c383c70a247fe4819cd9c65cb899d32f5f65'),
    ('production_control.current_certification_context_v1()','b04d83b624fff0fffef480631d152ebe0b2679304f16ce111ed132b1d09c3120','0491bd73421f65da67d49dd9588061c4ba7b70d1a00f0968f4c4ce8bbba29250'),
    ('production_control.install_certification_annual_reopened_generation_v1(uuid,uuid,jsonb)','c3a4df1ea84fe592d3316756141061f4d858fc47feddb051279702f34a5df13b','3f5cc0108c49441c2203e693881d2ecf1635723964e17afa9bad707f189d3fc6')
  ) as expected(signature,old_hash,new_hash) loop
    select * into strict fn from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if encode(extensions.digest(fn.prosrc,'sha256'),'hex')=target.old_hash then
      definition:=pg_get_functiondef(fn.oid);
      if (length(fn.prosrc)-length(replace(fn.prosrc,old_raise,'')))/length(old_raise) <> 1 then
        raise exception using errcode='55000',message='CERTIFICATION_STALE_CONTEXT_CORRECTION_RAISE_MISMATCH';
      end if;
      execute replace(definition,old_raise,new_raise);
    end if;
    select * into strict fn from pg_catalog.pg_proc where oid=to_regprocedure(target.signature);
    if encode(extensions.digest(fn.prosrc,'sha256'),'hex') <> target.new_hash
       or pg_get_userbyid(fn.proowner) <> 'postgres'
       or fn.proacl::text[] is distinct from array['postgres=X/postgres']
       or not fn.prosecdef or fn.proconfig is distinct from array['search_path=pg_catalog'] then
      raise exception using errcode='55000',message='CERTIFICATION_STALE_CONTEXT_CORRECTION_POSTFLIGHT_MISMATCH';
    end if;
  end loop;
end;
$correction$;
commit;
