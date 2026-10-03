// Local compiler/reference installation only. Never accepts a URL, hosted target,
// credential or existing cluster. The reference's historical synthetic control
// rows are NOT included in the generated fresh-install baseline.
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
 createIsolatedCluster,destroyIsolatedCluster,createDatabase,repositoryRoot,
 sql,sqlFile,
} from './postgres17.mjs';
import {
 installRelease139Schema,installRelease139FunctionCandidates,installCertifiedSqlRepairs,
 release139Original069Fixture,
} from './release139-schema.mjs';

export const canonicalBootstrapBaseSha='7cec5128409286f5b4a5f3524d4c5488124a7be7';
export const canonicalBootstrapContract='bagger-canonical-bootstrap-v1';
export const canonicalBootstrapProfile='phase2-p0f-portrait-v1';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const canonicalSchemas=['participant_identity','production_control','production_rehearsal','scoring_authority'];
export const staticContractTables=[
 'production_control.annual_scoring_rpc_allowlist_v1',
 'production_control.annual_odds_operation_allowlist_v1',
 'production_control.annual_odds_2026_body_certifications_v1',
 'production_control.prediction_setting_definitions_v1',
 'participant_identity.player_portrait_policy_clock_v1',
];
export const requiredFunctionArtifacts=[
 'candidates/scored-match-resume.sql',
 'supabase/production_incremental/net-skins-sql-expressions-v1.sql',
 'supabase/production_incremental/calcutta-exact-job-activation-recovery-v1.sql',
 'supabase/production_incremental/director-calcutta-management-read-v1.sql',
 'supabase/production_incremental/director-calcutta-clear-entry-v1.sql',
 'supabase/production_incremental/player-portrait-policy-v1.sql',
];
export const excludedOptionalArtifacts=[
 'candidates/access-readiness.sql',
 ...['account-deletion-attribution-minimization.sql','account-deletion-completion-queue.sql',
 'account-deletion-completion-work-item.sql','account-deletion-external-identifier-redaction.sql',
 'participant-phone-authority-v1.sql','participant-phone-enrollment-v1.sql',
 'participant-phone-enforcement-v1.sql','phone-hook-acceptance-v1.sql']
 .map(name=>'supabase/production_incremental/'+name),
];
export async function canonicalSourceManifest({forwardMigrations=[]}={}) {
 const names=(await readdir(path.join(repositoryRoot,'supabase/production_migrations')))
  .filter(name=>/^\d{8}\d{4}_.*\.sql$/.test(name)&&Number(name.slice(8,12))<=130).sort();
 assert.equal(names.length,120,'Historical profile, including the approved069 exception, must contain exactly120 files');
 const paths=[...names.map(name=>'supabase/production_migrations/'+name),release139Original069Fixture,...requiredFunctionArtifacts,...forwardMigrations];
 assert.equal(new Set(paths).size,paths.length,'Repeated manifest file');
 return Promise.all(paths.map(async file=>{
  assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));
  assert.match(file,/\.sql$/);
  return{path:file,sha256:digest(await readFile(path.join(repositoryRoot,file)))};
 }));
}
export async function createCanonicalCompilerFixture({forwardMigrations=[]}={}) {
 const sourceManifest=await canonicalSourceManifest({forwardMigrations});
 const cluster=await createIsolatedCluster();const database='r2_canonical_compiler';
 try {
  createDatabase(cluster,database);
  await installRelease139Schema(cluster,database);
  installRelease139FunctionCandidates(cluster,database);
  installCertifiedSqlRepairs(cluster,database);
  const historical=(await readdir(path.join(repositoryRoot,'supabase/production_migrations'))).sort();
  for(let number=121;number<=130;number++){
   if(number===128)for(const name of ['director-calcutta-management-read-v1.sql','director-calcutta-clear-entry-v1.sql'])
    sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_incremental',name),{role:''});
   const matching=historical.filter(name=>/^\d{8}\d{4}_.*\.sql$/.test(name)&&Number(name.slice(8,12))===number);
   assert.equal(matching.length,1,`Exactly one historical migration${number} required`);
   sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_migrations',matching[0]),{role:''});
  }
  sqlFile(cluster,database,path.join(repositoryRoot,'supabase/production_incremental/player-portrait-policy-v1.sql'),{role:''});
  for(const file of forwardMigrations){
   assert.match(file,/^supabase\/production_migrations\/\d{8}\d{4}_[a-z0-9_]+\.sql$/);
   assert.ok(Number(path.basename(file).slice(8,12))>130,'Only new forward resource-model migrations');
   sqlFile(cluster,database,path.join(repositoryRoot,file),{role:''});
  }
  assert.deepEqual(await canonicalSourceManifest({forwardMigrations}),sourceManifest,'Compiler sources changed during installation');
  return{cluster,database,forwardMigrations,sourceManifest,
   metadata:{environment:'OWNED_SOCKET_ONLY_POSTGRESQL17',purpose:'SCHEMA_COMPILER_REFERENCE_NOT_CERTIFICATION_AUTHORITY',
    historicalSyntheticProductionRows:true,finalFreshInstallCopiesRows:false,profile:canonicalBootstrapProfile}};
 }catch(error){await destroyIsolatedCluster(cluster);throw error;}
}

// Local-only approximation of managed platform prerequisites. This is never
// emitted into canonical schema.sql and does not claim hosted Auth proof.
export function installLocalCanonicalPlatform(cluster,database){
 sql(cluster,database,`do $$begin
  if not exists(select 1 from pg_roles where rolname='anon')then create role anon nologin;end if;
  if not exists(select 1 from pg_roles where rolname='authenticated')then create role authenticated nologin;end if;
  if not exists(select 1 from pg_roles where rolname='service_role')then create role service_role nologin;end if;
 end$$;
 create schema auth;
 create table auth.users(id uuid primary key,email text,phone text,phone_change text,
 email_confirmed_at timestamptz,phone_confirmed_at timestamptz,confirmation_sent_at timestamptz,
 raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
 create table auth.identities(id uuid primary key,user_id uuid not null references auth.users(id),provider text not null,
 identity_data jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
 create function auth.role()returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user)$$;
 create function public.rls_auto_enable()returns void language plpgsql as $$begin end$$;`,{role:''});
}
