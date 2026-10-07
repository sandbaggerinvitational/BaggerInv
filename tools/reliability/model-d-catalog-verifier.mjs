// Provisioning-only exact catalog verification. No connection or mutation API.
import {createHash} from 'node:crypto';
import {serialize} from './canonical-bootstrap-artifacts.mjs';
import {canonicalDependencyRecords} from './portable-canonical-catalog.mjs';
const digest=v=>createHash('sha256').update(serialize(v)).digest('hex');
export const catalogLayers=Object.freeze({schemas:'A/B/E',relations:'A/B/E/F',columns:'A/B',constraints:'A/B',indexes:'A/B',functions:'A/B/E/G/H',triggers:'A/B',policies:'F',dependencies:'I',extensions:'D/E',defaultPrivileges:'E'});
export function normalizeModelDCatalog(catalog,expected){
 const value=structuredClone(catalog);
 value.dependencies=canonicalDependencyRecords(value.dependencies);
 if(value.extensions?.length===1&&['postgres','supabase_admin'].includes(value.extensions[0].owner))value.extensions[0].owner=expected.extensions[0].owner;
 return value;
}
const identity=r=>r?.identity||[r?.relation,r?.name].filter(Boolean).join('.')||r?.dependent||r?.name||'catalog';
function metadata(r){
 if(r==null)return {present:false};
 const id=identity(r);
 return {present:true,identity:id,schema:id.split('.')[0],objectType:r.definer===undefined?'CATALOG_OBJECT':'FUNCTION',
  classification:id.startsWith('production_control.')?'CERTIFICATION_REQUIRED':'APPLICATION_REQUIRED',
  owner:r.owner||null,aclDigest:digest(r.acl??null),
  securityMode:r.definer===undefined?null:r.definer?'DEFINER':'INVOKER',rls:r.rls??null,
  searchPathDigest:digest(r.searchPath??null),definitionHash:r.definitionSha256||null,recordHash:digest(r)};
}
export function modelDCatalogDiagnostics(actual,expected,{limit=10}={}){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('BOUNDED_DIAGNOSTICS_REQUIRED');
 const a=normalizeModelDCatalog(actual,expected),e=normalizeModelDCatalog(expected,expected),sections=[];
 for(const section of new Set([...Object.keys(a),...Object.keys(e)])){
  if(serialize(a[section])===serialize(e[section]))continue;
  const rows=[];let count=0;
  const av=Array.isArray(a[section])?a[section]:[a[section]],ev=Array.isArray(e[section])?e[section]:[e[section]];
  for(let i=0;i<Math.max(av.length,ev.length);i++)if(serialize(av[i])!==serialize(ev[i])){
   count++;if(rows.length<limit)rows.push({position:i,expected:metadata(ev[i]),actual:metadata(av[i])});
  }
  sections.push({catalogClass:section,layer:catalogLayers[section]||'J',mismatchCount:count,expectedDigest:digest(e[section]),actualDigest:digest(a[section]),rows});
 }
 return {equal:sections.length===0,expectedDigest:digest(e),actualDigest:digest(a),sections};
}

// Embedded in the owner's existing transaction; no persistent helper is created.
// Sort only complete dependency records, retaining duplicates and every field.
export function modelDCatalogVerificationSql(query,expectedLiteral){return `
do $verify$declare actual jsonb;expected jsonb:=${expectedLiteral};
 section text;summary jsonb:='[]';rows jsonb;count_diff integer;begin
 execute $catalog$${query}$catalog$ into strict actual;
 actual:=jsonb_set(actual,'{functions}',(select jsonb_agg(v-'definition'||jsonb_build_object('definitionSha256',encode(extensions.digest(v->>'definition','sha256'),'hex')))from jsonb_array_elements(actual->'functions')v));
 if jsonb_array_length(actual->'extensions')=1 and actual#>>'{extensions,0,owner}'in('postgres','supabase_admin')then
  actual:=jsonb_set(actual,'{extensions,0,owner}',expected#>'{extensions,0,owner}');
 end if;
 actual:=jsonb_set(actual,'{dependencies}',(select coalesce(jsonb_agg(v order by v::text collate "C"),'[]'::jsonb)from jsonb_array_elements(actual->'dependencies')v));
 expected:=jsonb_set(expected,'{dependencies}',(select coalesce(jsonb_agg(v order by v::text collate "C"),'[]'::jsonb)from jsonb_array_elements(expected->'dependencies')v));
 -- The certified image creates no non-extension public relations. Keep this
 -- narrow exposure check separate from the receipt-hashed historical catalog.
 actual:=actual||jsonb_build_object('unexpectedPublicRelations',(select coalesce(jsonb_agg(jsonb_build_object(
  'identity',n.nspname||'.'||c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
  'acl',(select jsonb_agg(x::text order by x::text collate "C")from unnest(coalesce(c.relacl,acldefault(case when c.relkind='S'then 's'::"char" else 'r'::"char" end,c.relowner)))x),
  'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity)order by c.relname collate "C"),'[]'::jsonb)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind in('r','p','v','m','S')
  and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')));
 expected:=expected||jsonb_build_object('unexpectedPublicRelations','[]'::jsonb);
 if actual is distinct from expected then
  for section in select key from jsonb_each(actual||expected) order by key collate "C" loop
   if actual->section is not distinct from expected->section then continue;end if;
   with differences as(select coalesce(a.i,e.i)i,a.v av,e.v ev
    from jsonb_array_elements(case when jsonb_typeof(actual->section)='array'then actual->section else jsonb_build_array(actual->section)end)with ordinality a(v,i)
    full join jsonb_array_elements(case when jsonb_typeof(expected->section)='array'then expected->section else jsonb_build_array(expected->section)end)with ordinality e(v,i)using(i)
    where a.v is distinct from e.v),bounded as(select *from differences order by i limit 10)
   select (select count(*)from differences),coalesce(jsonb_agg(jsonb_build_object('position',i,
    'expectedPresence',ev is not null,'actualPresence',av is not null,
    'expectedIdentity',coalesce(ev->>'identity',nullif(concat_ws('.',ev->>'relation',ev->>'name'),''),ev->>'dependent'),
    'actualIdentity',coalesce(av->>'identity',nullif(concat_ws('.',av->>'relation',av->>'name'),''),av->>'dependent'),
    'expectedOwner',ev->>'owner','actualOwner',av->>'owner',
    'expectedAclDigest',encode(extensions.digest(coalesce((ev->'acl')::text,'null'),'sha256'),'hex'),
    'actualAclDigest',encode(extensions.digest(coalesce((av->'acl')::text,'null'),'sha256'),'hex'),
    'expectedSecurityMode',ev->'definer','actualSecurityMode',av->'definer',
    'expectedRls',ev->'rls','actualRls',av->'rls',
    'expectedSearchPathDigest',encode(extensions.digest(coalesce((ev->'searchPath')::text,'null'),'sha256'),'hex'),
    'actualSearchPathDigest',encode(extensions.digest(coalesce((av->'searchPath')::text,'null'),'sha256'),'hex'),
    'expectedHash',encode(extensions.digest(coalesce(ev::text,'null'),'sha256'),'hex'),
    'actualHash',encode(extensions.digest(coalesce(av::text,'null'),'sha256'),'hex'))order by i),'[]'::jsonb)into count_diff,rows from bounded;
   summary:=summary||jsonb_build_array(jsonb_build_object('catalogClass',section,'layer',case section
    when 'dependencies'then 'I'when 'extensions'then 'D/E'when 'functions'then 'A/B/E/G/H'
    when 'policies'then 'F'when 'relations'then 'A/B/E/F'when 'defaultPrivileges'then 'E'else 'A/B/J'end,
    'mismatchCount',count_diff,'rows',rows));
  end loop;
  raise exception 'MODEL_D_CATALOG_MISMATCH'using detail=jsonb_build_object('sections',summary,
   'expectedDigest',encode(extensions.digest(expected::text,'sha256'),'hex'),
   'actualNormalizedDigest',encode(extensions.digest(actual::text,'sha256'),'hex'))::text;
 end if;
end;$verify$;
`;}
