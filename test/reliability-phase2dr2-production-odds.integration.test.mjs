// Actual protected local Production admission and canonical Odds engine. No
// runtime predicate substitution, fake result, historical adoption, or network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
let wrapper=await readFile(repositoryRoot+'/test/reliability-phase2dr2-production-equivalence.integration.test.mjs','utf8');
wrapper=wrapper.replace("from './support/reliability/postgres17.mjs'",`from ${JSON.stringify(pathToFileURL(repositoryRoot+'/test/support/reliability/postgres17.mjs').href)}`);
const entry="await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);";
assert.ok(wrapper.endsWith(entry+'\n'));
wrapper=wrapper.slice(0,-entry.length-1)+'export default source;\n';
let {default:source}=await import('data:text/javascript;base64,'+Buffer.from(wrapper).toString('base64'));
source=`import {runProductionOddsGolden} from ${JSON.stringify(pathToFileURL(repositoryRoot+'/test/support/reliability/production-odds-equivalence.mjs').href)};\n`+source;
// The shared protected fixture now installs the full131–152 profile.
// Do not duplicate migration installation in this focused wrapper.
const original='const protectedProof=runP0FProductionEquivalence({cluster,database:frozenDatabase,psql,jsonSql,scope:normalReleaseCapabilityScope(),beforeDefinitions:p0fBeforeDefinitions});';
assert.equal(source.split(original).length,2);
source=source.replace(original,'const protectedProof=await runProductionOddsGolden({cluster,database:frozenDatabase,psql,jsonSql,scope:normalReleaseCapabilityScope()});');
const callback='await t.test("commit, workers, Odds, and observation require each database milestone", () => {';
assert.equal(source.split(callback).length,2);source=source.replace(callback,callback.replace('() =>','async () =>'));
source=source.replaceAll('production-protected-equivalence.json','production-odds-equivalence.json');
try{await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
catch(error){throw new Error('Production Odds fixture module: '+error.message,{cause:undefined});}
