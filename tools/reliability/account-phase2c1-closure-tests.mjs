#!/usr/bin/env node
// Read-only source/evidence comparison; writes closure accounting artifacts only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url),acorn=require('next/dist/compiled/acorn');
const base='4f5be5928a362f77edca375919df55be23695177';
const dir='docs/reliability/phase2c1-closure';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const hash=s=>createHash('sha256').update(s).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
const exists=p=>fs.existsSync(path.join(root,p));
const actions=json(dir+'/test-review-actions.json');
const delegated=exists(dir+'/evidence/director-test-accounting.json')?json(dir+'/evidence/director-test-accounting.json'):[];
for(const a of delegated)actions.push({file:a.file,test:a.oldTest,replacement:a.newTest,action:a.action==='FIXTURE_COMPONENT_IMPORT'?'FIXTURE_UPDATE':'REWRITE',why:a.oldModel?`${a.oldModel} becomes ${a.newModel}`:'Required canonical capability replaces retired provider workflow; runtime integration and security are separately certified.'});
const manifest=json(dir+'/failure-manifest.json');
const prior=json('docs/reliability/phase2c1/evidence/application.json');
const baseline=json('docs/reliability/phase2c/evidence/application.json');
const selection=json('docs/reliability/phase2/evidence/application-selection.json');
assert.equal(selection.length,493);assert.equal(manifest.failures.length,188);
const walk=(n,out=[])=>{if(!n||typeof n!=='object')return out;if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='test'&&n.arguments[0]?.type==='Literal')out.push(n);for(const [k,v] of Object.entries(n)){if(k==='loc')continue;if(Array.isArray(v))v.forEach(c=>walk(c,out));else if(v&&typeof v==='object')walk(v,out)}return out};
const tests=s=>walk(acorn.parse(s,{ecmaVersion:'latest',sourceType:'module',locations:true})).map(n=>({name:n.arguments[0].value,sha256:hash(s.slice(n.start,n.end)),line:n.loc.start.line}));
const fromBase=file=>{try{return git('show',base+':'+file)}catch{return ''}};
const changed=[...new Set([...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')])].filter(p=>/^test\/.*\.mjs$/.test(p)).sort();
const changedTests=changed.flatMap(file=>{const before=tests(fromBase(file)),after=tests(read(file));return [...before.map(old=>{const current=after.find(v=>v.name===old.name);if(current?.sha256===old.sha256)return null;return {file,test:old.name,change:current?'MODIFIED':'REMOVED_OR_RENAMED',before:old,after:current||null}}).filter(Boolean),...after.filter(v=>!before.some(o=>o.name===v.name)).map(v=>({file,test:v.name,change:'ADDED_OR_RENAMED',before:null,after:v}))]});
const normalizeDiagnostic=s=>(s||'').replace(/<CHECKOUT>|\/Users\/[^\n]*?\/BaggerInv/g,'<CHECKOUT>').replace(/duration_ms: [^\n]+/g,'duration_ms: <TIME>').replace(/:\d+:\d+/g,':<LINE>:<COL>').replace(/\n  stack:[\s\S]*/,'').trim();
const rawText=(phase)=>{let p='docs/reliability/'+phase+'/evidence/application.tap';return exists(p)?read(p):exists(p+'.gz')?gunzipSync(fs.readFileSync(path.join(root,p+'.gz'))).toString():null};
const parseRaw=s=>s?[...s.matchAll(/^(ok|not ok) \d+ - (.+)\n([\s\S]*?)(?=^(?:ok|not ok|# Subtest:|1\.\.|# tests )|$(?![\s\S]))/gm)].map(m=>({name:m[2],status:m[1]==='ok'?'PASS':'FAIL',diagnostic:m[3]})):[];
const priorRaw=parseRaw(rawText('phase2c1'));assert.equal(priorRaw.length,4159);
const candidate=exists(dir+'/evidence/application.json')?json(dir+'/evidence/application.json'):null;
const candidateRaw=parseRaw(rawText('phase2c1-closure'));
if(candidate){assert.equal(candidate.sourceProvenance.before.entryPoints.length,493);assert.equal(new Set(selection).size,493);assert.deepEqual([...candidate.sourceProvenance.before.entryPoints].sort(),[...selection].sort());assert.equal(candidateRaw.length,candidate.counts.tests)}
const baselineRaw=parseRaw(rawText('phase2c'));
const row=(file,test)=>({file,test});
const coverage={
 transport:row('test/reliability-phase2c1-runtime.test.mjs','UNIT accidental legacy transport fails locally and attempted Google dependency is observable'),
 guideSync:row('test/guide-service-layer.test.mjs','UNIT retired Guide delivery never claims or reads even when legacy flags are enabled'),
 guideCron:row('test/guide-service-layer.test.mjs','API retired Guide cron and diagnostics reject before credentials or provider access'),
 director:row('test/reliability-phase2c1-closure-director.test.mjs','INTEGRATION NA-2026-DIRECTOR-CANONICAL-ROUTING: shipping client reaches canonical route with zero Google'),
 dashboard:row('test/reliability-phase2c1-delivery-retirement.test.mjs','API: legacy Director workbook dashboard is explicitly retired without any transport'),
 score:row('test/reliability-phase2c1-runtime.test.mjs','API canonical score acknowledgement preserves legacy boolean field and reports retired outbox false'),
 final:row('test/reliability-phase2c1-delivery-retirement.test.mjs','API: canonical Final confirmation survives a failed readback without any Google fallback'),
 archive:row('test/reliability-phase2c1-delivery-retirement.test.mjs','API: retired round-scorecards-archive rejects GET/POST before credentials, body, queue or adapter'),
 outbox:row('test/reliability-phase2c1-delivery-retirement.test.mjs','API: retired scoring-google-outbox rejects GET/POST before credentials, body, queue or adapter'),
 boundary:row('test/reliability-phase2c1-closure-boundaries.test.mjs','SOURCE closure preserves shipping native and previous reliability evidence'),
 auth:row('test/reliability-phase2c1-runtime.test.mjs','UNIT canonical identity requires matching database/auth authority with no Passport fallback'),
 activation:row('test/reliability-phase2c1-runtime.test.mjs','UNIT Production activation retains security tuple without external workbook admission'),
 annual:row('test/reliability-phase2c1-runtime.test.mjs','API annual score dispatch binds canonical generations without calling Google destination RPC'),
 recovery:row('test/reliability-phase2c-recovery.test.mjs','unknown is never NOT_COMMITTED and does not return a canonical guess'),
 requiredWorkers:row('test/reliability-phase2c1-delivery-retirement.test.mjs','UNIT: mobile post-commit ignores unavailable retired transports and retains three internal families'),
 workerHealth:row('test/reliability-phase2c1-delivery-retirement.test.mjs','UNIT: disabled/failed historical Google consumers cannot degrade healthy internal workers'),
};

// Resolve literal/template test names in simple parameterized loops for exact coverage references.
function declaredNames(file) {
 const ast=acorn.parse(read(file),{ecmaVersion:'latest',sourceType:'module'}),names=[];
 const value=(n,env)=>n?.type==='Literal'?n.value:n?.type==='Identifier'?env[n.name]:n?.type==='TemplateLiteral'?n.quasis.reduce((acc,q,i)=>acc+q.value.cooked+(i<n.expressions.length?String(value(n.expressions[i],env)??'<DYNAMIC>'):''),''):undefined;
 function visit(n,env={}) {
  if(!n||typeof n!=='object')return;
  if(n.type==='ForOfStatement'&&n.right?.type==='ArrayExpression') {
   const name=n.left?.declarations?.[0]?.id?.name;
   if(name&&n.right.elements.every(e=>e?.type==='Literal')){for(const e of n.right.elements)visit(n.body,{...env,[name]:e.value});return;}
  }
  if(n.type==='CallExpression'&&n.callee?.type==='Identifier'&&n.callee.name==='test') {const name=value(n.arguments[0],env);if(typeof name==='string')names.push(name);}
  for(const [k,v] of Object.entries(n)){if(k==='loc')continue;if(Array.isArray(v))v.forEach(c=>visit(c,env));else if(v&&typeof v==='object')visit(v,env);}
 }
 visit(ast);return names;
}
for(const c of Object.values(coverage))assert.ok(declaredNames(c.file).includes(c.test),'Missing exact replacement test: '+c.file+' :: '+c.test);

function replacements(a){
 if(a.file.includes('guide-api-security'))return [coverage.guideCron,coverage.director];
 if(a.file.includes('guide-service-layer'))return [coverage.guideSync,coverage.guideCron];
 if(a.file.includes('round-scorecards-archive'))return [coverage.archive,coverage.final,coverage.workerHealth];
 if(/byte|runtime blob|unchanged from Release/.test(a.test)||a.file==='test/pn2-native-admission.test.mjs')return [coverage.boundary];
 if(/Google write lease|epoch-bound/.test(a.test))return [coverage.transport,coverage.activation];
 if(/Google|Sheets|Drive|WRITE_STARTED|credential|callback|v3 |provider|fence|canonical wrapper|route matrix/.test(a.test))return [coverage.transport,...(/BEGIN|ambiguous|outcome/.test(a.test)?[coverage.recovery]:[]),...(/worker|annual/.test(a.test)?[coverage.annual]:[])];
 if(/worker routes/.test(a.test))return [coverage.outbox,coverage.archive];
 if(/Director|rehearsal|workbook access/.test(a.test))return [coverage.director,coverage.dashboard,...(/reopen|repair|Final|finalization|lifecycle/.test(a.test)?[coverage.final]:[])];
 if(/finalization/.test(a.test))return [coverage.final];
 return [coverage.transport,coverage.requiredWorkers];
}
const manualRename={
 'live Production remains Google/Passport and rejects injected candidate read selection':'unadmitted Production fails closed and rejects injected candidate read selection',
 'future target scope is separate from and cannot alias the certified 2026 provenance':'annual year representation is explicit; installed current-authority admission decides future eligibility'
};
const fileReasons={
 'history-2026-supabase':'All supported reads use canonical admission; 2026 dispatch remains year-scoped, and invalid or unadmitted environments deny instead of falling back to Google.',
 'history-step5':'Google selections now fail unavailable. Canonical Supabase selection and exact year isolation stay required; no rollback to retired authority.',
 'history-step6':'Canonical source defaults and shared service shapes supersede Google defaults. Course/history calculations and no page-level privileged access remain.',
 'option2-production-maintenance':'Retired Google mirror/archive controls are false regardless of obsolete supplied configuration. Canonical deployment, resource tuple, epoch and stale-admission checks are retained.',
 'participant-auth':'Retired Passport fallback and bootstrap cannot confer runtime authority. OTP/privacy/logout assertions outside that rewrite remain; their baseline failures are not waived.',
 'participant-identity':'Canonical auth origin and database identity must match; Passport cannot confer runtime authority.',
 'production-activation':'External workbook fields no longer admit canonical authority. All canonical project, host, release, activation, SHA and phase negatives remain.',
 'production-scoring':'Canonical scoring is the only admitted authority; missing or incompatible runtime state denies instead of falling back to Google. No scoring rule assertion changes.',
 'annual':'Retired Google destination/worker fields cannot become authority; canonical server-selected year, generation, pointer and dispatch must remain. Annual CREATE target year is separate from current runtime year.',
 'future-year-administration':'One integer target year is validated separately from current authority. Actual SQL rejects current/existing year CREATE; parsing no longer hardcodes 2027.',
 'guide':'Canonical participant Guide projection and privacy/RLS remain. Google sync/bootstrap/delivery is retired; negative runtime checks replace delivery success expectations.',
 'production-shadow':'Canonical-only runtime denies Google/Passport fallback. Read-only shadow admission and transport remain unresolved where actual routing still fails; no write authority is introduced.',
 'cutover-read':'Canonical selectors require current activation; optional canonical empty values remain valid without obsolete provider gates. Private publication still requires independent authority.',
 'scoring-authority':'Canonical server persistence and required internal derived work stay required; Google mirror/delivery/import/parity operations no longer count as canonical success.',
 'scoring-shadow':'Participant code remains database-inactive; current server mutation persists canonically without Google outbox drain.',
 'scoring-lifecycle':'Only dedicated canonical lifecycle operations may mutate match state. Generic Google-era updates cannot bypass the authority contract.',
 'scoring-reopen':'Canonical reopen/audit/score preservation remains. Google normalization and archive invalidation are retired requirements.',
 'live-match':'Canonical authorization precedes persistence; retired provider credentials never authorize live operations.',
 'director-mutation':'Canonical Director authorization, client authority validation and persistence ordering are asserted; no provider fallback or provider secret admission.',
 'data-authority':'Unknown/Google/application tokens fail closed. Domain services resolve canonical shared authority with no hidden fallback.',
 'prediction-settings':'Admitted canonical Preview fixture uses exact database identity and server secret. Production/unconfigured/Google paths deny, and canonical failures do not trigger provider fallback.',
 'scope':'Historical exact-release byte freezes do not apply to later explicitly authorized architecture changes; independent current correctness/security and no-native/no-Production scope proofs are required.',
 'pn1':'Only obsolete historical implementation byte freeze removed. Current mobile boundary denial test remains and its baseline failure remains visible.',
 'pn2':'Only obsolete historical implementation byte freeze removed; current runtime/mobile capability and authorization tests retained.',
 'scorecard-public':'Records consumes scorecardAnalytics through the canonical secondary-history service. The test still fails at the same original PlayerFormatMatchHistory ScorecardTable expectation, which is outside closure scope.',
 'draft':'Canonical admission replaces retired provider selection. Schema, protected synchronization RPC, analytics and profile parity remain.',
 'championship-odds':'Canonical current input load remains protected and simulation seeds/rules unchanged; obsolete provider-specific Director source strings no longer constitute required behavior.',
 'competition-derived':'Participant reads still consume prepared canonical projections without running calculators; retired Google parity diagnostics are no longer mandatory.',
 'published-odds':'Canonical publication/freshness and owner control remain; retired provider parity/source expectations removed.',
 'leaderboards-core':'Canonical main read path stays isolated. Only old Google Director parity/source assumptions change; baseline secondary-isolation assertion remains failed and separately accounted.',
 'legacy-participant':'Old QR/match-code/Passport identity cannot cross canonical participant boundary; retired Director GET is terminal, and canonical authorized routes remain separately tested.',
 'tournament-director':'Required Director capability closure belongs to the canonical implementation and integration tests. A source string test alone is not runtime proof.',
 'step11-6':'Retired Google writer/credential/ACL delivery expectations no longer describe runtime. Historical maintenance generator and executor security behavior remains unless an individual obsolete expectation is listed.',
 'war-room':'Canonical calculations/fingerprints/source admission remain; Google rollout feature literals and one-release source coupling do not.',
 'runtime-performance':'The retired workbook-cache diagnostics action is obsolete. Canonical performance is measured by the isolated score benchmark, not former workbook request counts.'
};
function reasonFor(file,name){const key=Object.keys(fileReasons).find(k=>file.includes(k));return key?fileReasons[key]:/SOURCE uses canonical authority|source|read admission/i.test(name)?'Canonical-only selectors reject unknown/retired providers and invalid resources; request, data calculation and privacy semantics remain independently asserted.':'Only reviewed obsolete provider expectations or canonical fixture/assertion contracts changed; see exact source diff and matched replacement test. Required runtime behavior is not replaced by a raw test count.'}
const deletions=actions.filter(a=>a.action==='DELETE_OBSOLETE').map(a=>({...a,why:a.why.replace(/ Replacement: canonical\/zero-Google retirement suite; historical utility tests in this file remain\./,''),oldPurpose:a.test,replacementCoverage:replacements(a),replacementStatus:'COVERAGE_MAPPING_ONLY_NOT_PASS',requiredCoveragePreserved:'The removed provider-specific operation is no longer required. The named tests cover the surviving security, canonical result, retirement denial or scope invariant; no claim that old Google delivery passed.'}));
assert.equal(deletions.length,66);
for(const item of deletions)assert.ok(!tests(read(item.file)).some(v=>v.name===item.test),'Deleted identity still declared '+item.test);
const alias=name=>actions.find(a=>a.test===name&&a.action==='REWRITE')?.replacement||manualRename[name]||name;
const reviewedChanges=changedTests.map(x=>({...x,classification:deletions.some(a=>a.file===x.file&&a.test===x.test)?'RETIRED_BEHAVIOR':x.change==='ADDED_OR_RENAMED'?'STRONGER_OR_REPLACEMENT':/Google|Passport|provider|rollback|byte|unchanged from Release/.test(x.test)?'RETIRED_BEHAVIOR_WITH_REQUIRED_INVARIANTS_RETAINED':'EQUIVALENT_CANONICAL_CONTRACT',why:actions.find(a=>a.file===x.file&&a.test===x.test)?.why||reasonFor(x.file,x.test),proofLayer:'SOURCE_REVIEW',runtimeProof:'Use executed receipt; declaration diff is not a passing test'}));
const duplicateCounts=rows=>rows.reduce((all,row)=>(all[row.name]=(all[row.name]||0)+1,all),{});
const beforeMultiplicity=duplicateCounts(priorRaw),afterMultiplicity=duplicateCounts(candidateRaw);
const phase2cMultiplicity=duplicateCounts(baselineRaw);
assert.equal(baselineRaw.length,4153);assert.equal(hash(rawText('phase2c')),baseline.rawSha256,'Phase2C raw artifact integrity');
const phase2cToRetirementInventory={before:baselineRaw.length,after:priorRaw.length,same493FileSelection:true,rawHashesVerified:true,
 renames:[
 {file:'test/mobile-v1-scoring-contracts.test.mjs',old:'successful mobile mutations reuse every existing post-commit publication worker without changing acknowledgement',new:'successful mobile mutations retain internal post-commit work with retired Google unavailable'},
 {file:'test/preview-director-entitlement.test.mjs',old:'a valid canonical Passport bootstraps only a verified Supabase account',new:'retired Passport bootstrap cannot create a canonical Director entitlement'},
 {file:'test/preview-director-entitlement.test.mjs',old:'Production uses the unchanged legacy authorization path and never reads entitlements',new:'Production without canonical admission denies before account or retired Passport transport'}],
 additions:priorRaw.filter(r=>!phase2cMultiplicity[r.name]).map(r=>r.name).filter(name=>!['successful mobile mutations retain internal post-commit work with retired Google unavailable','retired Passport bootstrap cannot create a canonical Director entitlement','Production without canonical admission denies before account or retired Passport transport'].includes(name)).map(test=>({file:'test/preview-director-entitlement.test.mjs',test,purpose:'Canonical admission/retired transport security negative',addedIn:'GOOGLE_RETIREMENT_BASE_BEFORE_CLOSURE'})),
 limitation:'Phase1/Phase2 totals are previously reported baselines. Phase2C and retirement are compared here using retained raw executed artifacts, not inferred from totals.'};
assert.equal(phase2cToRetirementInventory.additions.length,6);assert.equal(priorRaw.length,baselineRaw.length+6);
for(const r of phase2cToRetirementInventory.renames){assert.equal(phase2cMultiplicity[r.old],1);assert.equal(beforeMultiplicity[r.new],1);}
assert.deepEqual([...baseline.sourceProvenance.before.entryPoints].sort(),[...prior.sourceProvenance.before.entryPoints].sort());
const duplicateNames=[...new Set([...Object.keys(beforeMultiplicity).filter(n=>beforeMultiplicity[n]>1),...Object.keys(afterMultiplicity).filter(n=>afterMultiplicity[n]>1)])].map(name=>({name,before:beforeMultiplicity[name]||0,after:candidate?afterMultiplicity[name]||0:null}));
if(candidate){assert.equal(hash(rawText('phase2c1-closure')),candidate.rawSha256,'Candidate raw artifact integrity');assert.equal(hash(rawText('phase2c1')),prior.rawSha256,'Before raw artifact integrity');for(const d of duplicateNames)assert.equal(d.after,d.before,'Changed duplicate test multiplicity requires review: '+d.name);for(const f of manifest.failures){assert.equal(beforeMultiplicity[f.test],1,'Ambiguous original failure identity');assert.ok((afterMultiplicity[alias(f.test)]||0)<=1,'Ambiguous replacement identity');}}
const newFailures=candidate?.failures.filter(v=>!baseline.failures.some(b=>b.name===v.name))||[];
const knownFailureNames=new Set(manifest.failures.map(v=>v.test));
const unaccountedFailures=newFailures.filter(v=>!knownFailureNames.has(v.name)&&!knownFailureNames.has(Object.keys(manualRename).find(k=>manualRename[k]===v.name)));
const failureRows=manifest.failures.map(f=>{const file=f.sourceLocation.replace(/:\d+:\d+$/,''),deletion=deletions.find(d=>d.test===f.test),renamed=alias(f.test),result=candidateRaw.find(v=>v.name===renamed),review=reviewedChanges.find(v=>v.file===file&&v.test===f.test);const old=baselineRaw.find(v=>v.name===f.test)||baseline.failures.find(v=>v.name===f.test);const currentCause=result?.status==='FAIL'?normalizeDiagnostic(result.diagnostic):null;
 return {...f,sourceImpact:deletion?deletion.why:f.class==='D'?'Original capability-gap provenance is retained. Current required versus optional-maintenance classification and incomplete Preview authoring parity are recorded in CAPABILITY-GAPS.md; a passing rewritten model/source test alone cannot close the capability.':f.class==='E'?'Actual canonical read-only routing gap. Runtime admission change is blocked by approval review; test retains the missing capability as FAIL.':reasonFor(file,f.test),testAction:deletion?'DELETE_OBSOLETE':review?'REWRITE_CANONICAL_CONTRACT':f.class==='D'?'IMPLEMENT_CANONICAL_CAPABILITY_AND_RETAIN_PROOF':f.class==='E'?'RETAIN_REQUIRED_RED_PROOF':'KEEP_REQUIRED_TEST',replacementTest:deletion?null:renamed,replacementCoverage:deletion?.replacementCoverage||[{file,test:renamed}],currentResult:deletion?'REMOVED_NOT_PASS':result?.status||'NOT_EXECUTED_AT_FINAL_SOURCE',expectedResult:deletion?'Old provider/release-specific behavior is not required; replacement coverage must be checked separately.':'Canonical required behavior passes without Google; any remaining actual failure stays explicit.',baselineCauseReview:f.class!=='BASELINE'?null:deletion?'OBSOLETE_HISTORICAL_RELEASE_FREEZE':!result?'FINAL_RUN_PENDING':result.status==='PASS'?'BASELINE_NOW_PASS_REQUIRES_CAUSE_REVIEW':normalizeDiagnostic(old?.diagnostic)===currentCause?'SAME_UNDERLYING_DIAGNOSTIC':f.id==='BROAD-BASE-018'&&currentCause?.includes('ScorecardTable')?'RESTORED_ORIGINAL_FAILURE_AFTER_CANONICAL_RECORDS_ASSERTION':'DIAGNOSTIC_DIFFERENCE_REQUIRES_REVIEW',baselineDiagnostic:old?.diagnostic?.slice(0,1400),currentDiagnostic:result?.status==='FAIL'?result.diagnostic.slice(0,1400):null};});
const classes=Object.fromEntries([...new Set(failureRows.map(r=>r.class))].map(c=>[c,failureRows.filter(r=>r.class===c).length]));
assert.deepEqual(classes,{BASELINE:26,A:116,D:11,C:14,B:18,E:3});
const beforeNames=priorRaw.map(v=>v.name),afterNames=candidateRaw.map(v=>v.name);
const removed=candidate?beforeNames.filter(n=>!afterNames.includes(n)):[];
const added=candidate?afterNames.filter(n=>!beforeNames.includes(n)):[];
const renames=actions.filter(a=>a.action==='REWRITE'&&a.replacement&&a.replacement!==a.test).map(a=>({file:a.file,old:a.test,new:a.replacement}));for(const [old,n]of Object.entries(manualRename))if(!renames.some(a=>a.old===old))renames.push({old,new:n});
const unexplainedRemovals=removed.filter(n=>!deletions.some(d=>d.test===n)&&!renames.some(r=>r.old===n));
const accounting={schemaVersion:1,baseSha:base,environment:'LOCAL_NON_PRODUCTION',originalApplicationSelection:{file:'docs/reliability/phase2/evidence/application-selection.json',files:493,excluded:0},phase2cToRetirementInventory,duplicateIdentityAudit:{duplicateNames,allMultiplicitiesUnchanged:candidate?duplicateNames.every(d=>d.before===d.after):null,ambiguousFailureIdentities:0,rawHashesVerified:Boolean(candidate)},counts:{phase1:{tests:4153,pass:4127,fail:26},phase2:{tests:4153,pass:4127,fail:26},phase2c:baseline.counts,retirement:prior.counts,closure:candidate?.counts||null,deletedObsolete:deletions.length,deletedPriorBaseline:deletions.filter(d=>manifest.failures.some(f=>f.test===d.test&&f.class==='BASELINE')).length,renamedDeclarations:renames.length,observedRemovedIdentities:removed.length,observedAddedIdentities:added.length,unexplainedRemoved:unexplainedRemovals.length,unaccountedNewFailures:candidate?unaccountedFailures.length:null},candidateEvidence:candidate?{path:dir+'/evidence/application.json',rawSha256:candidate.rawSha256,sourcesStable:candidate.sourcesStable}:null,deletions,renames,sourceTestChanges:reviewedChanges,runtimeRemovedIdentities:removed,runtimeAddedIdentities:added,unexplainedRemovals,unaccountedNewFailures:unaccountedFailures,baselineReviews:failureRows.filter(f=>f.class==='BASELINE'),limitations:['Historical single-release byte freezes are removed requirements, not passing correctness tests.','Declaration counts are not executed test counts; parameterized tests and Node file-level entries are accounted using raw TAP.','Passing source inspection never substitutes for API, PostgreSQL, security, concurrency or full-sequence proof.','Original 493-file application selection is retained; new dedicated closure suites execute separately.','No test is skipped or excluded to hide an unresolved required capability.']};
const esc=s=>String(s??'—').replace(/\|/g,'&#124;').replace(/\n/g,' ');
const mdRows=(rows,cols)=>rows.map(r=>'| '+cols.map(k=>esc(typeof k==='function'?k(r):r[k])).join(' | ')+' |').join('\n');
const manifestMd='# Retirement failure manifest\n\nThe immutable starting retirement run has 188 failures: 26 existing baseline identities and 162 additional identities. Classification was completed before edits. A/B/C distinguish obsolete provider expectations, fixtures and old assertion contracts; D/E remain actual capability/routing proof work. No G/UNKNOWN classification remains.\n\n| Class | Count | Meaning |\n|---|---:|---|\n| A |116|Obsolete retired-provider expectation|\n| B |18|Fixture models the old architecture|\n| C |14|Assertion expects the old contract|\n| D |11|Required Director capability gaps|\n| E |3|Canonical routing proof gaps|\n| BASELINE |26|Individually compared with Phase 2C|\n\nEach row includes its exact identity, source, reason, source impact, test action, replacement, and observed result in [failure-manifest.json](failure-manifest.json). Deletions receive REMOVED_NOT_PASS. An absent final execution receives NOT_EXECUTED_AT_FINAL_SOURCE.\n\n| ID | Test | Class | Action | Result |\n|---|---|---|---|---|\n'+mdRows(failureRows,['id','test','class','testAction','currentResult'])+'\n';
const summary=candidate?'Observed closure: '+candidate.counts.pass+' pass / '+candidate.counts.fail+' fail / '+candidate.counts.skipped+' skipped; source stable: '+candidate.sourcesStable+'.':'Final broad execution is pending. No candidate PASS is asserted.';
const accountMd='# Test accounting\n\n'+summary+' The application selection remains the original 493 files, with zero file exclusions.\n\nPhase 1, Phase 2 and Phase 2C each reported 4,127 pass / 26 fail (4,153 total). Retirement added six identities and reported 3,971 pass / 188 fail (4,159 total). Closure intentionally changes required behavior; raw totals alone are not a certification gate.\n\n'+
'## Inventory bridge\n\n| Item | Count |\n|---|---:|\n| Retirement executed tests |4159|\n| Individually deleted obsolete expectations |'+deletions.length+'|\n| Of those, superseded baseline byte freezes |6|\n| Runtime identities removed (includes renames) |'+(candidate?removed.length:'Pending')+'|\n| Runtime identities added (includes renames/file entries) |'+(candidate?added.length:'Pending')+'|\n| Candidate executed tests |'+(candidate?candidate.counts.tests:'Pending')+'|\n| Unexplained removals |'+(candidate?unexplainedRemovals.length:'Pending')+'|\n| Unaccounted new failures |'+(candidate?unaccountedFailures.length:'Pending')+'|\n\n'+
'When a test file becomes declaration-empty, Node may emit a file-level success. That is harness bookkeeping, not replacement capability proof. Renames are paired; no removed test is credited as passing. New dedicated closure suites are listed in their separate source-bound receipts, not added to the old application count.\n\n'+
'## Historical 4,153 to 4,159 bridge\n\nBoth retained executed runs use the same493 files and both raw hashes verify. Three renamed identities cancel; six canonical Director security negative tests were added during retirement. No file-level entry explains the difference. Phase1/Phase2 totals are historical reported figures; the Phase2C-to-retirement comparison below uses raw executed identity/multiplicity evidence.\n\n| Added during retirement | Source |\n|---|---|\n'+mdRows(phase2cToRetirementInventory.additions,['test','file'])+'\n\n| Rename before closure | Replacement |\n|---|---|\n'+mdRows(phase2cToRetirementInventory.renames,['old','new'])+'\n\n## Individual deletion review\n\nEvery removed provider-specific operation is no longer required by the approved architecture. Named coverage preserves the remaining canonical/security/retirement intent; it does not certify the deleted provider implementation. Six byte freezes were limited to old individual release scopes; approved Phase 1/2/2C work supersedes those exact-byte requirements. Old evidence is preserved.\n\n| File | Old test / purpose | Why obsolete | Exact surviving coverage |\n|---|---|---|---|\n'+mdRows(deletions,['file','test','why',r=>r.replacementCoverage.map(c=>c.file+' :: '+c.test).join('; ')])+'\n\n'+
'## Baseline 26 cause review\n\n| ID | Test | Current result | Cause comparison |\n|---|---|---|---|\n'+mdRows(accounting.baselineReviews,['id','test','currentResult','baselineCauseReview'])+'\n\n'+
'## Fixture and assertion review\n\nThe machine-readable [test-accounting.json](test-accounting.json) records every changed literal test declaration, before/after hashes and source line, its reason, and whether the change removes retired behavior or retains/strengthens canonical coverage. Selector fixtures use exact isolated database/auth identity with no Google configuration; negative host/protocol/credentials/path/provider cases remain. No difficult canonical state is removed. Obsolete Google destination fields cannot confer authority. Annual target year remains distinct from current runtime year.\n\n'+
'No source declaration or test deletion establishes functional PASS. Required Director gaps, routing gaps, annual initialization, security, full sequence and Google absence each require their own runtime evidence. See [FAILURE-MANIFEST.md](FAILURE-MANIFEST.md).\n';
manifest.failures=failureRows;manifest.finalReview={candidateEvidence:accounting.candidateEvidence,unknownClassifications:0,unaccountedNewFailures:accounting.counts.unaccountedNewFailures};
for(const [p,value]of [['failure-manifest.json',manifest],['test-accounting.json',accounting]])fs.writeFileSync(path.join(root,dir,p),JSON.stringify(value,null,2)+'\n');
fs.writeFileSync(path.join(root,dir,'FAILURE-MANIFEST.md'),manifestMd);fs.writeFileSync(path.join(root,dir,'TEST-ACCOUNTING.md'),accountMd);
console.log(JSON.stringify({counts:accounting.counts,baselineReviews:accounting.baselineReviews.map(v=>({id:v.id,result:v.currentResult,cause:v.baselineCauseReview})),unexplainedRemovals,unaccountedFailures:unaccountedFailures.map(v=>v.name)},null,2));
