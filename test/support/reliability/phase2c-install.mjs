// Proof layers: POSTGRESQL / INTEGRATION. Only an owned local fixture object is accepted.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { repositoryRoot, sql, sqlFile } from './postgres17.mjs';
export const phase2cBaseSha = 'b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18';
export const phase2cFixtureVersion = 'bagger-phase2c-recovery-delivery-v1';
export const phase2cSeed = 'phase2c-2026-recovery-delivery';
export const normalScoreTimeoutMs = 1000;
export const normalWorkerTimeoutMs = 5000;
export const tightTimeoutMs = 25;
export async function phase2cMigrations({ through = 124 } = {}) {
  assert.ok([122,123,124].includes(through));
  const directory = path.join(repositoryRoot,'supabase/production_migrations');
  const names = await readdir(directory);
  return Promise.all(Array.from({length:through-121},(_,i)=>i+122).map(async number=>{
    const matched=names.filter(name=>new RegExp(`^20260928${String(number).padStart(4,'0')}_.*\\.sql$`).test(name));
    assert.equal(matched.length,1,`exactly one reviewed migration ${number} required`);
    const file=path.join('supabase/production_migrations',matched[0]);
    return {path:file,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,file))).digest('hex')};
  }));
}
export function configureFiniteTimeout(cluster,database,timeoutMs=normalScoreTimeoutMs) {
  assert.match(database,/^[a-z][a-z0-9_]{0,62}$/);
  assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=normalWorkerTimeoutMs);
  sql(cluster,database,`alter database ${database} set statement_timeout='${timeoutMs}ms';alter database ${database} set timezone='UTC'`,{role:''});
  assert.equal(sql(cluster,database,"show timezone"),'UTC');
  assert.equal(sql(cluster,database,'select current_setting(\'statement_timeout\')::text'),timeoutMs===1000?'1s':timeoutMs===5000?'5s':`${timeoutMs}ms`);
}
export async function installPhase2C(cluster,database,{through=124,timeoutMs=normalScoreTimeoutMs}={}) {
  assert.equal(sql(cluster,database,"select to_regclass('scoring_authority.score_derived_intents_v1') is not null"),'t','Phase2 migration121 required');
  const migrations=await phase2cMigrations({through});
  for(const migration of migrations)sqlFile(cluster,database,path.join(repositoryRoot,migration.path),{role:''});
  if(process.env.BAGGER_PHASE2C1_CANDIDATE==='1'&&through===124){
    for(const number of [125,126]){
      const names=(await readdir(path.join(repositoryRoot,'supabase/production_migrations')))
        .filter(name=>new RegExp(`^20260929${String(number).padStart(4,'0')}_.*\\.sql$`).test(name));
      assert.equal(names.length,1,`exactly one Phase2C.1 migration ${number} required; never silently certify124`);
      const file=path.join('supabase/production_migrations',names[0]);
      sqlFile(cluster,database,path.join(repositoryRoot,file),{role:''});
      migrations.push({path:file,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,file))).digest('hex')});
    }
  }
  if(process.env.BAGGER_PHASE2C1_CLOSURE==='1'&&through===124){
    assert.equal(process.env.BAGGER_PHASE2C1_CANDIDATE,'1','Closure requires the verified retirement base');
    const names=(await readdir(path.join(repositoryRoot,'supabase/production_migrations')))
      .filter(name=>/^\d{8}0127_.*\.sql$/.test(name));
    assert.equal(names.length,1,'Exactly one closure migration127 required');
    const file=path.join('supabase/production_migrations',names[0]);
    sqlFile(cluster,database,path.join(repositoryRoot,file),{role:''});
    migrations.push({path:file,sha256:createHash('sha256').update(await readFile(path.join(repositoryRoot,file))).digest('hex')});
  }
  configureFiniteTimeout(cluster,database,timeoutMs);
  return {baseSha:phase2cBaseSha,fixtureVersion:phase2cFixtureVersion,migrations,statementTimeoutMs:timeoutMs,timeZone:'UTC',
    production:false,environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',runtimeAuthority:'EXPLICIT_SYNTHETIC_BOUNDARIES_UNLESS_TEST_OVERRIDES'};
}
