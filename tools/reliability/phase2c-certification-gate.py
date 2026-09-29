#!/usr/bin/env python3
"""Phase2C retained-artifact gate. No database, process, network, or provider access.

Input paths are fixed inside this repository. The only optional output is the
fixed docs/reliability/phase2c/certification-gate.json artifact. PASS is local
performance/delivery/finite evidence consistency, never overall certification,
deployment approval, an approved benchmark baseline, or Production capacity.
"""
from pathlib import Path
import json, hashlib, math, re, sys, datetime
R=Path(__file__).resolve().parents[2]
D=R/'docs/reliability/phase2c'
INPUTS={}
def read(name):
    p=Path(name)
    require(not p.is_absolute() and '..' not in p.parts,'fixed local artifact only')
    file=D/p
    raw=file.read_bytes();INPUTS[str(file.relative_to(R))]=hashlib.sha256(raw).hexdigest()
    return json.loads(raw)
# Certification generation is read-only until every prerequisite below succeeds.
# This checks retained artifact consistency. It does not execute SQL, benchmarks,
# inspect provider resources, or replace the engineering query/index plan review.
def require(condition, message):
    if not condition: raise ValueError('CERTIFICATION_PREREQUISITE: '+message)
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def count(value): return isinstance(value,int) and not isinstance(value,bool) and value>=0
def finite(value): return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>=0
def quantile(values,p): return sorted(values)[math.ceil(len(values)*p)-1]
def same_number(a,b): return finite(a) and finite(b) and math.isclose(a,b,rel_tol=1e-10,abs_tol=1e-9)
def source_path(value):
    p=Path(value)
    require(not p.is_absolute() and '..' not in p.parts,'unsafe artifact/source path')
    return R/p
MIGRATIONS={}
def migration_identity(artifact, label, candidate=True):
    require(artifact.get('baseSha')=='b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18',label+': base identity')
    m121=next(h for p,h in MIGRATIONS.items() if '202609280121_' in p)
    require(artifact.get('phase2MigrationSha256')==m121,label+': migration121 identity')
    require(re.fullmatch(r'[a-f0-9]{40}',artifact.get('executionHead','')) is not None,label+': execution SHA')
    if candidate:
        actual={v.get('path'):v.get('sha256') for v in artifact.get('candidate',{}).get('migrations',[])}
        expected={p:h for p,h in MIGRATIONS.items() if '202609280121_' not in p}
        require(actual==expected,label+': current candidate migration hashes')

CANDIDATE_DELIVERY_INDEXES={
 'scoring_authority.calcutta_v1_recalculation_jobs_delivery_terminal',
 'scoring_authority.net_skins_v1_recalculation_jobs_delivery_terminal',
 'scoring_authority.competition_recalculation_jobs_delivery_due',
 'scoring_authority.score_derived_intents_terminal_v1',
 'production_control.score_derived_delivery_attempts_work_v1'}
REMOVED_DELIVERY_INDEXES={
 'scoring_authority.calcutta_v1_recalculation_jobs_delivery_due',
 'scoring_authority.net_skins_v1_recalculation_jobs_delivery_due',
 'scoring_authority.competition_recalculation_jobs_delivery_terminal'}
PROVENANCE_CONTRACT='phase2c-source-provenance-v1'
def verify_source_provenance(value,label,entry_points=None,scope=None):
    require(isinstance(value,dict) and value.get('contract')==PROVENANCE_CONTRACT,label+': recorded dependency provenance required; no historical backfill')
    require(value.get('stable') is True and value.get('result')=='PASS',label+': dependencies changed during execution')
    before=value.get('before');after=value.get('after')
    require(isinstance(before,dict) and isinstance(after,dict),label+': before/after dependency snapshots')
    require({k:v for k,v in before.items() if k!='capturedAt'}=={k:v for k,v in after.items() if k!='capturedAt'},label+': exact stable dependency closure')
    require(before.get('contract')==PROVENANCE_CONTRACT,label+': snapshot contract')
    require(before.get('scope') in {'TEST','BENCHMARK','LOCK_BENCHMARK','BUILD','APPLICATION'},label+': execution scope')
    if scope is not None:require(before.get('scope')==scope,label+': expected scope')
    require(before.get('through') in {121,124},label+': installed migration boundary')
    roots=before.get('entryPoints');declared=before.get('declaredFiles');files=before.get('files');edges=before.get('edges')
    require(isinstance(roots,list) and all(isinstance(p,str) for p in roots) and len(set(roots))==len(roots),label+': unique direct entrypoints')
    if before['scope']!='BUILD':require(bool(roots),label+': actual executed roots required')
    if entry_points is not None:require(set(roots)==set(entry_points),label+': direct executed files match dependency roots')
    require(isinstance(declared,list) and len(set(declared))==len(declared),label+': declared fixture/data inputs')
    require({'tools/reliability/phase2c-source-provenance.mjs','package.json','package-lock.json','tools/reliability/phase2-network-deny.cjs'}<=set(declared),label+': required capture/toolchain/isolation inputs')
    if before['scope'] in {'TEST','APPLICATION','BUILD'}:
        require('tools/reliability/run-phase2c-tests.mjs' in declared,label+': actual receipt runner execution policy is a declared dependency')
    require(isinstance(files,list) and bool(files),label+': complete dependency files')
    recorded={}
    for item in files:
        require(isinstance(item,dict) and isinstance(item.get('file'),str) and re.fullmatch('[a-f0-9]{64}',item.get('sha256','')) is not None,label+': dependency hash entry')
        file=item['file'];require(file not in recorded,label+': duplicate dependency entry '+file);recorded[file]=item['sha256']
        path=source_path(file);require(path.is_file() and digest(path)==item['sha256'],label+': dependency source drift '+file)
    require(set(roots+declared)<=set(recorded),label+': roots/declared input missing from captured files')
    require(isinstance(edges,list),label+': static and declared dependency graph')
    reachable=set(roots+declared)
    for edge in edges:
        require(isinstance(edge,dict) and edge.get('from') in recorded and edge.get('to') in recorded and edge.get('kind') in {'STATIC_MODULE','LITERAL_DYNAMIC_MODULE','LOCAL_CHILD_URL','DECLARED_DYNAMIC_OR_DATA'},label+': incomplete dependency graph edge')
    while True:
        expanded=reachable|{e['to'] for e in edges if e['from'] in reachable}
        if expanded==reachable:break
        reachable=expanded
    require(reachable==set(recorded),label+': recorded files match reachable/declared dependency closure')
    expected={str(p.relative_to(R)) for p in (R/'supabase/production_migrations').glob('*.sql') if re.match(r'^\d+_.*\.sql$',p.name) and p.name<=('202609280121_\uffff' if before['through']==121 else '202609280124_\uffff')}
    require(expected<=set(recorded) and expected<=set(declared),label+': every installed historical/candidate migration is recorded')
    parser=before.get('parserManifest')
    require(isinstance(parser,list) and {v.get('path') for v in parser}=={'node_modules/next/dist/compiled/babel/parser.js','node_modules/next/dist/compiled/babel/bundle.js'},label+': locked parser identity')
    for item in parser:
        p=source_path(item['path']);require(p.is_file() and re.fullmatch('[a-f0-9]{64}',item.get('sha256','')) and digest(p)==item['sha256'],label+': parser bytes changed')
    require(isinstance(before.get('dynamicImports'),list) and isinstance(before.get('externalImports'),list),label+': computed/external imports explicitly retained')
    return recorded

def verify_receipt(name,receipt):
    require(receipt.get('sourcesStable') is True,name+': source changed while running')
    require(receipt.get('production') is False and receipt.get('environment')=='LOCAL_NON_PRODUCTION',name+': isolation')
    raw=receipt.get('rawArtifact','')
    require(Path(raw).name==raw and raw.endswith('.tap'),name+': raw artifact path')
    require(digest(D/'evidence'/raw)==receipt.get('rawSha256'),name+': raw receipt digest')
    direct=receipt.get('sources',[])
    require(isinstance(direct,list) and bool(direct),name+': recorded directly executed files')
    direct_files={}
    for item in direct:
        require(isinstance(item,dict) and isinstance(item.get('file'),str) and re.fullmatch('[a-f0-9]{64}',item.get('sha256','')) is not None,name+': direct source hash')
        file=item['file'];require(file not in direct_files,name+': duplicate direct source '+file);direct_files[file]=item['sha256']
        require(source_path(file).is_file() and digest(source_path(file))==item['sha256'],name+': directly executed source drift '+file)
    roots=[p for p in direct_files if p.startswith('test/')]
    verify_source_provenance(receipt.get('sourceProvenance'),name,roots,'BUILD' if name=='build' else 'APPLICATION' if name=='application' else 'TEST')
    if name in {'worker-history','delivery-index-review'}:
        require('test/support/reliability/phase2c-delivery-indexes.json' in receipt['sourceProvenance']['before']['declaredFiles'],name+': exact index manifest is an original declared data dependency')
    source={v['file']:v['sha256'] for v in receipt.get('implementationSourceManifest',[])}
    source.update({v['file']:v['sha256'] for v in receipt.get('sources',[])})
    for file,h in MIGRATIONS.items(): require(source.get(file)==h,name+': exact migration source '+file)
    # Dependency-aware freshness. Focused C/D/F do not execute an unrelated
    # worker JS test; requiring every global changed-file hash would invent staleness.
    focused={
      'annual':('test/reliability-phase2c-annual-workers.integration.test.mjs','test/support/reliability/phase2c-annual-workers.mjs','test/support/reliability/phase2c-annual-worker-branches.mjs'),
      'deadlock':('test/reliability-phase2c-net-skins-deadlock.integration.test.mjs',),
      'annual-admission-run':('test/reliability-phase2c-annual-admission.integration.test.mjs','test/support/reliability/phase2c-annual-history.mjs','test/support/reliability/phase2c-future-score-fixture.mjs'),
    }
    for file,h in source.items():
        if file.startswith('supabase/') or (name not in focused and file.startswith(('lib/','app/'))) or file in focused.get(name,()):
            require(source_path(file).is_file() and digest(source_path(file))==h,name+': relevant source drift '+file)
    counts=receipt.get('counts')
    if name!='build':
        require(isinstance(counts,dict) and all(count(counts.get(k)) for k in ['tests','pass','fail','skipped','cancelled']),name+': valid counts')
        require(counts['tests']==sum(counts[k] for k in ['pass','fail','skipped','cancelled']),name+': complete count totals')
        require(counts['cancelled']==0,name+': no cancelled tests')
    require(receipt.get('exitCode')==(1 if name=='application' else 0),name+': executed exit status')

def validate_summary(summary,label,samples,raw=None,p99=False):
    require(summary.get('samples')==samples,label+': sample count')
    names=['minMs','p50Ms','p95Ms','maxMs']
    require(all(finite(summary.get(k)) for k in names),label+': finite summaries')
    require(summary['minMs']<=summary['p50Ms']<=summary['p95Ms']<=summary['maxMs'],label+': ordered summaries')
    require(finite(summary.get('p99Ms')) and summary['p95Ms']<=summary['p99Ms']<=summary['maxMs'] if p99 else summary.get('p99Ms') is None,label+': p99 layer')
    if raw is not None:
        require(len(raw)==samples and all(finite(v) for v in raw),label+': finite raw samples')
        for k,p in [('p50Ms',.5),('p95Ms',.95)]+([('p99Ms',.99)] if p99 else []): require(same_number(summary[k],quantile(raw,p)),label+': raw '+k)
        require(same_number(summary['maxMs'],max(raw)) and same_number(summary['minMs'],min(raw)),label+': raw extrema')

def validate_plan(plan,label):
    require(count(plan.get('loggedStatements')) and plan['loggedStatements']>0,label+': executed statements')
    require(isinstance(plan.get('derivedRelations'),list) and all(isinstance(v,str) for v in plan['derivedRelations']),label+': relation list')
    shapes=plan.get('shapes');require(isinstance(shapes,list) and shapes,label+': nonempty shapes')
    for shape in shapes:
        require(isinstance(shape,dict),label+': plan shape object')
        for field in ['querySha256','shapeSha256']:require(re.fullmatch(r'[a-f0-9]{64}',shape.get(field,'')) is not None,label+': '+field)
        require(count(shape.get('invocations')) and shape['invocations']>0,label+': invocations')
        for field in ['durationMinMsWithPlanLogging','durationMaxMsWithPlanLogging','maximumTemporaryWrittenBlocks']:require(finite(shape.get(field)),label+': '+field)
        require(shape['durationMinMsWithPlanLogging']<=shape['durationMaxMsWithPlanLogging'],label+': duration ordering')
        ranges=shape.get('nodeMetricRanges');require(isinstance(ranges,dict) and ranges,label+': node metrics')
        for bounds in ranges.values():require(isinstance(bounds,dict) and finite(bounds.get('min')) and finite(bounds.get('max')) and bounds['min']<=bounds['max'],label+': finite ordered node metrics')
        require(isinstance(shape.get('plan'),dict) and isinstance(shape['plan'].get('Node Type'),str),label+': actual plan')
    return plan

def validate_benchmark(artifact,kind):
    label='candidate:'+kind
    require(artifact.get('result')=='PASS',label+': completed benchmark result')
    verify_source_provenance(artifact.get('sourceProvenance'),label,['tools/reliability/benchmark-phase2c.mjs'],'BENCHMARK')
    migration_identity(artifact,label)
    require(artifact.get('mode')=='candidate' and artifact.get('kind')==kind,label+': operation identity')
    require(artifact.get('production') is False and artifact.get('environment')=='LOCAL_SOCKET_ONLY_POSTGRESQL17',label+': local isolation')
    require(artifact.get('statementTimeoutMs')==1000 and artifact.get('timeZone')=='UTC',label+': finite UTC profile')
    rows=artifact.get('scales',[]);require(len(rows)==4 and {r.get('scale') for r in rows}=={1,2,5,10},label+': all four unique scales')
    variants={'none'} if kind!='eligible' else {'none','current_compatible','current_incompatible_consumed','current_incompatible_financial','stale_source','stale_result_binding','superseded_result','multiple_receipts'}
    result={}
    for scale in rows:
        branches=scale.get('branches',[]);require(len(branches)==len(variants) and {r.get('variant') for r in branches}==variants,label+': exact branch set')
        for row in branches:
            cell=f"{label}:{scale['scale']}:{row['variant']}";n=1000 if kind!='eligible' else 30
            raw=[v for b in row.get('batches',[]) for v in b.get('valuesMs',[])]
            require(len(row.get('batches',[]))>=3,cell+': repeated batches')
            validate_summary(row,cell,n,raw,p99=n>=1000)
            require(row.get('successCount')==n and row.get('failureCount')==0 and row.get('rollbackVerified') is True,cell+': semantic success/reset')
            require(row.get('statementTimeoutMs')==1000 and row['maxMs']<1000,cell+': finite SQL headroom')
            if kind=='recovery':
                state=row.get('recoveryState',{})
                require(state.get('operation')=='SCORING_LOCK' and state.get('supportedControlSucceeded') is True and state.get('beforeTiming') is True,cell+': supported Lock before recovery measurement')
                require(state.get('matchStatus')=='LIVE' and state.get('scoringLocked') is True and type(state.get('activePermissions')) is int and state['activePermissions']==0,cell+': post-revocation authority')
                require(state.get('expectedStatus')=='COMMITTED' and state.get('verifiedTimedSamples')==n,cell+': exact post-revocation COMMITTED observations')
            if kind!='eligible' or scale['scale'] in [1,10]:
                planpath=row.get('queryPlanArtifact','');require(re.fullmatch(r'evidence/[A-Za-z0-9_.-]+\.json',planpath) is not None,cell+': current plan path')
                plan=validate_plan(read(planpath),cell)
                require(isinstance(plan.get('loggedStatements'),int) and plan['loggedStatements']>0 and plan['loggedStatements']==row.get('nestedSqlExecutions'),cell+': recorded statements')
                require(isinstance(plan.get('shapes'),list) and len(plan['shapes'])>0,cell+': nonempty query plan')
                require(plan.get('derivedRelations')==row.get('derivedRelationsOnScorePath'),cell+': plan/summary identity')
                if kind=='recovery': require(plan['derivedRelations']==[],cell+': unrelated derived relation on receipt lookup')
            medians=[quantile(b['valuesMs'],.5) for b in row['batches']]
            result[(scale['scale'],row['variant'])]={**row,'batchMedianSpread':max(medians)-min(medians)}
    # Recovery has no pre-existing endpoint baseline. Its separate proposed local
    # boundedness check uses the same1ms scheduler floor /50% median /3x batchspread
    # convention as the existing score gate; it is not a Production SLO.
    if kind=='recovery':
        first=result[(1,'none')];allowance=max(1,first['p50Ms']*.5,*[3*r['batchMedianSpread'] for r in result.values()])
        for key,row in result.items():
            require(row['batchMedianSpread']<=max(1,row['p50Ms']*.5),label+': excessive repeat variance '+str(key))
            require(row['p50Ms']<=first['p50Ms']+allowance,label+': material unexplained history growth '+str(key))
    return result

def validate_pwa_final_recovery(value):
    label='PWA final-hole recovery';rows=value.get('tests',[])
    for format in ['BB','SC','SI']:
        matching=[row for row in rows if row.get('id')=='P2C-A-FINAL-'+format]
        require(len(matching)==1 and matching[0].get('result')=='PASS',label+': exact passing format '+format)
        details=matching[0].get('details',{})
        require(details.get('format')==format and details.get('holes')==18 and details.get('final') is True,label+': complete Final format '+format)
        for field in ['lostFinalHoleAcknowledgement','newScoreDenied','actualStatusHandler','postFinalizePwaWriteDenied','noRecoveryWrites']:
            require(details.get(field) is True,label+': '+field+' '+format)
        require(details.get('pwaAdapter')=='persistParticipantScore' and details.get('providerBoundary')=='INJECTED_LOCAL_SQL',label+': actual adapter/local boundary '+format)
        require(details.get('finalHoleRecovery')=='COMMITTED' and details.get('postFinalizeApiStatus')=='COMMITTED',label+': status handler COMMITTED '+format)
    return {'formats':3,'actualPwaAdapter':True,'actualStatusHandler':True,'hostedAuth':'NOT PROVEN','shippingClientConsumesRecovery':False}

def validate_sequence_interrupted_acknowledgements(value):
    label='fullsequence interrupted acknowledgements'
    rows=value.get('interruptionAcknowledgements',[])
    expected={(2,'SCORING_LOCK'),(18,'FINALIZE')}
    require(len(rows)==2 and {(r.get('hole'),r.get('nextControl')) for r in rows}==expected,label+': both exact Lock/Finalize scenarios')
    for row in rows:
        require(row.get('matchId')=='2026-R1-1' and isinstance(row.get('mutationId'),str) and re.fullmatch(r'[a-f0-9-]{36}',row['mutationId']),label+': exact canonical mutation identity')
        require(row.get('clientOutcome')=='LOST_ACK_AFTER_COMMIT' and row.get('statusResolution')=='COMMITTED' and type(row.get('canonicalReceiptCount')) is int and row['canonicalReceiptCount']==1,label+': lost client acknowledgement resolved once')
        require(finite(row.get('scoreRequestMs')) and row.get('latencyExcludesControlAndRecovery') is True,label+': measured score excludes control/recovery')
        require(row.get('controlCommittedBeforeRecovery') is True and row.get('scoringLocked') is True and type(row.get('activePermissions')) is int and row['activePermissions']==0,label+': supported revocation precedes recovery')
    require(len({r['mutationId'] for r in rows})==2,label+': distinct original hole mutations')
    return {'interruptedAcknowledgements':2,'supportedControls':['SCORING_LOCK','FINALIZE'],'proofBoundary':'LOCAL_ACTUAL_RPC_WITH_SYNTHETIC_IDENTITY'}

def validate_locks(artifact):
    require(artifact.get('result')=='PASS','locks: completed benchmark result')
    verify_source_provenance(artifact.get('sourceProvenance'),'locks',['tools/reliability/measure-phase2c-locks.mjs'],'LOCK_BENCHMARK')
    migration_identity(artifact,'candidate:locks')
    require(artifact.get('mode')=='candidate' and artifact.get('production') is False and artifact.get('environment')=='LOCAL_SOCKET_ONLY_POSTGRESQL17','locks: local identity')
    require(artifact.get('statementTimeoutMs')==1000 and artifact.get('samplesPerBranch')==100,'locks: finite profile')
    rows=artifact.get('rows',[]);expected={(s,v) for s in [1,2,5,10] for v in ['none','multiple_receipts']}
    require(len(rows)==8 and {(r.get('scale'),r.get('variant')) for r in rows}==expected,'locks: all scales/branches')
    for row in rows:
        label=f"locks:{row['scale']}:{row['variant']}"
        require(row.get('canonicalRollbackDigestVerified') is True and row.get('successCount')==100 and row.get('failureCount')==0,label+': canonical success/reset')
        for field in ['transactionWallUpperBound','databaseRpc','lockHeldThroughRpcLowerBound']:validate_summary(row[field],label+':'+field,100)
        for field in ['minMs','p50Ms','p95Ms','maxMs']:
            require(row['lockHeldThroughRpcLowerBound'][field]<=row['databaseRpc'][field]+1e-8<=row['transactionWallUpperBound'][field]+2e-8,label+': bound ordering '+field)
        require(row['databaseRpc']['maxMs']<1000,label+': observed SQL headroom')
    return sum(r['successCount'] for r in rows)

def fixture_identity(value,label,*,install_timeout_ms=1000):
    require(value.get('production') is False and value.get('statementTimeoutMs')==install_timeout_ms and value.get('timeZone')=='UTC' and value.get('environment')=='OWNED_SOCKET_ONLY_POSTGRESQL17' and value.get('baseSha')=='b1ceaa89f2d7cd0cdf2835aba04a24aca442ca18',label+': finite isolated fixture')
    actual={v.get('path'):v.get('sha256') for v in value.get('migrations',[])}
    require(actual=={p:h for p,h in MIGRATIONS.items() if '202609280121_' not in p},label+': current migrations')

def validate_delivery(value):
    # Delivery installs functions under the5s worker budget, then explicitly configures
    # score clones to1s. Installation metadata is not an operational score budget.
    fixture_identity(value['installed'],'delivery',install_timeout_ms=5000)
    require(value.get('productionQueries')==0 and value.get('networkDenied') is True and value.get('scoreTimeoutMs')==1000 and value.get('workerTimeoutMs')==5000,'delivery: isolated finite profile')
    outcomes=value.get('outcomes',[]);by={v.get('case'):v for v in outcomes}
    require(len(by)==len(outcomes) and all(v.get('pass') is True for v in outcomes),'delivery: unique passing outcomes')
    required={'121-pending-upgrade','autonomous-after-commit','crash-lease-restart','competition-claim-crash-restart','intelligence-claim-crash-restart','unknown-completion-ack','competition-completion-ack-loss','intelligence-completion-ack-loss','competition-late-writer-current-pointer','intelligence-late-writer-current-pointer','actual57014-durable-budget','all-family-requeue-delivery','terminal-compatible-activation-requeue','two-workers'}
    required.update({'service-only-chained-manifest','calcutta-failure-isolation','competition-failure-isolation','intelligence-failure-isolation','deterministic-terminal-exact-requeue','intelligence-correction-before-write','competition-before-claim','competition-before-write','intelligence-before-claim','intelligence-after-claim','intelligence-before-write','calcutta-before-claim','intelligence-sibling-no-thrash','lone-final-recovery','closed-gate-autonomous','activation-atomic-late-completion','compatible-activation-replacement'})
    required.update('receipt-'+v for v in ['none','current_compatible','current_incompatible_consumed','current_incompatible_financial','stale_source','stale_result_binding','superseded_result','multiple_receipts'])
    required.update(f+'-five-attempt-budget' for f in ['calcutta','competition','intelligence'])
    required.update(f+'-expired-live-same-source' for f in ['calcutta','competition','intelligence'])
    required.update(f+'-'+point+'-process-death' for f in ['calcutta','competition','intelligence'] for point in ['during-calculation','before-completion','after-result-write'])
    require(required<=by.keys() and len(outcomes)>=54,'delivery: every required named outcome including18/273; additional passing cases permitted')
    for family in ['calcutta','competition','intelligence']:
        row=by[family+'-expired-live-same-source']
        for field in ['clockInjectedLeaseExpiry','sourceActivationGenerationUnchanged','jobIdentitiesPreserved','claimIdentityChanged','realBackoffObservedWithoutDueTimeEdit','oldChildAliveUntilRelease','currentAndHistoryAndAuditUnchanged']:
            require(row.get(field) is True,'delivery273: '+family+':'+field)
    calculation_sources={'calcutta':('lib/production-full-net.js','calculateProductionFullNetCalcutta'),'competition':('lib/competition-derived-supabase.js','calculateCompetitionDerivedFromData'),'intelligence':('lib/intelligence-derived-supabase.js','calculateIntelligenceDerivedFromData')}
    for family in ['calcutta','competition','intelligence']:
        expected=1 if family=='calcutta' else 2
        for point in ['during-calculation','before-completion','after-result-write']:
            label='delivery18:'+family+':'+point;row=by[family+'-'+point+'-process-death']
            require(row.get('family')==family.upper() and row.get('cutpoint')==point,label+': exact family/cutpoint')
            require(row.get('actualProcessDeath')==({'code':77,'signal':None} if point=='after-result-write' else {'code':None,'signal':'SIGKILL'}),label+': actual process death')
            require(row.get('claimCommitted') is True and row.get('canonicalUnchanged') is True and row.get('parity',{}).get('exactCanonicalSource') is True,label+': durable claim/canonical/current-source parity')
            before=row.get('beforeRestart',{});after=row.get('afterRestart',{})
            for state in [before,after]:
                require(all(count(state.get(k)) for k in ['running','succeeded','newResults']),label+': measured state counts')
                entries=state.get('rows',[]);require(state['running']==sum(e.get('status')=='RUNNING' for e in entries) and state['succeeded']==sum(e.get('status')=='SUCCEEDED' for e in entries),label+': summary matches actual job states')
                require(len(entries)==expected and len({e.get('identity') for e in entries})==expected and all(isinstance(e.get('identity'),str) and e['identity'] for e in entries),label+': exact logical job identities')
            prior={e['identity']:e for e in before['rows']}
            require(before['running']+before['succeeded']==expected and all(e.get('attempt')==1 and e.get('status') in ['RUNNING','SUCCEEDED'] for e in prior.values()),label+': first durable attempt')
            require(row.get('clockInjectedLeaseExpiry') is (before['running']>0),label+': only running leases expired')
            require(after['running']==0 and after['succeeded']==expected and after['newResults']==expected,label+': exact recovery and no duplicate results')
            require({e['identity'] for e in after['rows']}==set(prior),label+': same logical jobs after restart')
            for e in after['rows']:
                p=prior[e['identity']];require(e.get('cycle') is not None and e.get('cycle')==p.get('cycle'),label+': exact delivery cycle retained')
                require(e.get('status')=='SUCCEEDED' and e.get('attempt')==(2 if p['status']=='RUNNING' else 1),label+': retry only interrupted attempt')
            event=row.get('faultEvent',{})
            if point=='after-result-write':
                require(1<=before['newResults']<=expected and before['succeeded']==before['newResults'] and event.get('type')=='injected-crash',label+': actual committed result before death')
            else:
                require(before['running']==expected and before['newResults']==0 and all(e.get('leasePresent') is True for e in before['rows']),label+': preserved precompletion leases')
                require(event.get('type')==('held-during-calculation' if point=='during-calculation' else 'held-before-write'),label+': exact live cutpoint before kill')
            if point=='during-calculation':
                file,function=calculation_sources[family]
                require(event.get('family')==family.upper() and event.get('sourceFile')==file and event.get('functionName')==function and event.get('claimCommitted') is True,label+': actual claimed calculator')
                require(event.get('originalSourceSha256')==digest(source_path(file)) and isinstance(event.get('instrumentedSourceSha256'),str) and re.fullmatch(r'[a-f0-9]{64}',event['instrumentedSourceSha256']) and event['instrumentedSourceSha256']!=event['originalSourceSha256'],label+': exact original/instrumented calculator bytes')
                require(isinstance(event.get('anchorSha256'),str) and re.fullmatch(r'[a-f0-9]{64}',event['anchorSha256']) and count(event.get('insertionAfterLine')) and event['insertionAfterLine']>0 and event.get('barrierTimeoutMs')==10000,label+': real-step bounded fault insertion')
                require(row.get('calculationInstrumentation')=='ONE_TEST_ONLY_BARRIER_AFTER_REAL_STEP_WITH_ORIGINAL_AND_INSTRUMENTED_HASHES',label+': explicit test instrumentation')
            else:require(row.get('calculationInstrumentation')=='NONE',label+': no calculator substitution')
    for family in ['calcutta','competition','intelligence']:
        row=by[family+'-five-attempt-budget'];require(row['attempts']==5 and row['immutableEvents']>=5,'delivery: durable attempts '+family)
    for name in ['competition-late-writer-current-pointer','intelligence-late-writer-current-pointer']:
        require(by[name].get('newerCurrentPointersUnchanged') is True,'delivery: stale current pointer '+name)
    return {'behavioralOutcomes':len(outcomes),'processingBudget':'5000ms per SQL statement; not total process deadline','hostedSupervisor':'NOT_PROVEN'}

def validate_worker_history(value):
    fixture_identity(value['installed'],'worker history')
    require(value.get('production') is False and value.get('declaredBranches')==32 and value.get('passedBranches')==32,'worker history: all declared branches')
    expected={(scale,variant) for scale in [1,2,5,10] for variant in ['none','current_compatible','current_incompatible_consumed','current_incompatible_financial','stale_source','stale_result_binding','superseded_result','multiple_receipts']}
    rows=value.get('rows',[]);require(len(rows)==32 and {(v.get('scale'),v.get('variant')) for v in rows}==expected,'worker history: complete scales/branches')
    for row in rows:
        require(row.get('pass') is True and row.get('workerStatementTimeoutMs')==5000 and row.get('intentsPerFamily')==8 and row.get('materialized')==16,'worker history: bounded successful families')
        for name in ['tickMs','competitionTickMs','claimMs']:
            require(len(row.get(name,[]))==3 and all(finite(x) and x<5000 for x in row[name]),'worker history: actual finite '+name)
        tx=row.get('actualAdapterFamilyTransactions',[])
        require([v.get('family') for v in tx]==['CALCUTTA','NET_SKINS','COMPETITION'] and len({v.get('operationId') for v in tx})==3 and len({v.get('cycleId') for v in tx})==1,'worker history: three distinct RPC transactions')
        plans=row.get('plans')
        # Actual harness captures nested SQL plans only at the two extreme scales.
        # Intermediate scales still require every runtime/timing/transaction assertion.
        if row['scale'] in [1,10]:
            core={'tick','competitionTick','claim'}
            extras={'finalReady','candidateIndexCounterfactual'} if row['variant']=='none' else set()
            require(isinstance(plans,dict) and set(plans)==core|extras,'worker history: exact applicable plan profile')
            for name in sorted(core):validate_plan(plans[name],'worker history:'+name)
            if row['variant']=='none':
                validate_plan(plans['finalReady'],'worker history:finalReady')
                counterfactual=plans['candidateIndexCounterfactual']
                require(isinstance(counterfactual.get('indexNames'),list) and len(counterfactual['indexNames'])==5 and set(counterfactual['indexNames'])==CANDIDATE_DELIVERY_INDEXES,'worker history: index counterfactual identity')
                for name in ['readinessWith','readinessWithout','claimWith','claimWithout','requeueWith','requeueWithout']:validate_plan(counterfactual.get(name,{}),'worker history:counterfactual:'+name)
        else:
            require('plans' in row and plans is None,'worker history: intermediate scales explicitly timing-only; no inferred plans')
    return {'branches':32,'samplesPerFamilyOperation':3,'extremeHistoryRowsWithPlans':16,'corePlanCaptures':48,'additionalPlanProfiles':2,'intermediateRowsTimingOnly':16,'planScope':'1x/10x all8 variants; final-ready/index comparisons only none1x/10x','p95':'NOT_PROVEN','p99':'NOT_PROVEN','indexQuality':'ENGINEERING_PLAN_REVIEW_REQUIRED'}

def validate_backlog(value):
    fixture_identity(value['fixture'],'backlog')
    require(value.get('result')=='PASS' and value.get('production') is False and value.get('clusterDestroyed') is True,'backlog: completed owned fixture')
    require(value['measurement']['scoreStatementTimeoutMs']==1000 and value['measurement']['workerStatementTimeoutMs']==5000,'backlog: finite budgets')
    rows=value.get('scenarios',[]);require(len(rows)==2 and {v.get('expectedDemand') for v in rows}=={18,108},'backlog: normal18/larger108')
    for row in rows:
        require(row.get('result')=='PASS' and row.get('scoreErrors')==[] and row.get('scoreTimeouts')==0,'backlog: scoring success')
        require(row['backlogBeforeStart']['pendingIntents']-row['initial']['pendingIntents']==row['expectedDemand'],'backlog: observed source demand')
        measurements=row.get('measurements',[]);require(len(measurements)==12 and all(v.get('result')=='ACCEPTED' for v in measurements),'backlog: actual continued scores')
        require(any(v.get('pendingImmediatelyBeforeScore') is True for v in measurements),'backlog: measured scoring overlaps pending demand')
        require(all(finite(v.get('dbFunctionWallMs')) and v['dbFunctionWallMs']<1000 and finite(v.get('rpcRoundTripMs')) for v in measurements),'backlog: finite database measurements')
        require(row['final']['pendingIntents']==0 and row['final']['holes']==6*(row['preloadHoles']+2) and row['final']['receipts']==row['final']['holes'],'backlog: complete current authority')
        require(row.get('noFinancialPublicationOrOwnershipChange') is True and row['canonicalCurrent'].get('exactCanonicalSource') is True,'backlog: canonical source and owner boundaries')
        resources=row['sampledResources'];require(resources['samples']>=2 and all(finite(resources.get(k)) for k in ['maxObservedConnections','maxObservedActive','maxObservedWaitingSessions','maxObservedUngrantedLocks','maxObservedBlockedSessions','maxSampleRoundTripMs','maxObservedSampleGapMs']),'backlog: measured resource snapshots')
        require(resources['exactLockDuration']=='NOT_MEASURED' and resources['cpuMemoryIo']=='UNAVAILABLE','backlog: resource inference bounds')
        worker=row['worker'];require(worker['maxMaterializedPerTick']<=24 and worker['boundedMaterializationPerTick']==24 and all(worker['processedByFamily'][f]>0 for f in ['CALCUTTA','COMPETITION','INTELLIGENCE']),'backlog: bounded actual family processing')
        require(all(finite(v) for v in worker['tickLatency']['valuesMs']) and worker['tickLatency']['valuesMs'],'backlog: actual worker timing')
        for field in ['scoreRpc','scoreDbFunction']:
            require(row[field]['samples']==12 and row[field]['p95Ms'] is None and row[field]['p99Ms'] is None,'backlog: no invented tails')
    return {'scenarios':2,'initialDemand':[18,108],'continuedCanonicalScores':24,'resources':'SAMPLED_NOT_LIFETIME_MAXIMA','providerCapacity':'NOT_PROVEN'}

def validate_finite(value):
    fixture_identity(value['fixture'],'finite')
    require(value.get('production') is False and value.get('normalScoreTimeoutMs')==1000 and value.get('normalWorkerTimeoutMs')==5000 and value.get('tightTimeoutMs')==25,'finite: exact profiles')
    rows=value.get('rows',[]);by={v.get('id'):v for v in rows};expected={'P2C-TIME-001','P2C-TIME-hole_scores','P2C-TIME-score_mutations','P2C-TIME-score_derived_intents_v1','P2C-TIME-LOCK','P2C-TIME-RECOVERY'}
    require(len(rows)==6 and set(by)==expected and all(v.get('result')=='PASS' for v in rows),'finite: exact passing fault cases')
    require({v['round'] for v in by['P2C-TIME-001']['details']['outcomes'] if v['code']=='ACCEPTED'}=={1,2,3},'finite: all formats')
    for name in ['hole_scores','score_mutations','score_derived_intents_v1']:
        row=by['P2C-TIME-'+name]['details'];require(row['sqlstate']=='57014' and row['partialState'] is False and row['readAfterRollback']=='UNKNOWN' and row['sameMutationRetry']=='ACCEPTED','finite: atomic timeout '+name)
    require(by['P2C-TIME-LOCK']['details'].get('canonical')=='UNCHANGED_UNTIL_SAFE_SAME_MUTATION_RETRY','finite: lock retry authority')
    row=by['P2C-TIME-RECOVERY']['details'];require(row['afterRelease']=='COMMITTED' and row['newWritePermission'] is False and row['receiptPreserved'] is True,'finite: post-revocation owned recovery')
    return {'faultCases':6,'normalScoreMs':1000,'workerMs':5000,'injectedMs':25,'productionHeadroom':'NOT_PROVEN'}

def validate_calcutta_lock(run,value):
    fixture_identity(value['installed'],'Calcutta current/job lock')
    require(value.get('issue')=='P2C-NEW-CALCUTTA-CURRENT-JOB-LOCK','Calcutta lock: issue identity')
    wrapped=run.get('sourcesStable') is not None
    if wrapped:verify_receipt('calcutta-lock-order',run)
    require(run.get('result')=='PASS' and run.get('production') is False and value.get('production') is False and (wrapped or run.get('clusterDestroyed') is True),'Calcutta lock: local completed proof')
    require(wrapped or (run.get('environment')=='OWNED_SOCKET_ONLY_POSTGRESQL17' and run.get('scoreTimeoutMs')==1000 and run.get('workerTimeoutMs')==5000),'Calcutta lock: finite profile')
    counts=run.get('counts',{});require(all(count(counts.get(k)) for k in ['tests','pass','fail','skipped','cancelled']) and counts['tests']==counts['pass'] and counts['pass']>=10 and counts['fail']==counts['skipped']==counts['cancelled']==0,'Calcutta lock: executed counts')
    if not wrapped:
        require(run.get('sourceCapture')=='POST_RUN_HASH; this direct diagnostic run is not the full root wrapper snapshot','Calcutta lock: exact source provenance')
        for source in run.get('sources',[]):require(digest(source_path(source['path']))==source['sha256'],'Calcutta lock: current source '+source['path'])
        expected_paths={'supabase/production_migrations/202609280124_score_derived_delivery_v1.sql','test/reliability-phase2c-calcutta-lock-order.test.mjs','lib/score-derived-worker.js','lib/score-derived-delivery.js'}
        require({v.get('path') for v in run.get('sources',[])}==expected_paths,'Calcutta lock: source capture completeness')
        raw=D/'evidence/calcutta-current-job-lock-after.tap';content=raw.read_text();INPUTS[str(raw.relative_to(R))]=digest(raw)
        for name in ['tests','pass','fail','skipped','cancelled']:
            found=re.search(r'^# '+name+r' (\d+)$',content,re.M);require(found is not None and int(found.group(1))==counts[name],'Calcutta lock: raw count '+name)
    require(value.get('proof')=='ACTUAL_RPC_RECIPROCAL_LOCK_GRAPH','Calcutta lock: actual proof layer')
    rows=value.get('tests',[]);pairs={(v.get('operation'),v.get('order')):v for v in rows if 'operation' in v}
    require(set(pairs)=={(op,order) for op in ['claim','complete','fail'] for order in ['before','after']},'Calcutta lock: all before/after operations')
    for op in ['claim','complete','fail']:
        before=pairs[(op,'before')];after=pairs[(op,'after')]
        require(before.get('expectedCounterexample') is True and before['finalize']['ok'] is False and 'statement timeout' in before['finalize']['error'] and before.get('workerSucceededAfterRollback') is True,'Calcutta lock: retained '+op+' counterexample')
        graph=before.get('reciprocal',[]);edges={v['pid']:set(v['blockedBy']) for v in graph}
        require(any(a in edges.get(b,set()) for a,blocked in edges.items() for b in blocked),'Calcutta lock: actual reciprocal wait '+op)
        require(after.get('worker') is True and after.get('finalize') is True and after.get('scoreTimeoutMs')==1000 and after.get('workerTimeoutMs')==5000,'Calcutta lock: repaired '+op)
    cases={v.get('case'):v for v in rows if 'case' in v}
    intent=cases.get('held-intent-claim',{});require(intent.get('pass') is True and intent.get('claimCommittedBeforeMaterializerReleased') is True and intent.get('currentSourceReplacement') is True,'Calcutta lock: no intent/current inversion')
    stale=cases.get('stale-lease-after-finalize',{});require(stale.get('pass') is True and str(stale.get('denial','')).startswith('42501 ') and stale.get('replacementAndResultAndAuditUnchanged') is True,'Calcutta lock: stale lease preserves replacement')
    sources=value.get('workerSources',[]);expected={'claim_production_calcutta_v1_recalculation(jsonb)','complete_production_calcutta_v1_recalculation(jsonb)','fail_production_calcutta_v1_recalculation(jsonb)','future_production_claim_calcutta_recalculation_v1(jsonb)','future_production_complete_calcutta_recalculation_v1(jsonb)','future_production_fail_calcutta_recalculation_v1(jsonb)'}
    require(len(sources)==6 and {v.get('signature') for v in sources}==expected,'Calcutta lock: six installed function identities')
    for source in sources:
        require(re.fullmatch(r'[a-f0-9]{64}',source.get('hash','')) is not None and source.get('definer') is True and isinstance(source.get('configuration'),list) and source['configuration'],'Calcutta lock: installed function attributes')
        require(isinstance(source.get('acl'),list) and source['acl'] and not any(v.startswith(('=','anon=','authenticated=')) for v in source['acl']),'Calcutta lock: no public end-user execute')
    return {'nodeTests':counts['tests'],'beforeAfterRpcPairs':3,'retainedRealWaitCycles':3,'heldIntentAndStaleLease':True,'sourceCapture':'PRE_POST_SOURCE_STABLE_WRAPPER' if wrapped else 'POST_RUN_HASH; full sequence separately source-stable','universalDeadlockFreedom':'NOT_PROVEN'}

def validate_backlog_tail(value):
    fixture_identity(value['fixture'],'backlog tails')
    require(value.get('id')=='P2C-B-BACKLOG-TAIL' and value.get('result')=='PASS' and value.get('production') is False and value.get('clusterDestroyed') is True,'backlog tails: completed local proof')
    method=value.get('method',{})
    expected={'targetQualifiedSamplesPerProfile':1000,'maximumBurstsPerProfile':100,'groups':6,'measuredHolesPerGroup':6,'workerIntervalMs':250,'scoreStatementTimeoutMs':1000,'workerStatementTimeoutMs':5000}
    require(all(method.get(k)==v for k,v in expected.items()),'backlog tails: explicit qualified profile')
    rows=value.get('profiles',[]);require(len(rows)==2 and {(v.get('name'),v.get('preloadHoles'),v.get('expectedDemand')) for v in rows}=={('normal_preload_one_hole',1,18),('larger_preload_six_holes',6,108)},'backlog tails: two separate profiles')
    results=[]
    for row in rows:
        require(row.get('result')=='PASS' and row.get('scoreFailures')==0,'backlog tails: no score errors')
        qualified=row.get('qualified',[]);other=row.get('nonqualifying',[]);n=len(qualified)
        require(n>=1000 and row.get('totalAccepted')==n+len(other),'backlog tails: enough real accepted samples')
        require(all(v.get('pendingAutomaticBeforeScore') is True for v in qualified) and all(v.get('pendingAutomaticBeforeScore') is False for v in other),'backlog tails: qualification not fabricated')
        observations=qualified+other
        require(len({v.get('mutation') for v in observations})==len(observations),'backlog tails: distinct mutations')
        require(len({(v.get('repetition'),v.get('match'),v.get('hole')) for v in observations})==len(observations),'backlog tails: first-entry unique holes')
        for sample in observations:
            require(sample.get('result')=='ACCEPTED' and all(finite(sample.get(k)) for k in ['lockHeldThroughRpcMs','dbFunctionWallMs','transactionWallUpperMs']),'backlog tails: actual finite accepted observations')
            require(0<sample['lockHeldThroughRpcMs']<=sample['dbFunctionWallMs']+.1<=sample['transactionWallUpperMs']+.2 and sample['dbFunctionWallMs']<1000,'backlog tails: lock brackets and local headroom')
        for key in ['lockHeldThroughRpcMs','dbFunctionWallMs','transactionWallUpperMs']:
            values=[v[key] for v in qualified];summary=row[key]
            require(summary.get('tailStatus')=='EMPIRICAL_1000_PLUS' and summary.get('valuesMs')==values,'backlog tails: raw summary association '+key)
            validate_summary({**summary,'minMs':min(values)},'backlog tails:'+key,n,values,p99=True)
        bursts=row.get('bursts',[]);require(1<=len(bursts)<=100,'backlog tails: bounded repetitions')
        require({v.get('repetition') for v in bursts}==set(range(len(bursts))),'backlog tails: deterministic repetitions')
        flat=[];worker_errors={};resource_samples=0
        for burst in bursts:
            require(burst.get('result')=='PASS' and burst.get('cloneRemoved') is True and burst.get('financialUnchanged') is True,'backlog tails: isolated reset and owner facts')
            require(burst['initialBacklog']['pendingIntents']==row['expectedDemand'],'backlog tails: observed starting demand')
            measured=burst.get('measurements',[]);require(len(measured)==36 and all(v['repetition']==burst['repetition'] for v in measured),'backlog tails: six groups by six holes')
            require({(v['match'],v['hole']) for v in measured}=={(f'2026-R1-{m}',h) for m in range(1,7) for h in range(row['preloadHoles']+1,row['preloadHoles']+7)},'backlog tails: ordinaryBB first-entry cells')
            flat.extend(measured)
            idle=burst['freshIdle'];require(idle.get('type')=='tick' and idle.get('materialized')==idle.get('terminal')==idle.get('blockedAutomatic')==idle.get('pendingAutomatic')==idle.get('activeLeases')==0 and idle.get('statusIncomplete') is False and isinstance(idle.get('ready'),dict) and idle['ready'] and all(v is False for v in idle['ready'].values()),'backlog tails: fresh idle no stranded work')
            require(burst['current'].get('exactCanonicalSource') is True and burst['final']['pendingIntents']==0 and burst['final']['holes']==6*(row['preloadHoles']+6) and burst['final']['receipts']==burst['final']['holes'],'backlog tails: complete current authority')
            samples=burst.get('resourceSamples',[]);require(samples and any(v.get('workerConnections',0)>0 for v in samples),'backlog tails: observed worker overlap')
            for sample in samples:require(all(count(sample.get(k)) for k in ['connections','active','idleInTransaction','lockWaitingSessions','workerConnections','scoreConnections','ungrantedLocks','blockedSessions']),'backlog tails: finite observed resource counts')
            resource_samples+=len(samples)
            events=burst.get('workerEvents',[]);require(events and not any(v.get('type') in ['halted','startup-failed'] for v in events),'backlog tails: no unrecovered worker stop')
            for event in events:
                if event.get('type')=='failed':
                    code=event.get('sqlstate') or event.get('code') or 'UNCLASSIFIED';worker_errors[code]=worker_errors.get(code,0)+1
        require(sorted(json.dumps(v,sort_keys=True) for v in flat)==sorted(json.dumps(v,sort_keys=True) for v in observations),'backlog tails: all samples retained exactly once')
        results.append({'profile':row['name'],'qualifiedSamples':n,'nonqualifyingSamples':len(other),'bursts':len(bursts),'resourceSamples':resource_samples,'observedWorkerFailures':worker_errors,'scoreP99Ms':row['transactionWallUpperMs']['p99Ms'],'lockLowerP99Ms':row['lockHeldThroughRpcMs']['p99Ms'],'lockUpperP99Ms':row['transactionWallUpperMs']['p99Ms']})
    return {'profiles':results,'method':'Repeated identical localBB bursts; ordinary accepted score only; pendingautomatic demand observed immediately beforeRPC','statisticalLimit':'Empirical1000plus samples perprofile, no confidence interval orProductionSLO','lockDuration':'Lower/upper bounds, notexactCOMMITtimestamp'}

def valid_wait_graph(value):
    return isinstance(value,list) and bool(value) and all(isinstance(v,dict) and count(v.get('pid')) and v['pid']>0 and isinstance(v.get('blockedBy'),list) and all(count(p) and p>0 for p in v['blockedBy']) for v in value) and any(v['blockedBy'] for v in value)

def actual_plan_nodes(node,label):
    require(isinstance(node,dict) and isinstance(node.get('Node Type'),str) and bool(node['Node Type']),label+': actual plan node')
    require(finite(node.get('Actual Rows')) and finite(node.get('Actual Loops')),label+': actual row/loop observations')
    for key in ['Rows Removed by Filter','Shared Hit Blocks','Shared Read Blocks','Actual Total Time','Total Cost']:
        if key in node:require(finite(node[key]),label+': finite '+key)
    children=node.get('Plans',[]);require(isinstance(children,list),label+': child plans')
    return [node]+[v for child in children for v in actual_plan_nodes(child,label)]

def validate_delivery_index_review(run,value):
    verify_receipt('delivery-index-review',run)
    require(run.get('result')=='PASS' and run['counts']['pass']>=23 and run['counts']['fail']==run['counts']['skipped']==0,'delivery indexes: complete executed suite')
    require(value.get('schemaVersion')==1 and value.get('result')=='PASS' and value.get('production') is False and value.get('environment')=='OWNED_LOCAL_SOCKET_POSTGRESQL17' and value.get('clusterDestroyed') is True,'delivery indexes: completed isolated proof')
    fixture_identity(value.get('installed',{}),'delivery indexes')
    manifest=value.get('indexManifest',{});require(manifest.get('schemaVersion')==1,'delivery indexes: index manifest version')
    for field,expected in [('retainedNonuniqueIndexes',CANDIDATE_DELIVERY_INDEXES),('removedOptionalIndexes',REMOVED_DELIVERY_INDEXES)]:
        indexes=manifest.get(field,[]);require(isinstance(indexes,list) and len(indexes)==len(expected) and set(indexes)==expected,'delivery indexes: exact fully qualified '+field)
    definitions=manifest.get('historicalReferenceDefinitions',{});require(set(definitions)==REMOVED_DELIVERY_INDEXES and all(isinstance(v,str) and v.startswith('CREATE INDEX ') for v in definitions.values()),'delivery indexes: historical comparison definitions')
    require(manifest==json.loads(source_path('test/support/reliability/phase2c-delivery-indexes.json').read_text()),'delivery indexes: actual captured index manifest')
    specs={
      'CALCUTTA_DUE':('scoring_authority.calcutta_v1_recalculation_jobs_delivery_due',1),
      'CALCUTTA_DELAYED':('scoring_authority.calcutta_v1_recalculation_jobs_delivery_due',0),
      'NET_SKINS_DUE':('scoring_authority.net_skins_v1_recalculation_jobs_delivery_due',1),
      'NET_SKINS_DELAYED':('scoring_authority.net_skins_v1_recalculation_jobs_delivery_due',0),
      'COMPETITION_DUE':('scoring_authority.competition_recalculation_jobs_delivery_due',1),
      'COMPETITION_DELAYED':('scoring_authority.competition_recalculation_jobs_delivery_due',1),
      'COMPETITION_TERMINAL_COUNT_DUE':('scoring_authority.competition_recalculation_jobs_delivery_terminal',0),
      'COMPETITION_TERMINAL_COUNT_TERMINAL':('scoring_authority.competition_recalculation_jobs_delivery_terminal',5),
      **{f'INTENT_BACKLOG_864_DEAD_{n}':('scoring_authority.score_derived_intents_terminal_v1',n) for n in [0,1,101]}}
    scales=value.get('scales',[]);require(len(scales)==2 and {r.get('scale') for r in scales}=={1,10},'delivery indexes: exact1x/10x scales')
    for scale in scales:
        label='delivery indexes:'+str(scale['scale']);identity=scale.get('identity',{})
        require(identity.get('socketOnly') is True and identity.get('seqscan')=='on' and isinstance(identity.get('database'),str) and bool(identity['database']) and re.match(r'^17(?:\.|$)',identity.get('version','')) is not None,label+': default planner isolated PostgreSQL17')
        limits=scale.get('currentActiveLimits',{});require(limits.get('calcutta')==1 and count(limits.get('netSkinsRounds')) and 1<=limits['netSkinsRounds']<=3 and limits.get('competitionMarkers')==5,label+': realistic current financial cardinalities')
        hashes=scale.get('sourceHashes',{});require(set(hashes)=={'calcutta','netSkins','deliveryTick'} and all(re.fullmatch(r'[a-f0-9]{64}',v or '') is not None for v in hashes.values()),label+': actual installed selector hashes')
        cases=scale.get('cases',[]);require(len(cases)==len(specs) and {r.get('name') for r in cases}==set(specs),label+': all11 exact counterfactual cases')
        for row in cases:
            case=label+':'+row['name'];index,expected=specs[row['name']]
            require(row.get('index')==index and row.get('expected')==expected and row.get('candidateInstalled') is (index in CANDIDATE_DELIVERY_INDEXES),case+': actual candidate presence and expected rows')
            require(row.get('result')=='PASS' and row.get('rollbackVerified') is True and isinstance(row.get('query'),str) and row['query'].lower().startswith('select ') and isinstance(row.get('indexDefinition'),str) and row['indexDefinition'].startswith('CREATE INDEX '),case+': actual selector and rollback')
            for variant in ['withIndex','withoutIndex']:
                result=row.get(variant,{});require(result.get('rows')==expected and isinstance(result.get('ids'),list) and len(result['ids'])==expected and all(isinstance(v,str) for v in result['ids']),case+': exact '+variant+' result')
                plan=result.get('plan',{});nodes=actual_plan_nodes(plan.get('Plan'),case+':'+variant)
                require(finite(plan.get('Execution Time')),case+': finite measured plan')
                stats=result.get('summary',{});require(stats.get('indexes')==[n['Index Name'] for n in nodes if n.get('Index Name')] and stats.get('nodes')==[n['Node Type'] for n in nodes],case+': actual plan summary identity')
                removed=sum(n.get('Rows Removed by Filter',0)*(n.get('Actual Loops',0) or 1) for n in nodes)
                for field,number in [('rowsRemoved',removed),('rootHits',plan['Plan'].get('Shared Hit Blocks')),('rootReads',plan['Plan'].get('Shared Read Blocks')),('executionMs',plan['Execution Time'])]:
                    require(same_number(stats.get(field),number),case+': measured '+field)
            require(sorted(row['withIndex']['ids'])==sorted(row['withoutIndex']['ids']),case+': semantic equality under index counterfactual')
            if row['name'] in ['COMPETITION_DUE','COMPETITION_DELAYED']:
                require(row['withIndex']['ids']==['true' if row['name']=='COMPETITION_DUE' else 'false'],case+': actual EXISTS meaning')
            if row['name'].startswith('INTENT_BACKLOG_864_'):
                yes=row['withIndex']['summary'];no=row['withoutIndex']['summary']
                require('score_derived_intents_terminal_v1' in yes['indexes'] and yes['rowsRemoved']==0 and no['rowsRemoved']>=763 and yes['rootHits']<no['rootHits'],case+': measured dense-backlog terminal predicate benefit')
    return {'nodeTests':run['counts']['tests'],'exactRetainedIndexes':sorted(CANDIDATE_DELIVERY_INDEXES),'removedOptionalIndexes':sorted(REMOVED_DELIVERY_INDEXES),'counterfactualCases':22,'defaultPlanner':True,'scope':'Actual extracted selector plans and semantic equality; not full RPC throughput, capacity, or write-amplification proof','indexApproval':'SEPARATE_ENGINEERING_REVIEW_REQUIRED'}

def validate_net_owner_lock(run,value):
    verify_receipt('net-owner-lock-order',run)
    require(run.get('result')=='PASS' and run['counts']['pass']>=20 and run['counts']['fail']==run['counts']['skipped']==0,'NetSkins owner lock: complete executed suite')
    fixture_identity(value['installed'],'NetSkins owner lock')
    require(value.get('issue')=='P2C-NEW-NETSKINS-OWNER-CONTROL-LOCK' and value.get('production') is False,'NetSkins owner lock: issue/local identity')
    rows=value.get('tests',[]);require(all(v.get('pass') is True for v in rows),'NetSkins owner lock: passing assertions')
    schedules=[v for v in rows if 'marker' in v]
    expected={(marker,control,order) for marker in ['present','absent'] for control in ['FINALIZE','SCORING_LOCK'] for order in ['before','after']}
    require(len(schedules)==8 and {(v.get('marker'),v.get('controlKind'),v.get('order')) for v in schedules}==expected,'NetSkins owner lock: complete8state/control/order matrix')
    for row in schedules:
        require(row.get('semanticParityWithUnchangedSerial') is True and row.get('controlBudgetMs')==1000 and row.get('ownerBudgetMs')==5000,'NetSkins owner lock: serial financial parity/finite profile')
        require(isinstance(row.get('oneWay'),list) and row['oneWay'],'NetSkins owner lock: actual contention graph')
        if row['order']=='before':
            require(row.get('expectedCounterexample') is True,'NetSkins owner lock: retained prior failure')
            graph=row.get('reciprocal',[]);edges={v['pid']:set(v['blockedBy']) for v in graph}
            require(any(a in edges.get(b,set()) for a,blocked in edges.items() for b in blocked),'NetSkins owner lock: actual reciprocal waits')
        else:require(row.get('expectedCounterexample') is False and row.get('reciprocal') is None,'NetSkins owner lock: repaired one-way schedule')
    cases={v.get('case'):v for v in rows if 'case' in v}
    required={'absent-marker-rejected-lease','absent-marker-rejected-source','two-rounds-absent-marker','manifest-security'}
    require(required<=cases.keys(),'NetSkins owner lock: exact rejection/parallel/security coverage')
    for name in ['absent-marker-rejected-lease','absent-marker-rejected-source']:require(cases[name].get('allRowsReceiptsAuditUnchanged') is True,'NetSkins owner lock: complete rejected-call rollback')
    require(cases['two-rounds-absent-marker'].get('serialFinancialAndDemandParity') is True and cases['two-rounds-absent-marker'].get('wait'),'NetSkins owner lock: two-round financial/demand parity')
    require(cases['manifest-security'].get('futureCoverage')=='ACTUAL_COMPLETION_WITH_EXPLICIT_OUTER_CERTIFICATION_SEAM','NetSkins owner lock: explicit future proof boundary')
    required_future={'future2099-present','future2099-absent','future2099-rejected-lease','future2099-rejected-source','future2099-rejected-job-generation','future2099-prefix-before-config-job','absent-marker-current-round-max-history-plan'}
    require(required_future<=cases.keys() and len(cases)==len([v for v in rows if 'case' in v]),'NetSkins owner lock: all unique future runtime and history cases')
    generations=set()
    for name in ['future2099-present','future2099-absent']:
        row=cases[name]
        for field in ['actualFutureClaimAndComplete','actualSharedHelper','unchangedFullNetCalculator','financialAndDemandCycleParity','receiptReplayWithoutFootprint']:
            require(row.get(field) is True,'NetSkins owner lock: actual future completion '+field)
        generation=row.get('generation','');require(re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}',generation) is not None,'NetSkins owner lock: future generation')
        generations.add(generation)
        require('outer annual certification substituted' in row.get('boundary','') and 'original Net resource/generation guards retained' in row['boundary'],'NetSkins owner lock: no unsupported full annual-admission claim')
    require(len(generations)==1,'NetSkins owner lock: consistent synthetic annual generation')
    for failure in ['lease','source','job-generation']:
        row=cases['future2099-rejected-'+failure]
        require(row.get('absentMarkerAndAllRowsUnchanged') is True and row.get('actualFutureCompletionGuard') is True,'NetSkins owner lock: future rejected completion rolls back')
        require(row.get('generationNegativeFixtureFkBypass') is (failure=='job-generation'),'NetSkins owner lock: generation negative fixture boundary')
    row=cases['future2099-prefix-before-config-job']
    require(row.get('configAndJobNowaitSucceededWhileCompletionBlocked') is True and valid_wait_graph(row.get('waiting')),'NetSkins owner lock: actual future prefix lock and free downstream locks')
    history=cases['absent-marker-current-round-max-history-plan'];observations=history.get('observations',[])
    require(len(observations)==2 and {v.get('historyCount') for v in observations}=={1000,10000},'NetSkins owner lock: both irrelevant-history sizes')
    for row in observations:
        require(row.get('currentRoundResultRows')==1 and row.get('otherRoundNoncurrentRows')==row['historyCount'] and row.get('planner')=='DEFAULT_NO_PLANNER_OVERRIDE','NetSkins owner lock: actual current/irrelevant history fixture')
        require(all(row.get(field) is True for field in ['actualCompletionOk','currentFinancialRowsUnchanged','allCheckUniqueFkConstraintsActive','rollbackVerified']),'NetSkins owner lock: current authority and constraints preserved')
        plans=row.get('actualHelperMaxPlans',[]);require(len(plans)==1,'NetSkins owner lock: actual helper MAX executes exactly once')
        plan=plans[0];require(re.fullmatch(r'[a-f0-9]{64}',plan.get('querySha256','')) is not None and finite(plan.get('instrumentedDurationMs')),'NetSkins owner lock: actual query/measurement')
        nodes=actual_plan_nodes(plan.get('plan'),'NetSkins owner lock: MAX')
        scans=[n for n in nodes if n.get('Relation Name')=='net_skins_v1_result_revisions']
        require(len(scans)==1 and scans[0]['Node Type'].startswith('Index') and isinstance(scans[0].get('Index Name'),str) and scans[0]['Index Name'] and scans[0]['Actual Rows']+scans[0].get('Rows Removed by Filter',0)<=1,'NetSkins owner lock: bounded indexed current-round MAX')
    require(isinstance(history.get('limitations'),list) and any('Current-round revision growth is not measured' in v for v in history['limitations']),'NetSkins owner lock: irrelevant-history proof scope retained')
    sources=value.get('sources',[]);expected_signatures={'complete_production_net_skins_v1_recalculation(jsonb)','future_production_complete_net_skins_recalculation_v1(jsonb)'}
    require(len(sources)==2 and {v.get('signature') for v in sources}==expected_signatures,'NetSkins owner lock: both installed completion identities')
    for source in sources:
        require(re.fullmatch(r'[a-f0-9]{64}',source.get('hash','')) is not None and source.get('definer') is True and re.fullmatch(r'[1-9][0-9]*',str(source.get('owner',''))) is not None and int(source['owner'])<=4294967295,'NetSkins owner lock: installed function owner/hash/definer')
        require(isinstance(source.get('configuration'),list) and source['configuration'] and isinstance(source.get('acl'),list) and source['acl'] and not any(v.startswith(('=','anon=','authenticated=')) for v in source['acl']),'NetSkins owner lock: actual function privileges/configuration')
    return {'nodeTests':run['counts']['tests'],'beforeAfterSchedules':8,'rejectionRollbacks':2,'twoRoundSerialParity':True,'futureFunctionRuntime':'ACTUAL_CLAIM_CALCULATOR_COMPLETION_WITH_OUTER_CERTIFICATION_SEAM','futurePrefixLock':'ACTUAL_WAIT_AND_DOWNSTREAM_NOWAIT_PROBES','futureFunctionConcurrency':'Full future Director Lock/Finalize schedule NOT_PROVEN; protected annual admission is separate','irrelevantHistoryMaxPlans':[1000,10000],'financialPublication':'NOT_AUTOMATED'}

def validate_worker_failure_lock(run,value):
    label='worker expiry/bundle locks'
    verify_receipt('worker-failure-lock-order',run)
    require(run.get('result')=='PASS' and run['counts']['pass']>=16 and run['counts']['fail']==run['counts']['skipped']==0,label+': complete executed16-case suite')
    require(value.get('schemaVersion')==1 and value.get('environment')=='OWNED_LOCAL_SOCKET_ONLY_POSTGRESQL17' and value.get('production') is False and value.get('clusterDestroyed') is True,label+': completed isolated proof')
    fixture_identity(value.get('installed',{}),label)
    oldpath='docs/reliability/phase2c/evidence/worker-failure-lock-before-9bd77498/phase2c-worker-failure-before-definitions.json'
    require(oldpath in run['sourceProvenance']['before']['declaredFiles'],label+': original historical body is a captured runtime input')
    require(digest(source_path(oldpath))==value.get('beforeDefinitionSHA256'),label+': immutable captured historical definitions')
    old=json.loads(source_path(oldpath).read_text());catalog={v['signature']:v for v in old.get('functions',[])}
    functions={'expiry-update':'score_derived_delivery_tick_v1','bundle-failure':'fail_intelligence_derived_bundle_v1','preclaim-skip-locked':'fail_score_derived_preclaim_v1','future-expiry':'future_production_claim_competition_derived_jobs_v1','future-intelligence':'future_production_claim_intelligence_derived_bundle_v1'}
    required_signatures={fn+'(jsonb)' for fn in functions.values()}
    require(required_signatures<=set(catalog),label+': historical catalog includes all5worker bodies; controls/trigger retained separately')
    scopes={(scenario,control,order) for scenario in ['expiry-update','bundle-failure'] for control in ['SCORING_LOCK','FINALIZE'] for order in ['before','after']}
    scopes|={('preclaim-skip-locked',control,'after') for control in ['SCORING_LOCK','FINALIZE']}
    scopes|={(scenario,'INSTALLED_MATCH_CONTROL_TRIGGER',order) for scenario in ['future-expiry','future-intelligence'] for order in ['before','after']}
    rows=value.get('tests',[]);require(len(rows)==14 and {(v.get('scenario'),v.get('control'),v.get('order')) for v in rows}==scopes,label+': exact14 schedules, not count-only coverage')
    hashes={}
    for row in rows:
        scenario=row['scenario'];fn=functions[scenario];key=(scenario,row['order'])
        require(row.get('function')==fn and re.fullmatch(r'[a-f0-9]{64}',row.get('functionSHA256','')) is not None,label+': exact runtime function identity')
        require(row.get('tournamentId')==('2099' if scenario.startswith('future-') else '2026'),label+': frozen versus future fixture')
        require(row.get('pass') is True and row.get('controlBudgetMs')==1000 and row.get('workerBudgetMs')==5000 and row.get('canonicalHolesUnchanged')==18,label+': finite score/control authority preserved')
        require(valid_wait_graph(row.get('oneWay')),label+': actual one-way contention observed')
        if scenario=='future-intelligence':require(row.get('workerManualPrelock') is False,label+': full future claim executes its own locks')
        outcomes=row.get('results',{});worker=outcomes.get('worker',{});control=outcomes.get('control',{})
        require(worker.get('ok') is True and worker.get('value',{}).get('ok') is True,label+': worker completed actual operation')
        previous=hashes.setdefault(key,row['functionSHA256']);require(previous==row['functionSHA256'],label+': stable function across control schedules')
        original=catalog[fn+'(jsonb)']['sha256']
        if row['order']=='before':
            require(row['functionSHA256']==original and row.get('expectedCounterexample') is True and row.get('sameControlRetry') is True,label+': exact old function and safe same-control retry')
            require(control.get('ok') is False and 'statement timeout' in control.get('error',''),label+': retained actual old control timeout')
            graph=row.get('reciprocal');require(valid_wait_graph(graph),label+': actual reciprocal graph')
            edges={v['pid']:set(v['blockedBy']) for v in graph};require(any(a in edges.get(b,set()) for a,blocked in edges.items() for b in blocked),label+': real reciprocal lock edges')
        else:
            require(row.get('expectedCounterexample') is False and row.get('reciprocal') is None and control.get('ok') is True and control.get('value',{}).get('ok') is True,label+': repaired worker and control both commit')
            if scenario=='preclaim-skip-locked':
                require(row['functionSHA256']==original and worker['value'].get('marked')==1,label+': unchanged SKIP LOCKED counterevidence')
            else:require(row['functionSHA256']!=original,label+': corrected function actually installed')
    attributes=value.get('attributes',[]);require(len(attributes)==5 and {v.get('signature') for v in attributes}==required_signatures,label+': all actual catalog attributes')
    for row in attributes:
        before=catalog[row['signature']]
        for field in ['acl','owner','securityDefiner','config','volatility']:require(field in before and row.get(field)==before[field],label+': unchanged security/function attribute '+field)
    domain=value.get('futureExpiryDomain',{});require(domain.get('proofLayer')=='SOURCE' and all(domain.get(k) is True for k in ['exactTargetAndGeneration','nonRoundZeroNotExcluded','existingUpdatePredicatesUnchanged']),label+': declared expiry predicate review remains source-layer evidence')
    limits=value.get('limitations',[]);require(isinstance(limits,list) and any('explicit outer runtime seam' in v and 'not protected annual Director' in v for v in limits),label+': annual trigger fixture boundary retained')
    return {'nodeTests':run['counts']['tests'],'runtimeSchedules':14,'retainedBeforeCycles':6,'repairedBeforeAfterPairs':6,'unchangedPreclaimSkipLockedCases':2,'futureScope':'Actual future worker plus installed match-control trigger; outer runtime seam, not protected annual Director RPC','universalDeadlockFreedom':'NOT_PROVEN'}

def validate_native_decoder(value):
    label='native decoder';prefix='tools/reliability/native-never-again/decoder/'
    require(value.get('production') is False and value.get('shippingNativeChanged') is False and value.get('physical') is False and value.get('simulator') is False and value.get('executionRuntime')=='SWIFT_MACOS_MODEL',label+': model integration proof boundary')
    require(value.get('sourcesStable') is True and value.get('compatibilityCondition')=='SQL session TimeZone=UTC',label+': stable UTC-only proof')
    expected_checks={(format,case) for format in ['BB','SC','SI'] for case in ['REQUEST','ACCEPTED','REPLAY','WRONG_MUTATION_DENIED','WRONG_GROSS_DENIED','MISSING_REQUIRED_ACK_DENIED','CONFLICT_ERROR','SQL_TIMEOUT_ERROR']}
    checks=value.get('checks',[])
    require(value.get('summary')=={'passed':24,'failed':0} and len(checks)==24 and all(v.get('result')=='PASS' for v in checks) and {(v.get('format'),v.get('id')) for v in checks}==expected_checks,label+': exact actual24 named checks')
    proof=value.get('sourceProvenance',{});require(proof.get('contract')=='phase2c-swift-decoder-inputs-v1' and proof.get('sourcesStable') is True and proof.get('result')=='PASS',label+': original before/after capture required')
    before=proof.get('before',{});after=proof.get('after',{});require(before.get('files')==after.get('files') and isinstance(before.get('files'),list),label+': before/after identity')
    models=value.get('modelSources',[]);require(len(models)==12 and len({v.get('path') for v in models})==12,label+': exact model set')
    for model in models:require(re.fullmatch(r'Vendor/[A-Za-z0-9]+\.swift',model.get('path','')) is not None and re.fullmatch(r'[a-f0-9]{64}',model.get('sha256','')) is not None,label+': retained model identity')
    fixture=value.get('fixture',{});require(fixture.get('path')=='docs/reliability/phase2c/evidence/recovery-proof.json',label+': exact actual DTO path')
    known=value.get('knownLimitations',[]);require(len(known)==1 and known[0].get('id')=='P2C-NEW-TIMESTAMP-TIMEZONE' and known[0].get('result')=='EXPECTED_REJECTION_CONFIRMED' and known[0].get('artifact')=='docs/reliability/phase2c/evidence/native-timezone-counterexample.json' and known[0].get('error')=='invalidTimestamp',label+': actual unsupported-timezone negative')
    expected={prefix+'run.mjs',prefix+'main.swift',prefix+'fixture-manifest.json',fixture['path'],known[0]['artifact']}|{prefix+v['path'] for v in models}
    files=before['files'];require(len(files)==len(expected) and {v.get('path') for v in files}==expected,label+': driver/assertions/manifest/models/DTO/counterexample all captured')
    hashes={}
    for item in files:
        file=item['path'];require(re.fullmatch(r'[a-f0-9]{64}',item.get('sha256','')) is not None and source_path(file).is_file() and digest(source_path(file))==item['sha256'],label+': current exact input '+file);hashes[file]=item['sha256']
    require(all(hashes[prefix+v['path']]==v['sha256'] for v in models) and hashes[fixture['path']]==fixture.get('sha256') and hashes[known[0]['artifact']]==known[0].get('sha256'),label+': consumed bytes match reported proof')
    manifest=json.loads(source_path(prefix+'fixture-manifest.json').read_text())
    require(manifest.get('files')==models and manifest.get('pinnedNative')==value.get('native') and manifest.get('provenance')==value.get('provenance'),label+': captured manifest matches attribution')
    return {'modelChecks':24,'capturedInputs':len(files),'inputSourcesStable':True,'proofLayer':'INTEGRATION_SWIFT_MACOS_MODELS','physical':'NOT_PROVEN','nativeGitLineage':'STRONGLY_SUPPORTED_NOT_NEWLY_GIT_VERIFIED'}

def validate_before_provenance(artifact,kind):
    label='baseline:'+kind
    require(artifact.get('result')=='PASS' and artifact.get('mode')=='baseline',label+': completed execution')
    tool='measure-phase2c-locks.mjs' if kind=='locks' else 'benchmark-phase2c.mjs'
    verify_source_provenance(artifact.get('sourceProvenance'),label,['tools/reliability/'+tool],'LOCK_BENCHMARK' if kind=='locks' else 'BENCHMARK')
    require(artifact['sourceProvenance']['before']['through']==121,label+': actual before schema boundary')
    migration_identity(artifact,label,candidate=False)
    require(artifact.get('production') is False and artifact.get('environment')=='LOCAL_SOCKET_ONLY_POSTGRESQL17' and artifact.get('statementTimeoutMs')==1000,label+': matched isolated finite profile')
    if kind=='locks':
        require(len(artifact.get('rows',[]))==8 and {(r.get('scale'),r.get('variant')) for r in artifact['rows']}=={(s,v) for s in [1,2,5,10] for v in ['none','multiple_receipts']},label+': exact before lock cells')
        for row in artifact['rows']:
            require(row.get('successCount')==100 and row.get('failureCount')==0 and row.get('canonicalRollbackDigestVerified') is True,label+': before outcomes')
            for metric in ['transactionWallUpperBound','databaseRpc','lockHeldThroughRpcLowerBound']:validate_summary(row.get(metric,{}),label+':'+metric,100)
        return {}
    require(artifact.get('kind')==kind and artifact.get('timeZone')=='UTC',label+': identity and UTC')
    required={'none'} if kind=='common' else {'none','current_compatible','current_incompatible_consumed','current_incompatible_financial','stale_source','stale_result_binding','superseded_result','multiple_receipts'}
    cells={}
    for scale in artifact.get('scales',[]):
        for row in scale.get('branches',[]):
            key=(scale['scale'],row.get('variant'));require(key not in cells,label+': duplicate cell');cells[key]=row
            n=1000 if kind=='common' else 30;raw=[v for batch in row.get('batches',[]) for v in batch.get('valuesMs',[])]
            validate_summary(row,label+':'+str(key),n,raw,p99=n>=1000)
            require(row.get('successCount')==n and row.get('failureCount')==0 and row.get('rollbackVerified') is True,label+': before outcomes')
    require(set(cells)=={(scale,variant) for scale in [1,2,5,10] for variant in required},label+': all before cells')
    return cells

def evaluate(root=None):
    global R,D,MIGRATIONS,INPUTS
    if root is not None:R=Path(root).resolve() # Unit-test dependency only; CLI accepts no root/target.
    D=R/'docs/reliability/phase2c';INPUTS={}
    result={'schemaVersion':1,'scope':'PHASE2C_LOCAL_PERFORMANCE_DELIVERY_FINITE_ARTIFACT_GATE','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'production':False,'approvedBaseline':False,'checkpoints':{},'failures':[],'missing':[],
      'limitations':['Retained artifact validation does not run SQL or substitute for runtime tests.','Independent engineering nested-query/index review, full security/client/golf/regression proof and314requirement adjudication are separate gates.','Local scheduler noise allowances are proposed engineering checks, notProduction SLOs.','No deployment authorization, providercapacity, hosted supervision or physical proof.']}
    try:
        MIGRATIONS={str(p.relative_to(R)):digest(p) for p in sorted((R/'supabase/production_migrations').glob('20260928012[1-4]_*.sql'))}
        require(len(MIGRATIONS)==4,'exact source migrations121–124')
        before_summaries={kind:validate_before_provenance(read('benchmark-baseline-'+kind+'.json'),kind) for kind in ['common','eligible']}
        validate_before_provenance(read('lock-duration-baseline.json'),'locks')
        summaries={}
        for kind in ['common','eligible','recovery']:
            summaries[kind]=validate_benchmark(read('benchmark-candidate-'+kind+'.json'),kind)
        gate=read('performance-gate.json');require(gate.get('status')=='PASS' and gate.get('failures')==[] and gate.get('missing')==[],'scoring performance gate')
        expected={(kind,f'{scale}:{variant}') for kind in ['common','eligible'] for scale,variant in summaries[kind]}
        cells=gate.get('comparisons',[]);require(len(cells)==len(expected) and {(v['kind'],v['key']) for v in cells}==expected,'score gate exact current cells')
        for cell in cells:
            scale,variant=cell['key'].split(':',1);row=summaries[cell['kind']][(int(scale),variant)]
            require(same_number(cell['afterP50Ms'],row['p50Ms']) and same_number(cell['afterP95Ms'],row['p95Ms']),'score gate current inputs')
            before=before_summaries[cell['kind']][(int(scale),variant)]
            require(same_number(cell.get('beforeP50Ms'),before['p50Ms']) and same_number(cell.get('beforeP95Ms'),before['p95Ms']),'score gate actual recorded before inputs')
        result['checkpoints']['score']=sum(v['samples'] for v in summaries['common'].values());result['checkpoints']['eligible']=sum(v['samples'] for v in summaries['eligible'].values());result['checkpoints']['recovery']=sum(v['samples'] for v in summaries['recovery'].values())
        result['checkpoints']['lockSamples']=validate_locks(read('lock-duration-candidate.json'))
        for name in ['delivery','worker-history','backlog-pressure','backlog-tail','finite']:
            receipt=read('evidence/'+name+'.json');verify_receipt(name,receipt);require(receipt.get('result')=='PASS',name+': executed suite')
        result['checkpoints']['calcuttaLock']=validate_calcutta_lock(read('evidence/calcutta-lock-order.json'),read('evidence/calcutta-current-job-lock-after.json'))
        result['checkpoints']['netOwnerLock']=validate_net_owner_lock(read('evidence/net-owner-lock-order.json'),read('evidence/net-owner-control-lock-after.json'))
        result['checkpoints']['expiryBundleLock']=validate_worker_failure_lock(read('evidence/worker-failure-lock-order.json'),read('evidence/worker-failure-lock-after.json'))
        result['checkpoints']['deliveryIndexes']=validate_delivery_index_review(read('evidence/delivery-index-review.json'),read('evidence/delivery-index-review-detail.json'))
        result['checkpoints']['delivery']=validate_delivery(read('evidence/worker-delivery-results.json'))
        result['checkpoints']['workerHistory']=validate_worker_history(read('evidence/worker-history-detail.json'))
        result['checkpoints']['backlog']=validate_backlog(read('evidence/backlog-pressure-results.json'))
        result['checkpoints']['backlogTail']=validate_backlog_tail(read('evidence/backlog-tail-results.json'))
        result['checkpoints']['finite']=validate_finite(read('timeout-results.json'))
    except FileNotFoundError as error:result['missing'].append(str(Path(error.filename).name))
    except (ValueError,KeyError,TypeError,IndexError,ZeroDivisionError,StopIteration,AttributeError,OverflowError) as error:result['failures'].append(str(error))
    result['status']='FAIL' if result['failures'] else 'PARTIAL' if result['missing'] else 'PASS'
    result['inputs']=[{'path':p,'sha256':h} for p,h in sorted(INPUTS.items())]
    result['migrationSourceManifest']=[{'path':p,'sha256':h} for p,h in sorted(MIGRATIONS.items())]
    return result

if __name__=='__main__':
    expected=['--output','docs/reliability/phase2c/certification-gate.json']
    if sys.argv[1:] not in [[],expected]:raise SystemExit('Only optional --output docs/reliability/phase2c/certification-gate.json; no external input/target')
    result=evaluate()
    encoded=json.dumps(result,indent=2,allow_nan=False)+'\n'
    if sys.argv[1:]:
        destination=R/expected[1];destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(encoded)
    print(encoded,end='')
    raise SystemExit(0 if result['status']=='PASS' else 1)
