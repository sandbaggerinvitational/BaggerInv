import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCertificationFixture,certificationForwardMigrations} from '/private/tmp/bagger-phase2d-staging-admission/test/support/reliability/phase2d-certification-fixture.mjs';
import {destroyIsolatedCluster} from '/private/tmp/bagger-phase2d-staging-admission/test/support/reliability/postgres17.mjs';
const root='/private/tmp/bagger-phase2d-staging-admission/';
const forwards=[...certificationForwardMigrations,
 'supabase/production_migrations/202609300134_certification_annual_administration_v1.sql',
 'supabase/production_migrations/202609300135_certification_read_contracts_v1.sql'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const paths=[...forwards,'lib/certification-runtime-server.js','lib/scoring-authority-supabase.js',
 'lib/scoring-mutation-authority-server.js','test/support/reliability/phase2d-certification-fixture.mjs'];
const hashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,sha(await readFile(root+path))])));
const f=await createCertificationFixture({forwardMigrations:forwards});
let report;
try{
 const r=f.resources[0];
 const parse=statement=>JSON.parse(r.q(statement));
 const context=r.context('SCORING');
 const gate=parse("select to_jsonb(g)from scoring_authority.ingress_gates g where tournament_id='2026'");
 const admission=parse('select to_jsonb(a)from production_control.certification_admission_v1 a');
 const counts=()=>parse(`select jsonb_build_object(
  'durableIngressLeases',(select count(*)from scoring_authority.scoring_ingress_leases),
  'transactionContextMarkers',(select count(*)from production_control.canonical_operation_context_v1),
  'closureRecords',(select count(*)from production_control.scoring_admission_closures),
  'productionResourceRows',(select count(*)from production_control.resource_scope),
  'productionCutoverRows',(select count(*)from production_control.cutover_activation_state),
  'holeScores',(select count(*)from scoring_authority.hole_scores))`);
 const before=counts();
 const request=r.command('SCORING.SUBMIT_HOLE',{mutation_key:'synthetic-lease-trace-probe',match_id:'SYNTHETIC-NOT-PRESENT',
  hole_number:1,team_1_gross_scores:[4,4],team_2_gross_scores:[4,4],expected_match_revision:0,expected_hole_revision:0});
 const domainResult=r.execute(request);
 const after=counts();
 const certificate=parse("select production_control.annual_scoring_predecessor_certificate_v1('2026')");
 const funcs=parse(`select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
  'signature',p.oid::regprocedure::text,'body',p.prosrc,'definition',pg_get_functiondef(p.oid),
  'sha256',encode(extensions.digest(p.prosrc,'sha256'),'hex'))order by n.nspname,p.proname,p.oid::regprocedure::text),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f'
  and n.nspname in('production_control','scoring_authority','participant_identity','production_rehearsal','public')`);
 const triggers=parse(`select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'trigger',t.tgname,
  'function',t.tgfoid::regprocedure::text,'definition',pg_get_triggerdef(t.oid),
  'functionBody',p.prosrc)order by n.nspname,c.relname,t.tgname),'[]')
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal
  and n.nspname in('production_control','scoring_authority','participant_identity','production_rehearsal','public','auth')`);
 const leaseReferences=funcs.filter(x=>/scoring_ingress_leases/.test(x.body));
 const leaseWriters=leaseReferences.filter(x=>/(?:insert\s+into|update|delete\s+from)\s+(?:scoring_authority\s*\.\s*)?scoring_ingress_leases\b/i.test(x.body));
 const map=new Map();for(const x of funcs){const key=x.schema+'.'+x.name;map.set(key,[...(map.get(key)||[]),x]);}
 const entryPoints=['public.read_certification_runtime_context_v1','public.execute_certification_operation_v1'];
 const seen=new Set(),pending=[...entryPoints];
 while(pending.length){const k=pending.shift();if(seen.has(k))continue;seen.add(k);
  for(const x of map.get(k)||[])for(const match of x.body.matchAll(/\b(public|production_control|scoring_authority|participant_identity|production_rehearsal)\s*\.\s*(\w+)\s*\(/g)){
   const next=match[1]+'.'+match[2];if(map.has(next)&&!seen.has(next))pending.push(next);
  }
 }
 const reachable=funcs.filter(x=>seen.has(x.schema+'.'+x.name));
 const reachableLeaseWriters=leaseWriters.filter(x=>seen.has(x.schema+'.'+x.name));
 const catalog={functions:funcs,triggers,staticReachability:{entryPoints,functions:[...seen].sort(),
  caveat:'Lexical fully qualified function references; all case branches over-approximated. This does not prove dynamic SQL or trigger reachability by itself.'}};
 const catalogPath='/private/tmp/r2-certification-ingress-catalog.json';
 await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
 report={environment:'OWNED_LOCAL_POSTGRESQL17_UNIX_SOCKET',schemaProfile:'IN_MEMORY_PROVISIONAL_131_THROUGH_135',
  timestamp:new Date().toISOString(),sourceHashes:hashes,sourceHashesUnchanged:null,
  context,admission,gate,before,domainResult,after,certificate,
  catalog:{path:catalogPath,sha256:sha(JSON.stringify(catalog,null,2)+'\n'),functionCount:funcs.length,triggerCount:triggers.length},
  installedLeaseReferences:leaseReferences.map(x=>x.signature),installedLeaseWriters:leaseWriters.map(x=>x.signature),
  lexicalGraph:{entryPoints,reachableFunctionCount:reachable.length,reachableLeaseWriters:reachableLeaseWriters.map(x=>x.signature)},
  leaseRelatedTriggers:triggers.filter(x=>/lease|ingress/i.test(x.table+' '+x.trigger)||/scoring_ingress_leases/.test(x.functionBody)),
  conclusions:{boundAdmissionGenerationInContext:Object.hasOwn(context,'admission_generation_id'),
   boundLeaseInContext:Object.keys(context).some(k=>/(^|_)lease(_|$)/.test(k)),
   durableLeaseCaptureDemonstrated:false,
   emptyLeaseRowsAreSafetyEvidence:false,
   canonicalScoringSuccessProven:false,
   runtimePathReachedCanonicalDomainRejection:domainResult?.code==='MATCH_NOT_FOUND',
   annualTransitionCertified:certificate?.certified===true,
   stopCondition:'OWNER_EXTENSION_CLAUSE_6_MISSING_CERTIFICATION_INGRESS_LEASE_CONTROL_CONTRACT'},
  boundaries:{hostedAccess:false,productionAccess:false,googleCalls:0,finalBaselineEmitted:false,newMigrationAuthored:false},cleanup:'PENDING'};
}finally{await destroyIsolatedCluster(f.cluster);}
const afterHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,sha(await readFile(root+path))])));
report.sourceHashesUnchanged=JSON.stringify(hashes)===JSON.stringify(afterHashes);
report.cleanup='OWNED_CLUSTER_STOPPED_AND_DIRECTORY_REMOVED';
const output='/private/tmp/r2-certification-ingress-counterevidence.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,leaseRelatedTriggers:report.leaseRelatedTriggers.map(({functionBody,...x})=>x)},null,2));
console.log('EVIDENCE_JSON='+output);
