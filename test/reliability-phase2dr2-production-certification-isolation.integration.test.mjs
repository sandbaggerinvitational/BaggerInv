import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
let source=await readFile(path.join(repositoryRoot,'test/reliability-phase2dr2-production-equivalence.integration.test.mjs'),'utf8');
source=source.replace("from './support/reliability/postgres17.mjs'",`from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)}`);
const entry="await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);";
assert.ok(source.trimEnd().endsWith(entry));source=source.slice(0,source.lastIndexOf(entry))+'export {source as default,migrations};';
const {default:generated,migrations}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const needle='const protectedProof=runP0FProductionEquivalence({cluster,database:frozenDatabase,psql,jsonSql,scope:normalReleaseCapabilityScope(),beforeDefinitions:p0fBeforeDefinitions});';
assert.equal(generated.split(needle).length,2);
let output=`import {runProductionCertificationIsolation} from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/production-certification-isolation.mjs')).href)};\n`+generated.replace(needle,
 needle+`\nconst resourceIsolation=await runProductionCertificationIsolation({cluster,database:frozenDatabase,scope:normalReleaseCapabilityScope(),forwardMigrations:${JSON.stringify(migrations.map(m=>'supabase/production_migrations/'+m))}});\nwriteFileSync('/private/tmp/r2-production-certification-isolation.json',JSON.stringify(resourceIsolation,null,2)+'\\n');`);
const callback='await t.test("commit, workers, Odds, and observation require each database milestone", () => {';
assert.equal(output.split(callback).length,2);output=output.replace(callback,callback.replace('() =>','async () =>'));
output=output.replaceAll('production-protected-equivalence.json','production-certification-protected-equivalence.json');
try{await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);}
catch(error){throw new Error('Production/Certification isolation module: '+error.message,{cause:undefined});}
