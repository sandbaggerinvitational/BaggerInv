-- Normalized catalog identity for owned local compiler/fresh convergence.
-- No application data or credentials are selected. Physical OID values excluded.
set search_path=pg_catalog;
with app_ns as (
 select oid,nspname from pg_namespace where nspname in
 ('production_control','scoring_authority','participant_identity','production_rehearsal')
), app_proc as (
 select p.*,n.nspname,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 join pg_language l on l.oid=p.prolang
 where (n.oid in(select oid from app_ns) or n.nspname='public' and p.proname<>'rls_auto_enable')
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), app_rel as (
 select c.*,n.nspname from pg_class c join app_ns n on n.oid=c.relnamespace
 where c.relkind in('r','p','v','m','S')
), app_triggers as (
 select t.*,n.nspname,c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and (n.oid in(select oid from app_ns) or n.nspname='auth' and t.tgfoid in(select oid from app_proc))
), app_objects as (
 select 'pg_proc'::regclass as classid,oid as objid from app_proc
 union all select 'pg_class'::regclass,oid from app_rel
 union all select 'pg_trigger'::regclass,oid from app_triggers
 union all select 'pg_constraint'::regclass,k.oid from pg_constraint k where k.conrelid in(select oid from app_rel)
 union all select 'pg_policy'::regclass,p.oid from pg_policy p where p.polrelid in(select oid from app_rel)
)
select jsonb_build_object(
 'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',(select jsonb_agg(a::text order by a::text) from unnest(coalesce(nspacl,acldefault('n',nspowner)))a)) order by nspname)
 from pg_namespace where oid in(select oid from app_ns)),
 'relations',(select jsonb_agg(jsonb_build_object('identity',nspname||'.'||relname,'kind',relkind,
 'owner',pg_get_userbyid(relowner),'acl',(select jsonb_agg(a::text order by a::text) from unnest(coalesce(relacl,acldefault(case when relkind='S' then 's'::"char" else 'r'::"char" end,relowner)))a),'rls',relrowsecurity,'forceRls',relforcerowsecurity,
 'options',reloptions,'persistence',relpersistence,
 'view',case when relkind in('v','m') then pg_get_viewdef(oid,false) else null end) order by nspname,relname) from app_rel),
 'columns',(select jsonb_agg(jsonb_build_object('relation',c.nspname||'.'||c.relname,'name',a.attname,'position',a.attnum,
 'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
 'default',pg_get_expr(d.adbin,d.adrelid),'collation',case when a.attcollation=0 then null else (select n.nspname||'.'||co.collname from pg_collation co join pg_namespace n on n.oid=co.collnamespace where co.oid=a.attcollation)end)
 order by c.nspname,c.relname,a.attnum) from app_rel c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum),
 'constraints',(select jsonb_agg(jsonb_build_object('relation',c.nspname||'.'||c.relname,'name',k.conname,'type',k.contype,
 'definition',pg_get_constraintdef(k.oid,true),'deferrable',k.condeferrable,'deferred',k.condeferred,'validated',k.convalidated)
 order by c.nspname,c.relname,k.conname) from pg_constraint k join app_rel c on c.oid=k.conrelid),
 'indexes',(select jsonb_agg(jsonb_build_object('relation',c.nspname||'.'||c.relname,'name',ci.relname,'definition',pg_get_indexdef(i.indexrelid),
 'valid',i.indisvalid,'ready',i.indisready,'primary',i.indisprimary) order by c.nspname,c.relname,ci.relname)
 from pg_index i join app_rel c on c.oid=i.indrelid join pg_class ci on ci.oid=i.indexrelid),
 'functions',(select jsonb_agg(jsonb_build_object('identity',nspname||'.'||proname||'('||pg_get_function_identity_arguments(oid)||')',
 'definition',pg_get_functiondef(oid),'owner',pg_get_userbyid(proowner),'acl',(select jsonb_agg(a::text order by a::text) from unnest(coalesce(proacl,acldefault('f',proowner)))a),'language',lanname,
 'definer',prosecdef,'searchPath',proconfig,'volatile',provolatile,'parallel',proparallel,'strict',proisstrict,'leakproof',proleakproof,
 'publicExecute',exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner)))a where a.grantee=0 and a.privilege_type='EXECUTE'),
 'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',oid,'EXECUTE'),
 'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE')) order by nspname,proname,pg_get_function_identity_arguments(oid)) from app_proc),
 'triggers',(select jsonb_agg(jsonb_build_object('relation',nspname||'.'||relname,'name',tgname,'definition',pg_get_triggerdef(oid,false),'enabled',tgenabled)
 order by nspname,relname,tgname) from app_triggers),
 'policies',(select jsonb_agg(jsonb_build_object('relation',c.nspname||'.'||c.relname,'name',p.polname,'command',p.polcmd,
 'permissive',p.polpermissive,'roles',(select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r)from unnest(p.polroles)r),
 'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by c.nspname,c.relname,p.polname)
 from pg_policy p join app_rel c on c.oid=p.polrelid),
 'dependencies',(select coalesce(jsonb_agg(value order by value::text),'[]') from (
 select distinct jsonb_build_object('dependent',pg_describe_object(d.classid,d.objid,d.objsubid),
 'referenced',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'type',d.deptype) value
 from pg_depend d where (exists(select 1 from app_objects a where(a.classid,a.objid)=(d.classid,d.objid))
 or exists(select 1 from app_objects a where(a.classid,a.objid)=(d.refclassid,d.refobjid)))
 -- TOAST and internal RI-trigger names contain allocation OIDs. Their logical
 -- owners/FK definitions are checked above; physical names are not schema identity.
 and not(d.classid='pg_class'::regclass and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=d.objid and n.nspname='pg_toast'))
 and not(d.classid='pg_trigger'::regclass and exists(select 1 from pg_trigger t where t.oid=d.objid and t.tgisinternal))
 ) dependencies),
 'extensions',(select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner)) order by e.extname)
 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),
 'defaultPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,
 'type',d.defaclobjtype,'acl',d.defaclacl::text) order by n.nspname,d.defaclobjtype),'[]') from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.oid in(select oid from app_ns))
);
