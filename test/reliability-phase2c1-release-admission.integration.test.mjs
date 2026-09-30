// Proof layers: POSTGRESQL / INTEGRATION / CLIENT_COMPATIBILITY.
// Historical platform migration bootstrap runs in owned socket-only PostgreSQL.
// The candidate release phase installs125/126, has no Google writer/target and
// disables provider workers. All real current release guards remain installed.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
const base='test/step13e7b-production-annual-normal-release-rebind-postgres.integration.test.mjs';
let generator=await readFile(path.join(repositoryRoot,base),'utf8');
const rootDeclaration=`const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);`;
assert.ok(generator.includes(rootDeclaration));generator=generator.replace(rootDeclaration,`const repositoryRoot = ${JSON.stringify(repositoryRoot)};`);
generator=generator.replace('test/fixtures/step13e7b-production-annual-normal-release-rebind.sql','test/fixtures/reliability-phase2c1-annual-release.sql');
// Retired historical mirror rows are evidence, not a current release obligation.
const obsoleteMirrorAssertion=`    if not blocked then
      raise exception 'RUNNING_RETIRED_MIRROR_JOB_WAS_NOT_BLOCKED';
    end if;`;
assert.ok(generator.includes(obsoleteMirrorAssertion));generator=generator.replace(obsoleteMirrorAssertion,`    if blocked then
      raise exception 'RETIRED_MIRROR_HISTORY_BLOCKED_CANONICAL_RELEASE';
    end if;`);
const entry='await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);';
assert.ok(generator.includes(entry));generator=generator.replace(entry,'export default source;');
let {default:source}=await import(`data:text/javascript;base64,${Buffer.from(generator).toString('base64')}`);
const once=(needle,replacement)=>{assert.equal(source.split(needle).length,2,`one fixture anchor required: ${needle.slice(0,90)}`);source=source.replace(needle,replacement);};
source=`import {runZeroGoogleAnnualInitialization} from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/phase2c1-annual-initialization.mjs')).href)};\nimport {createIsolatedCluster as createOwnedCluster,destroyIsolatedCluster as destroyOwnedCluster} from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)};
import {writeFileSync,mkdirSync} from 'node:fs';\n`+source;
const start=source.indexOf('async function createCluster() {'),end=source.indexOf('function createDatabase(',start);
assert.ok(start>0&&end>start);source=source.slice(0,start)+`async function createCluster(){const owned=await createOwnedCluster();return {...owned,clusterRoot:owned.directory,dataDirectory:owned.data,socketDirectory:owned.socket,logFile:owned.log};}
async function destroyCluster(cluster){await destroyOwnedCluster(cluster);}
`+source.slice(end);
const later=(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).filter(n=>/^\d{12}_.*\.sql$/.test(n)&&Number(n.slice(8,12))>=79&&Number(n.slice(8,12))<=126).sort();
assert.equal(later.at(-1)?.slice(8,12),'0126');
// Opt-in P0F proof installs the exact candidate, preserving historical default126.
if(process.env.BAGGER_P0F_CANDIDATE==='1'){
 const installed=Number(later.at(-1).slice(8,12));
 const additions=(await readdir(path.join(repositoryRoot,'supabase/production_migrations')))
  .filter(n=>/^\d{12}_.*\.sql$/.test(n)&&Number(n.slice(8,12))>installed&&Number(n.slice(8,12))<=130).sort();
 assert.equal(additions.length,130-installed);
 later.push(...additions);
}
const p0fDefinitionsSql="select jsonb_agg(jsonb_build_object('signature',v.signature,'definition',pg_get_functiondef(v.signature::regprocedure)) order by v.signature) from (values ('public.mutate_production_match_control(jsonb)'),('production_control.read_tournament_setup_before_round_workspace_v1(jsonb)'),('production_control.mutate_setup_before_late_r3_v1(jsonb)'),('production_control.mutate_round_pairings_before_late_r3_v1(jsonb)'),('public.read_production_tournament_setup_v1(jsonb)'),('production_control.mutate_late_r3_dispatch_v1(jsonb,boolean)'),('public.mutate_production_round_pairings_v1(jsonb)'),('public.mutate_production_tournament_setup_v1(jsonb)'),('public.save_production_net_skins_entries_v1(jsonb)'),('public.replace_production_calcutta_v1_auction_facts(jsonb)'),('public.clear_production_calcutta_v1_auction_entry(jsonb)')) v(signature)";
const p0fPrerequisites=['supabase/production_incremental/director-calcutta-management-read-v1.sql','supabase/production_incremental/director-calcutta-clear-entry-v1.sql'];
const extras=['supabase/production_incremental/net-skins-sql-expressions-v1.sql','supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql','candidates/scored-match-resume.sql'];
once('        const frozenDatabase = "annual_normal_release_frozen_2026";',`
        let p0fBeforeDefinitions;
        for(const filename of ${JSON.stringify(later)}){
          if(filename.startsWith('202609280121'))for(const extra of ${JSON.stringify(extras)})psqlFile(cluster,database,path.join(repositoryRoot,extra));
          if(filename.startsWith('202609300128'))for(const extra of ${JSON.stringify(p0fPrerequisites)})psqlFile(cluster,database,path.join(repositoryRoot,extra));
          if(filename.startsWith('202609300128'))p0fBeforeDefinitions=JSON.parse(psql(cluster,database,${JSON.stringify(p0fDefinitionsSql)}));
          psqlFile(cluster,database,path.join(migrationsDirectory,filename));
        }
        // This is canonical synthetic fixture configuration, not Google data import.
        psql(cluster,database,"update production_control.resource_scope set odds_publication_authority='SUPABASE',odds_publication_enabled=true where scope_key='BAGGER_INV_PRODUCTION'");
        assert.equal(psql(cluster,database,"select count(*)from production_control.worker_controls where worker_name in('SCORING_GOOGLE_OUTBOX','ROUND_SCORECARDS_ARCHIVE') and(enabled or scheduler_installed or google_writes_allowed)"),'0');
        assert.equal(psql(cluster,database,"select google_writes_enabled from production_control.resource_scope where scope_key='BAGGER_INV_PRODUCTION'"),'f');
        const frozenDatabase = "annual_normal_release_frozen_2026";`);
once('function normalReleaseDirectInput(current, label, overrides = {}) {\n  return rebindInputV2(current, label, {',`function normalReleaseDirectInput(current,label,overrides={}) {
  return rebindInputV2(current,label,{
    runtime_google_ingress_lease_gate_enabled:false,
    runtime_google_mirror_enabled:false,
    runtime_scorecard_archive_enabled:false,
    runtime_outbox_worker_secret_configured:false,
    runtime_archive_worker_secret_configured:false,
    runtime_odds_publication_authority:'SUPABASE',
    runtime_supabase_odds_publication_enabled:true,`);
// P0F-only positive equivalence uses the already admitted synthetic frozen2026
// database. No hosted identity is asserted by this harness.
if(process.env.BAGGER_P0F_CANDIDATE==='1')source=`import {runP0FProductionEquivalence} from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/p0f-production-equivalence.mjs')).href)};\n`+source;
const annualInitMarker='        const annualBefore = psql(';
once(annualInitMarker,`
        if(process.env.BAGGER_P0F_CANDIDATE==='1'){
          const protectedProof=runP0FProductionEquivalence({cluster,database:frozenDatabase,psql,jsonSql,scope:normalReleaseCapabilityScope(),beforeDefinitions:p0fBeforeDefinitions});
          const protectedFile=path.join(repositoryRoot,'docs/reliability/phase2c1-closure/evidence/p0f-approved/protected-equivalence.json');
          mkdirSync(path.dirname(protectedFile),{recursive:true});writeFileSync(protectedFile,JSON.stringify(protectedProof,null,2)+'\\n');
        }
        // The historical126 helper expects the CREATE contradiction. Candidate127+
        // is certified by the separate corrected annual-create suite; do not run
        // its obsolete expected-red assertion as release admission evidence.
        if(process.env.BAGGER_P0F_CANDIDATE!=='1'||process.env.BAGGER_P0F_ANNUAL_CONTRACT==='1'){
        const annualProof=runZeroGoogleAnnualInitialization({cluster,database:frozenDatabase,psql,jsonSql});
        const annualEvidenceFile=path.join(repositoryRoot,'docs/reliability/phase2c1/evidence/annual-initialization.json');mkdirSync(path.dirname(annualEvidenceFile),{recursive:true});writeFileSync(annualEvidenceFile,JSON.stringify(annualProof.evidence,null,2)+'\\n');
        }
`+annualInitMarker);
const annualMarker='        const annualBefore = psql(';
once(annualMarker,`
        assert.equal(psql(cluster,database,"select count(*)from production_control.future_google_writer_targets_v2 where tournament_id='2099'"),'0');
        assert.equal(psql(cluster,database,"select count(*)from production_control.future_google_writer_generations_v2"),'0');
        const zeroGoogleContext=JSON.parse(psql(cluster,database,"select production_control.postcutover_annual_release_context_v1()::text"));
        assert.equal(zeroGoogleContext.googleRuntimeContract,'google-runtime-retired-v1');
        assert.ok(zeroGoogleContext.sideGameCertificationFingerprint);
        assert.equal(Object.hasOwn(zeroGoogleContext,'googleWriterGenerationId'),false);
`+annualMarker);
const rebindMarker='        const annualRebind = rpc(';
once(rebindMarker,`
        for(const field of ['runtime_google_ingress_lease_gate_enabled','runtime_google_mirror_enabled','runtime_scorecard_archive_enabled','runtime_outbox_worker_secret_configured','runtime_archive_worker_secret_configured']) {
          assertCommandFailure(()=>rpc(cluster,database,'rebind_production_postcutover_normal_release',{...annualRebindInput,[field]:true}),/PRODUCTION_POSTCUTOVER_NORMAL_RELEASE_INPUT_INVALID/);
        }
`+rebindMarker);
const finalMarker='        console.log(JSON.stringify({\n          result: "ANNUAL_RELEASE_REVIEW_OK",';
once(finalMarker,`
        const evidence={fixture:'phase2c1-zero-google-release-v1',environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',schema:126,result:'PASS',runtimeGuardsSubstituted:false,
          GoogleWriterRows:0,GoogleCalls:0,GoogleCredentialsRequired:false,frozen2026Release:'PASS',frozen2026Replay:'PASS',annual2099Release:'PASS',annualReplay:'PASS',secondAnnualRelease:'PASS',
          staleAuthorityDenied:true,conflictingReplayDenied:true,canonicalActiveWorkerDenied:true,orphanCanonicalLeaseDenied:true,activeAnnualTransitionDenied:true,
          GoogleFlagsRejected:5,retiredMirrorHistoryIgnored:true,annualRowsUnchanged:annualAfter===annualBefore,canonicalSideGameCertification:zeroGoogleContext.sideGameCertificationFingerprint,
          limitations:['Synthetic annual authority fixture; not a full CREATE/PREPARE/ACTIVATE annual initialization','Historical platform bootstrap models prior Google cutover locally; candidate normal release phase requires no Google','No hosted, Production, real Google or physical proof'],timestamp:new Date().toISOString()};
        if(process.env.BAGGER_P0F_CANDIDATE==='1')evidence.schema=130;
        if(process.env.BAGGER_PHASE2C1_RELEASE_EVIDENCE){const file=path.resolve(process.env.BAGGER_PHASE2C1_RELEASE_EVIDENCE);assert.ok(file.startsWith(path.join(repositoryRoot,'docs/reliability/phase2c1/')));mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(evidence,null,2)+'\\n');}
        console.log(JSON.stringify(evidence));
`+finalMarker);
// No credentials from the invoking shell can turn this test into external access.
for(const key of Object.keys(process.env))if(/GOOGLE|SHEETS|DRIVE|WORKBOOK|SERVICE_ACCOUNT|TOKEN|SECRET|SUPABASE/.test(key))delete process.env[key];
globalThis.fetch=async()=>{throw new Error('PHASE2C1_RELEASE_ZERO_NETWORK_GUARD');};
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
