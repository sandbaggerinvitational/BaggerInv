// Proof layers: POSTGRESQL / INTEGRATION. Synthetic authority only; no target URL accepted.
import { createScoreProofFixture } from './phase2-score-fixture.mjs';
import { destroyIsolatedCluster } from './postgres17.mjs';
import { installPhase2C } from './phase2c-install.mjs';
export async function createPhase2CFixture(options={}) {
  const fixture=await createScoreProofFixture({candidateSql:'supabase/production_migrations/202609280121_score_derived_intents_v1.sql'});
  try {fixture.phase2c=fixture.phase2c||await installPhase2C(fixture.cluster,fixture.database,options);return fixture;}
  catch(error){await destroyIsolatedCluster(fixture.cluster);throw error;}
}
