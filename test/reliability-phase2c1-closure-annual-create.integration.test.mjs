// Proof layers: API / INTEGRATION / POSTGRESQL / SECURITY / FAILURE_INJECTION.
// Reuse the preserved platform bootstrap only; installed runtime guards remain real.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
let source=await readFile(path.join(repositoryRoot,'test/reliability-phase2c1-release-admission.integration.test.mjs'),'utf8');
source=source.replace("from './support/reliability/postgres17.mjs'",`from ${JSON.stringify(new URL('./support/reliability/postgres17.mjs',import.meta.url).href)}`);
source=source.replaceAll('runZeroGoogleAnnualInitialization','runCanonicalAnnualCreateClosure');
source=source.replaceAll('phase2c1-annual-initialization.mjs','phase2c1-closure-annual-create.mjs');
source=source.replace('<=126','<=127').replace("'0126'","'0127'");
source=source.replace('const annualProof=runCanonicalAnnualCreateClosure','const annualProof=await runCanonicalAnnualCreateClosure');
source=source.replace("const annualInitMarker=", `source=source.replace('await t.test("commit, workers, Odds, and observation require each database milestone", () => {','await t.test("commit, workers, Odds, and observation require each database milestone", async () => {');\nconst annualInitMarker=`);
source=source.replace("schema:126","schema:127");
source=source.replaceAll('docs/reliability/phase2c1/evidence/annual-initialization.json','docs/reliability/phase2c1-closure/evidence/annual-create-results.json');
assert.ok(source.includes('<=127')&&source.includes('await runCanonicalAnnualCreateClosure'));
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
