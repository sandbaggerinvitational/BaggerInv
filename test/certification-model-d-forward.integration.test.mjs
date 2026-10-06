import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createCalcuttaQueueFixture} from './support/reliability/certification-calcutta-queue-fixture.mjs';
import {sqlFile, repositoryRoot, destroyIsolatedCluster} from './support/reliability/postgres17.mjs';
import {canonicalCatalog, assertCatalogConvergence} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';

test('Model D forward install preserves old-resource history and exact metadata; replay/mismatch rollback', async () => {
  const f = await createCalcuttaQueueFixture({emptyAuction:false});
  const evidence = {hosted:false, cases:[]};
  try {
    for (const name of ['certification-calcutta-publication-v1.sql', 'certification-net-skins-result-read-v1.sql',
      'certification-net-skins-calculation-v1.sql', 'certification-odds-input-configuration-v1.sql']) {
      sqlFile(f.cluster, f.database, repositoryRoot+'/supabase/production_incremental/'+name, {role:''});
    }
    const artifact = await readFile(repositoryRoot+'/supabase/production_incremental/certification-model-d-execution-v1.sql','utf8');
    const preserved = () => {
      const tables=JSON.parse(f.q("select jsonb_agg(format('%I.%I',n.nspname,c.relname)order by n.nspname,c.relname)from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'and n.nspname in('scoring_authority','participant_identity','production_control')and c.relname not like 'certification_model_d_%'"));
      return Object.fromEntries(tables.map(name=>[name,f.q(`select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t)order by to_jsonb(t)::text collate "C"),'[]'::jsonb)::text,'sha256'),'hex')from ${name} t`)]));
    };
    const before=preserved();
    const originalCatalog=await canonicalCatalog(f.cluster,f.database);
    // Atomic rollback includes the deliberately changed predecessor.
    const mismatch=artifact.replace('begin;',()=>`begin;
      create or replace function production_control.worker_supervisor_scope_v1()returns void language plpgsql as $$begin raise exception 'WRONG_PREDECESSOR';end$$;`);
    assert.throws(()=>f.q(mismatch),/MODEL_D_PREDECESSOR_MISMATCH/);
    assert.deepEqual(preserved(),before);
    assert.equal(f.q("select to_regclass('production_control.certification_model_d_profile_v1')is null"),'t');
    evidence.cases.push('predecessor mismatch rolls back functions, tables and data');
    f.q(artifact);
    assert.deepEqual(preserved(),before);
    assert.equal(f.q('select production_control.worker_supervisor_model_d_v1()'),'f');
    assert.equal(f.q("select cardinality(production_control.worker_supervisor_engines_v1())"),'5');
    evidence.cases.push('old binding/history and five-engine scope unchanged');
    const catalog=await canonicalCatalog(f.cluster,f.database);
    const changed=originalCatalog.functions.filter(fn=>catalog.functions.find(v=>v.identity===fn.identity)?.definitionSha256!==fn.definitionSha256);
    assert.equal(changed.length,13);
    for(const fn of originalCatalog.functions){const next=catalog.functions.find(v=>v.identity===fn.identity);assert.ok(next);assert.deepEqual({...next,definitionSha256:fn.definitionSha256},fn);}
    assert.deepEqual(catalog.policies,originalCatalog.policies);
    for(const relation of originalCatalog.relations)assert.deepEqual(catalog.relations.find(v=>v.identity===relation.identity),relation);
    evidence.cases.push('exactly thirteen binding/scope corrections; all existing ACL, RLS and private-core metadata unchanged');
    const receipt=f.q('select to_jsonb(r)from production_control.certification_model_d_execution_installation_v1 r');
    f.q(artifact);
    assert.equal(f.q('select to_jsonb(r)from production_control.certification_model_d_execution_installation_v1 r'),receipt);
    assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),catalog);
    assert.deepEqual(preserved(),before);
    evidence.cases.push('exact replay: receipt, full catalog, ACL, owners, security, search_paths and history unchanged');
    assert.throws(()=>f.q(artifact.replace('begin;',`begin;grant execute on function production_control.model_d_context_v1(jsonb)to service_role;`)),/MODEL_D_HELPER_MISMATCH/);
    assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),catalog);
    assert.deepEqual(preserved(),before);
    evidence.cases.push('helper ACL drift rejected and transaction rolled back');
    assert.throws(()=>f.q(artifact.replace('begin;',`begin;alter table production_control.certification_model_d_profile_v1 disable row level security;`)),/MODEL_D_TABLE_METADATA_MISMATCH/);
    assertCatalogConvergence(await canonicalCatalog(f.cluster,f.database),catalog);
    evidence.cases.push('table RLS drift rejected without silent repair');
    evidence.preservedTableCount=Object.keys(before).length;
    evidence.functionCorrections=13;
    evidence.privateHelpers=3;
    evidence.existingHostedAccess=false;
  } finally {
    await destroyIsolatedCluster(f.cluster);
    const directory=repositoryRoot+'/docs/reliability/phase2d-model-d/evidence';
    await mkdir(directory,{recursive:true});
    await writeFile(directory+'/focused-forward.json',JSON.stringify(evidence,null,2)+'\n');
  }
});
