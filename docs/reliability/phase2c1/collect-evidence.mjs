// Documentation/evidence utility: read local receipts; never connects to a provider.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const entries=[];
for(const name of (await readdir(path.join(dir,'evidence'))).sort()){
 if(!name.endsWith('.json'))continue;
 const body=JSON.parse(await readFile(path.join(dir,'evidence',name),'utf8'));
 if(!body.suite||!body.sourceProvenance)continue;
 entries.push({id:`P2C1-E-${body.suite.toUpperCase()}`,suite:body.suite,artifact:`evidence/${name}`,result:body.result,counts:body.counts,sourceStable:body.sourcesStable,executionHead:body.executionHead,sourceManifest:body.implementationSourceManifest,environment:body.environment,proof:body.suite==='build'?'BUILD':body.suite==='application'?'BROAD_REGRESSION':'SEE_TEST_DECLARED_LAYERS',limitations:body.limitations,rawArtifact:`evidence/${body.rawArtifact}${!existsSync(path.join(dir,'evidence',body.rawArtifact))&&existsSync(path.join(dir,'evidence',body.rawArtifact+'.gz'))?'.gz':''}`,rawSha256:body.rawSha256});
}
for(const entry of entries)entry.rawEncoding=entry.rawArtifact.endsWith('.gz')?'gzip':'identity';
const metadata={schemaVersion:1,generatedAt:new Date().toISOString(),baseSha:'ab909d4519ea1331e27b0924de1572ebaf690777',environment:'LOCAL_NON_PRODUCTION',productionQueried:false,googleAccountAccessed:false,overallStatus:'PARTIAL',statusPolicy:'Passing test counts never override incomplete capability/annual/compatibility gates. Annual expected-red reproduction is not annual initialization PASS.',entries};
await writeFile(path.join(dir,'evidence-ledger.json'),JSON.stringify(metadata,null,2)+'\n');
const lines=['# Evidence ledger','','Generated from local source-bound runner receipts by `node docs/reliability/phase2c1/collect-evidence.mjs`. JSON retains each implementation hash manifest; the execution Git HEAD is the unchanged base at test time, not a claim the uncommitted candidate was already that commit. CANDIDATE-MANIFEST.md binds the later source commit.','','**Overall PARTIAL.** Exact capability limits are in CERTIFICATION.md and PROOF-MATRIX.md. No Production, hosted, physical, real Google or real-data proof was collected.','','| ID / suite | Result | Tests / pass / fail / skipped | Stable source | Artifact |','|---|---|---|---|---|'];
for(const e of entries){const c=e.counts;lines.push(`| ${e.id} | ${e.result} | ${c?`${c.tests} / ${c.pass} / ${c.fail} / ${c.skipped}`:'Build only'} | ${e.sourceStable} | [receipt](${e.artifact}) / [raw](${e.rawArtifact}) |`);}
lines.push('','## Claim-to-evidence mapping','','| Claim | Confidence / proof layer | Evidence | Limitation |','|---|---|---|---|',
'| Source retirement and canonical authority | PROVEN / SOURCE | GOOGLE-DEPENDENCY-REGISTER.md; CAPABILITY-REPLACEMENT.md | Not deployed; isolated Director replacement incomplete |',
'| No new Google jobs; financial/history rows preserved | PROVEN / POSTGRESQL | evidence/google-retirement-sql.json | Synthetic fixtures, upgrade path; no real account/Production inventory |',
'| All2017–2026 canonical History/Records service fixtures | PROVEN / INTEGRATION with injected canonical transport | retirement receipt; HISTORY-SOURCE-PROOF.md | Complete corrected real historical dataset NOT PROVEN |',
'| Compiled zero-credential boot | PROVEN / API localHTTP | boot receipt; evidence/zero-credential-boot.json | Synthetic nonfunctional provider config; no DB connectivity/authenticated Director proof |',
'|432holes/24Final without Google | PROVEN / POSTGRESQL + INTEGRATION | full-sequence receipt; evidence/revalidation/phase2c/full-sequence-results.json | Explicit synthetic admission boundaries; no hosted client/Prepare/Open rehearsal |',
'| Managed internal delivery | PROVEN at named test layers | delivery receipt and P0-B-RECERTIFICATION.md | Hosted scheduler/resource capacity unproved |',
'| Annual current/target contradiction | PROVEN / POSTGRESQL + SOURCE | evidence/annual-initialization.json; ANNUAL-INITIALIZATION.md | Expected-red reproduction is not annual initialization success |',
'| Bounded local score benchmark | Measured PERFORMANCE | benchmark-results.json and PERFORMANCE.md | Rollback samples/fsync off; local only; tails and variance reported separately |',
'| Missing Director replacement / compatibility | PROVEN SOURCE and failing broad contracts | CLIENT-COMPATIBILITY.md; application receipt/adjudication | Blocks advancement; no weakening of Production gates permitted |',
'| Identity fallback correction | PROVEN / UNIT + injected API | retirement-security; evidence/identity-admission-security-correction.json | No hosted identity proof |',
'| Historical external preservation | UNKNOWN | HISTORICAL-PRESERVATION.md | Real account never accessed; no deletion authorized |');
lines.push('','Failing TAP outputs with significant whitespace are stored losslessly as gzip. [Storage manifest](evidence/raw-artifact-storage.json) maps original receipt paths and SHA256 to compressed files. Decompress before comparing rawSha256; no diagnostic bytes were trimmed.');
await writeFile(path.join(dir,'EVIDENCE.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({receipts:entries.length,status:'PARTIAL'}));
