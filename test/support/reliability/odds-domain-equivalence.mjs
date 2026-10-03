// Proof only: compare the existing durable engine against its synchronous
// reference, and verify that the canonical calculation modules are unchanged.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {repositoryRoot} from './postgres17.mjs';
import {certifyOddsCalculationReference} from '../../../lib/championship-odds-resilience.js';

const BASE='7cec5128409286f5b4a5f3524d4c5488124a7be7';
const modules=['lib/tournament-odds.js','lib/prediction-engine.js','lib/tournament-context.js',
 'lib/championship-odds-resilience.js','lib/championship-odds-supabase.js',
 'lib/published-odds-supabase.js','lib/mobile-v1-odds.js'];
const digest=value=>createHash('sha256').update(value).digest('hex');

export async function assertOddsDomainEquivalence({tournamentId,jobId,readJobs}){
 const source=[];
 for(const file of modules){
  const before=execFileSync('git',['show',`${BASE}:${file}`],{cwd:repositoryRoot});
  const current=await readFile(repositoryRoot+'/'+file);
  assert.equal(digest(current),digest(before),`${file}: canonical domain module changed`);
  source.push({file,base:BASE,sha256:digest(current),unchanged:true});
 }
 const reference=await certifyOddsCalculationReference({tournamentId,jobId,dependencies:{readJobs}});
 assert.equal(reference.ok,true);assert.equal(reference.exactEquality,true);assert.equal(reference.storedFingerprintValid,true);
 return{source,reference};
}

export function assertPublicOddsHasNoPrivateProvenance(value){
 const forbidden=/^(?:resource_?id|installation_?id|certification_?ingress_?generation_?id|operation_?request_?id|actor_?auth_?user_?id|runtime_?generation_?id|authority_?epoch_?id|source_?revision|resource_?binding|canonical_?context|lease_?id)$/i;
 const walk=(entry,path='$')=>{
  if(!entry||typeof entry!=='object')return;
  for(const [key,child]of Object.entries(entry)){
   assert.equal(forbidden.test(key),false,`Private provenance leaked into public Odds result: ${path}.${key}`);
   walk(child,`${path}.${key}`);
  }
 };
 walk(value);
}
