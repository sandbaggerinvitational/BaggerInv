// Owned local, synthetic Certification proof of the approved 069/138 change.
// The comparison database is a catalog-only reconstruction of exact retained
// predecessor definitions, not a claim to historical Production/import data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {initializeCertificationFixture} from './support/reliability/phase2d-certification-fixture.mjs';
import {certificationProvisionalProfile} from './support/reliability/certification-provisional-profile.mjs';
import {annualRuntime, provisionAnnualSyntheticAuthority} from './support/reliability/certification-annual-transition-fixture.mjs';
import {canonicalSourceManifest, createCanonicalCompilerFixture, installLocalCanonicalPlatform} from './support/reliability/phase2d-resource-bootstrap.mjs';
import {createDatabase, destroyIsolatedCluster, jsonLiteral, repositoryRoot, sql, sqlFile} from './support/reliability/postgres17.mjs';
import {buildCanonicalArtifacts, installCanonicalBaseline, canonicalCatalog, serialize} from '../tools/reliability/canonical-bootstrap-artifacts.mjs';

const baseSha = '7cec5128409286f5b4a5f3524d4c5488124a7be7';
const migration069 = 'supabase/production_migrations/202608300069_production_annual_scoring_authority_v1.sql';
const migration131 = 'supabase/production_migrations/202609300131_canonical_resource_control_v1.sql';
const migration138 = 'supabase/production_migrations/202609300138_certification_annual_transition_v1.sql';
const retained069Fixture = 'test/fixtures/reliability/release139-069-original.sql';
const priorAnnualPath = 'docs/reliability/phase2d-resource-model/implementation-evidence/annual-transition-2026-10-03T02-08-24-102Z.json';
const retained138Hash = 'cd7b2d1e66c26ae97bcaf4bbaf1ffe109d435e0298aff7820d6c2538e7edcfae';
const retained131Hash = '7e7c0f51945dd3a993858e2502152b447cfde65670f7a8a94dc4055778b01fc2';
const certificateGetter = 'production_control.annual_scoring_platform_certification_v1';
const helperName = 'production_control.assert_legacy_provider_origin_v1';
const readinessName = 'production_control.annual_scoring_transition_readiness_v1';
const scoringRuntimeName = 'production_control.assert_production_scoring_runtime';
const changedNames = [
  'production_control.assert_production_scoring_runtime',
  'production_control.assert_annual_transition_platform_owner_v1',
  readinessName,
].sort();
const sha = value => createHash('sha256').update(value).digest('hex');
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const productionOnlyBlock = `  -- Preserve069's missing-certificate denial for Production only. Certification
  -- retains its separately admitted origin and does not acquire this certificate.
  if production_control.canonical_annual_scope_key_v2() = 'BAGGER_INV_PRODUCTION'
     and not exists (
       select 1 from production_control.annual_scoring_platform_certifications_v1
       where scope_key = 'BAGGER_INV_PRODUCTION'
     ) then
    blockers := blockers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED',
        'section', 'Activation',
        'message', 'Annual activation requires its lawful platform certification.'
      )
    );
  end if;
`;

// Read exact dollar-quoted SQL bodies; fail if a source contains an unexpected
// duplicate definition or delimiter. No regex-based mutation of shipping files.
function definitions(source) {
  const entries = [];
  const starts = source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z0-9_]+)\s*\(/ig);
  for (const match of starts) {
    const tail = source.slice(match.index);
    const opening = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(tail);
    assert.ok(opening, 'Dollar-quoted function body required: ' + match[1]);
    const bodyStart = opening.index + opening[0].length;
    const bodyEnd = tail.indexOf(opening[1], bodyStart);
    assert.ok(bodyEnd >= bodyStart);
    const terminator = /^\s*;/.exec(tail.slice(bodyEnd + opening[1].length));
    assert.ok(terminator);
    const definition = tail.slice(0, bodyEnd + opening[1].length + terminator[0].length);
    assert.ok(!entries.some(([name]) => name === match[1]), 'One exact definition per name');
    entries.push([match[1], {definition, body: tail.slice(bodyStart, bodyEnd)}]);
  }
  return new Map(entries);
}

function changedWorkerDefault(sourceDefinition) {
  const original = 'required_worker text default null';
  assert.equal(sourceDefinition.split(original).length, 2, 'One declared worker default');
  const changed = sourceDefinition.replace(original, "required_worker text default 'SCORING_GOOGLE_OUTBOX'");
  assert.equal(definitions(changed).get(scoringRuntimeName).body, definitions(sourceDefinition).get(scoringRuntimeName).body,
    'Default-only tamper must preserve exact prosrc');
  return changed;
}

async function predecessors() {
  const old069 = execFileSync('git', ['show', `${baseSha}:${migration069}`], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    env: {PATH: process.env.PATH || ''},
  });
  const current069 = await readFile(migration069, 'utf8');
  assert.equal(await readFile(retained069Fixture, 'utf8'), old069,
    'Compiler retained069 bytes must equal the frozen Git predecessor');
  const current131 = await readFile(migration131, 'utf8');
  const current138 = await readFile(migration138, 'utf8');
  const before = definitions(old069), after = definitions(current069);
  assert.deepEqual([...after.keys()].filter(name => !before.has(name)), [helperName]);
  assert.deepEqual([...before.keys()].filter(name => !after.has(name)), []);
  assert.deepEqual([...before.keys()].filter(name => before.get(name).definition !== after.get(name).definition).sort(), changedNames);
  assert.equal(before.get(certificateGetter).definition, after.get(certificateGetter).definition,
    'Original STRICT getter remains byte-identical for076 implementation evidence');
  const bridgeMatch = current131.match(/DO \$annual_069_forward_bridge\$[\s\S]*?\$annual_069_forward_bridge\$;/);
  assert.ok(bridgeMatch, 'Approved exact bridge must be installed in131');
  const tableStart = current131.indexOf('create table production_control.canonical_resource_v1');
  const beginEnd = current131.indexOf('begin;') + 'begin;'.length;
  assert.ok(tableStart > beginEnd);
  const old131 = current131.slice(0, beginEnd) + '\n\n' + current131.slice(tableStart);
  assert.equal(sha(old131), retained131Hash, 'Removing only the bridge prefix restores exact retained131');
  assert.equal(current138.split(productionOnlyBlock).length, 2, 'Exactly the approved Production-only readiness clause');
  let old138 = current138.replace(productionOnlyBlock, '');
  const hashLine = /do \$source\$begin if encode\(extensions\.digest\(\(select prosrc from pg_proc where oid='production_control\.annual_scoring_transition_readiness_v1\(text\)'::regprocedure\),'sha256'\),'hex'\)<>('[a-f0-9]{64}')/;
  const line = hashLine.exec(old138);
  assert.ok(line, 'Exact predecessor hash guard required');
  old138 = old138.replace(line[0], line[0].replace(line[1], literal(sha(before.get(readinessName).body))));
  assert.equal(sha(old138), retained138Hash, 'Reconstructed file must match the actual completed annual proof source');
  const readinessBefore = definitions(old138).get(readinessName);
  const readinessAfter = definitions(current138).get(readinessName);
  assert.equal(readinessAfter.body.replace(productionOnlyBlock, ''), readinessBefore.body);
  return {old069, current069, current131, old131, bridge: bridgeMatch[0], current138, old138, before, after, readinessBefore, readinessAfter};
}

// Hash all synthetic application data without returning any row payload. Bridge
// testing may alter definitions/ACLs only; it must not edit even compiler facts.
const dataFingerprintSql = `create temporary table r2_069_data_hash(relation text,n bigint,hash text)on commit preserve rows;
do $snapshot$declare r record;row_count_value bigint;row_hash_value text;begin
 for r in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r'and n.nspname in('production_control','scoring_authority','participant_identity','production_rehearsal') loop
  execute format('select count(*),encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(v)order by to_jsonb(v)::text),''[]''::jsonb)::text,''sha256''),''hex'')from %I.%I v',r.nspname,r.relname)into row_count_value,row_hash_value;
  insert into r2_069_data_hash values(r.nspname||'.'||r.relname,row_count_value,row_hash_value);
 end loop;
end;$snapshot$;
select coalesce(jsonb_agg(to_jsonb(v)order by relation),'[]')from r2_069_data_hash v;`;

const rawFunctionCatalogSql = `select jsonb_agg(jsonb_build_object('row',to_jsonb(p),'xmin',p.xmin::text)order by p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='production_control'
and p.proname in('assert_production_scoring_runtime','assert_annual_transition_platform_owner_v1',
 'annual_scoring_transition_readiness_v1','assert_legacy_provider_origin_v1','annual_scoring_platform_certification_v1')`;

async function sourceManifest() {
  const annual = JSON.parse(await readFile(priorAnnualPath, 'utf8'));
  const canonical = await canonicalSourceManifest({forwardMigrations: certificationProvisionalProfile});
  const files = [...new Set([...canonical.map(item => item.path), ...Object.keys(annual.startSource),
    'test/reliability-phase2dr2-069-certification-impact.integration.test.mjs',
    'test/support/reliability/certification-provisional-profile.mjs',
    'test/support/reliability/phase2d-resource-bootstrap.mjs',
    'test/support/reliability/release139-schema.mjs',
    'test/support/reliability/postgres17.mjs', 'tools/reliability/canonical-bootstrap-artifacts.mjs',
    'tools/reliability/phase2-network-deny.cjs', 'supabase/canonical_bootstrap/catalog.sql',
    'supabase/canonical_bootstrap/source-profile.json', retained069Fixture, priorAnnualPath])];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(file))])));
}

test('R2 approved069 change preserves Certification readiness and retained annual source scope', async t => {
  const startedAt = new Date().toISOString();
  const evidence = {startedAt, environment: 'OWNED_LOCAL_POSTGRESQL17', hostedAccess: false,
    productionAccess: false, googleCalls: 0, baseSha, profile: certificationProvisionalProfile,
    cases: [], limitation: 'Catalog-only predecessor reconstruction; no historical adoption/import/provider chronology claim. Full864-hole sequence is retained by scoped impact analysis, not rerun here.'};
  let fixture;
  const check = async (name, fn) => {
    let passed = false;
    await t.test(name, async () => { await fn(); evidence.cases.push(name); passed = true; });
    assert.equal(passed, true, 'Required predecessor failed: ' + name);
  };
  try {
    evidence.sourceBefore = await sourceManifest();
    const p = await predecessors();
    evidence.predecessors = {baseSha, old069Sha256: sha(p.old069), old131Sha256: sha(p.old131), old138Sha256: sha(p.old138),
      current069Sha256: sha(p.current069), current131Sha256: sha(p.current131), current138Sha256: sha(p.current138), bridgeSha256: sha(p.bridge)};
    await check('exact source comparison isolates three existing bodies, bridge and Production-only138 branch', async () => {
      const annual = JSON.parse(await readFile(priorAnnualPath, 'utf8'));
      assert.equal(annual.sourceStable, true);
      assert.equal(annual.startSource[migration138], retained138Hash);
      assert.equal(annual.startSource[migration131], retained131Hash);
      const mismatches = Object.entries(annual.startSource).filter(([file, hash]) => evidence.sourceBefore[file] !== hash).map(([file]) => file);
      assert.deepEqual(mismatches, [migration131, migration138]);
      evidence.retainedAnnual = {path: priorAnnualPath, recordedSourceCount: Object.keys(annual.startSource).length,
        changedRecordedSources: mismatches, unchangedRecordedSources: Object.keys(annual.startSource).length - mismatches.length,
        completedOperations: annual.completedOperations, predecessorSequence: annual.predecessorSequence, successorSequence: annual.successorSequence,
        missingFromOriginalManifest: 'Historical069 and compiler/catalog dependencies; captured in this focused proof',
        fullSequenceRerun: false};
    });
    // Start from the existing owned compiler profile at130. Its historical rows
    // are declared synthetic compiler scaffolding, never genuine provider facts.
    fixture = await createCanonicalCompilerFixture({forwardMigrations: []});
    fixture.compilerDatabase = fixture.database;
    const old130 = 'r2_original130_catalog', bridgeProbe = 'r2_original130_bridge_probe';
    createDatabase(fixture.cluster, old130, {template: fixture.compilerDatabase});
    const query = database => statement => sql(fixture.cluster, database, statement, {role: ''});
    const oldQ = query(old130), correctedQ = query(fixture.compilerDatabase);
    // The historical compiler is pinned to the actual retained069 source, so
    // this old130 state is compiled rather than reconstructed by new definitions.
    assert.equal(oldQ(`select to_regprocedure('${helperName}()')is null`), 't');
    for (const name of changedNames) {
      const body = oldQ(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname||'.'||p.proname=${literal(name)}`);
      assert.equal(body.trim(), p.before.get(name).body.trim(), 'Actual original069 compiler definition: ' + name);
    }
    correctedQ(p.bridge);
    createDatabase(fixture.cluster, bridgeProbe, {template: old130});
    const probeQ = query(bridgeProbe);
    await check('old130 bridge rejects mixed, unknown and privilege-tampered definitions atomically', async () => {
      const cases = [
        ['MIXED', p.after.get(changedNames[0]).definition, /ANNUAL_069_BRIDGE_MIXED_INSTALLATION/],
        ['UNKNOWN_BODY', p.before.get(changedNames[0]).definition.replace('begin\n', 'begin\n-- Explicit negative fixture: unknown body\n'), /ANNUAL_069_BRIDGE_SOURCE_BASELINE_MISMATCH/],
        ['PRIVILEGE', 'grant execute on function production_control.assert_production_scoring_runtime(jsonb,text)to service_role;', /ANNUAL_069_BRIDGE_PRIVILEGE_BASELINE_MISMATCH/],
        ['DEFAULT_ARGUMENT_ORIGINAL', changedWorkerDefault(p.before.get(scoringRuntimeName).definition), /ANNUAL_069_BRIDGE_ARGUMENT_DEFAULT_MISMATCH/],
        ['GETTER_BODY', p.before.get(certificateGetter).definition.replace('begin\n', 'begin\n-- Explicit negative fixture: unknown getter\n'), /ANNUAL_069_BRIDGE_ORIGINAL_CERTIFICATE_GETTER_REQUIRED/],
      ];
      const beforeCatalog = await canonicalCatalog(fixture.cluster, bridgeProbe), beforeData = probeQ(dataFingerprintSql);
      const rawBefore = probeQ(rawFunctionCatalogSql);
      for (const [label, fault, expected] of cases) {
        assert.throws(() => probeQ(`\\set VERBOSITY verbose\nbegin;${fault}\n${p.bridge}\ncommit;`), error => {
          assert.match(error.message, /55000/); assert.match(error.message, expected); return true;
        }, label);
        assert.deepEqual(await canonicalCatalog(fixture.cluster, bridgeProbe), beforeCatalog, label + ' catalog rollback');
        assert.equal(probeQ(dataFingerprintSql), beforeData, label + ' data unchanged');
        assert.equal(probeQ(rawFunctionCatalogSql), rawBefore, label + ' identity/ACL/body rollback');
      }
      evidence.bridgeNegativeCases = cases.map(([label]) => label);
    });
    await check('old130 bridge preserves OIDs, ACLs, all data and076 manifest; corrected repeated bridge is exact no-op', async () => {
      const beforeData = probeQ(dataFingerprintSql);
      const beforeManifest = probeQ('select production_control.annual_side_game_implementation_manifest_v1()');
      const beforeRows = JSON.parse(probeQ(rawFunctionCatalogSql));
      probeQ(p.bridge);
      const afterRows = JSON.parse(probeQ(rawFunctionCatalogSql));
      for (const before of beforeRows) {
        const after = afterRows.find(value => value.row.oid === before.row.oid);
        assert.ok(after);
        const {prosrc: oldBody, ...oldMetadata} = before.row;
        const {prosrc: newBody, ...newMetadata} = after.row;
        assert.deepEqual(newMetadata, oldMetadata);
        if (before.row.proname === 'annual_scoring_platform_certification_v1') assert.deepEqual(after, before);
        else assert.notEqual(newBody, oldBody);
      }
      assert.equal(probeQ(dataFingerprintSql), beforeData);
      assert.equal(probeQ('select production_control.annual_side_game_implementation_manifest_v1()'), beforeManifest);
      const rawBeforeNoop = probeQ(rawFunctionCatalogSql), catalogBeforeNoop = await canonicalCatalog(fixture.cluster, bridgeProbe);
      probeQ(p.bridge); probeQ(p.bridge);
      assert.equal(probeQ(rawFunctionCatalogSql), rawBeforeNoop, 'No pg_proc row rewrite, including xmin');
      assert.deepEqual(await canonicalCatalog(fixture.cluster, bridgeProbe), catalogBeforeNoop);
      assert.equal(probeQ(dataFingerprintSql), beforeData);
      for (const [label, fault, expected] of [
        ['HELPER_ACL', `grant execute on function ${helperName}()to service_role;`, /ANNUAL_069_BRIDGE_HELPER_CONTRACT_MISMATCH/],
        ['HELPER_MISSING', `drop function ${helperName}();`, /ANNUAL_069_BRIDGE_MIXED_INSTALLATION/],
        ['DEFAULT_ARGUMENT_CORRECTED', changedWorkerDefault(p.after.get(scoringRuntimeName).definition), /ANNUAL_069_BRIDGE_ARGUMENT_DEFAULT_MISMATCH/],
      ]) {
        assert.throws(() => probeQ(`\\set VERBOSITY verbose\nbegin;${fault}\n${p.bridge}\ncommit;`), error => {
          assert.match(error.message, /55000/); assert.match(error.message, expected); return true;
        }, label);
        assert.deepEqual(await canonicalCatalog(fixture.cluster, bridgeProbe), catalogBeforeNoop);
        assert.equal(probeQ(dataFingerprintSql), beforeData);
        assert.equal(probeQ(rawFunctionCatalogSql), rawBeforeNoop, label + ' exact catalog rollback');
        evidence.bridgeNegativeCases.push(label);
      }
      assert.deepEqual(await canonicalCatalog(fixture.cluster, bridgeProbe), await canonicalCatalog(fixture.cluster, fixture.compilerDatabase));
      evidence.bridge = {existingIdentityAclAndDependenciesPreserved: true, existingGetterRowByteExact: true,
        allApplicationDataUnchanged: true, implementationManifest076Unchanged: true,
        correctedNoopIncludesPgProcXmin: true, syntheticCompilerOnly: true};
    });
    await check('actual131 through152 upgrade from original130 and corrected-chain installation converge', async () => {
      for (const file of certificationProvisionalProfile) {
        sqlFile(fixture.cluster, old130, file, {role: ''});
        sqlFile(fixture.cluster, fixture.compilerDatabase, file, {role: ''});
      }
      const upgraded = await canonicalCatalog(fixture.cluster, old130);
      const corrected = await canonicalCatalog(fixture.cluster, fixture.compilerDatabase);
      assert.deepEqual(upgraded, corrected);
      evidence.upgrade = {sourceProfile: certificationProvisionalProfile, old130CompiledFromExactRetained069: true,
        entireFinalCatalogEqual: true, upgradedCatalogSha256: sha(serialize(upgraded)), correctedCatalogSha256: sha(serialize(corrected)),
        noHistoricalAuthorityClaim: true};
    });
    fixture.forwardMigrations = certificationProvisionalProfile;
    fixture.sourceManifest = await canonicalSourceManifest({forwardMigrations: certificationProvisionalProfile});
    fixture.bundle = await buildCanonicalArtifacts(fixture);
    const certificationDatabase = 'r2_069_certification';
    createDatabase(fixture.cluster, certificationDatabase); installLocalCanonicalPlatform(fixture.cluster, certificationDatabase);
    const installed = await installCanonicalBaseline(fixture.cluster, certificationDatabase, fixture.bundle);
    const f = await initializeCertificationFixture(fixture.cluster, certificationDatabase, installed);
    fixture.resources = [f];
    provisionAnnualSyntheticAuthority(f);
    const runtime = annualRuntime(f);
    const readInput = target => ({...runtime.base(), operation_id: 'ANNUAL.READINESS', payload: {
      expected_current_tournament_id: '2026', target_tournament_id: String(target)}});
    let blank, prepared;
    await check('authorized future CREATE and actual readiness need no Production platform certificate', () => {
      assert.equal(f.q('select count(*)from production_control.annual_scoring_platform_certifications_v1'), '0');
      assert.equal(f.q('select count(*)from production_control.resource_scope'), '0');
      assert.equal(f.q('select count(*)from production_control.cutover_activation_state'), '0');
      runtime.administration(2097, 'CREATE_TOURNAMENT', {tournament_name: 'Synthetic069 readiness2097', destination: 'Owned local fixture',
        start_date: '2097-09-24', end_date: '2097-09-26', timezone: 'UTC', creation_mode: 'BLANK'});
      blank = f.rpc('read_certification_annual_transition_v1', readInput(2097));
      assert.ok(Array.isArray(blank.blockers));
      assert.ok(blank.blockers.length > 0, 'Incomplete actual future setup must retain its real blockers');
      assert.ok(!JSON.stringify(blank).includes('PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED'));
      evidence.blankReadiness = blank;
    });
    await check('full supported future preparation retains genuine predecessor-close blocker without Production certificate', async () => {
      prepared = await runtime.prepareFuture('2098');
      assert.ok(prepared.blockers.some(value => value.code === 'FUTURE_PREDECESSOR_SCORING_CLOSE_FENCE_NOT_CERTIFIED'));
      assert.ok(!JSON.stringify(prepared).includes('PRODUCTION_ANNUAL_SCORING_PLATFORM_CERTIFICATION_REQUIRED'));
      assert.equal(f.q('select count(*)from production_control.annual_scoring_platform_certifications_v1'), '0');
      evidence.preparedReadiness = prepared;
    });
    await check('exact retained old138 readiness returns identical actual DTOs under rollback-only definition comparison', () => {
      const functionBefore = f.q(`select pg_get_functiondef('${readinessName}(text)'::regprocedure)`);
      for (const target of [2097, 2098]) {
        const input = readInput(target);
        const current = f.rpc('read_certification_annual_transition_v1', input);
        const old = JSON.parse(f.q(`begin;${p.readinessBefore.definition}
          set local request.jwt.claim.role='service_role';set local role service_role;
          select public.read_certification_annual_transition_v1(${jsonLiteral(input)});rollback;`));
        assert.deepEqual(old, current, 'Exact current/retained Certification readiness including blockers and fingerprint');
      }
      assert.equal(f.q(`select pg_get_functiondef('${readinessName}(text)'::regprocedure)`), functionBefore);
      evidence.rollbackComparison = {targets: ['2097', '2098'], entireDtoEqual: true, definitionRestored: true,
        authorityRowsEdited: false, operationDataUnchanged: true};
    });
    await check('roles, missing actor, foreign resource, wrong governance and stale context still fail closed', () => {
      const input = readInput(2098), denials = [];
      for (const role of ['anon', 'authenticated']) {
        assert.throws(() => f.rpc('read_certification_annual_transition_v1', input, role), /permission denied/);
        denials.push(role);
      }
      for (const [label, request] of [
        ['participant', {...input, authorization: {...input.authorization, role: 'PARTICIPANT'}}],
        ['spectator', {...input, authorization: {...input.authorization, role: 'SPECTATOR'}}],
        ['signed_out', {...input, authorization: {}}],
        ['unlinked_actor', {...input, authorization: {...input.authorization, auth_user_id: randomUUID()}}],
        ['wrong_governance', {...input, authorization: {...input.authorization, tournament_id: '2098'}}],
        ['foreign_resource', {...input, resource: {...input.resource, resource_id: 'CERTIFICATION:' + randomUUID()}}],
        ['stale_context', {...input, expected_context_token: '0'.repeat(64)}],
      ]) {
        assert.throws(() => f.rpc('read_certification_annual_transition_v1', request),
          /DIRECTOR_REQUIRED|OWNER_REQUIRED|INPUT_INVALID|RESOURCE_BINDING_DENIED|RESOURCE_CONTEXT|CONTEXT_STALE|AUTHORIZATION|CONTEXT_DENIED/,
          label);
        denials.push(label);
      }
      evidence.negativeAuthorization = denials;
    });
    await check('complete final catalog differs only by three body definitions and the new private helper/dependencies', async () => {
      const comparison = 'r2_pre069_catalog_comparison';
      createDatabase(fixture.cluster, comparison, {template: fixture.compilerDatabase});
      const q = statement => sql(fixture.cluster, comparison, statement, {role: ''});
      // Only exact source-backed predecessor definitions are installed. No
      // imported facts, provider evidence, certificate or authority is created.
      for (const name of changedNames) q(name === readinessName ? p.readinessBefore.definition : p.before.get(name).definition);
      q(`drop function ${helperName}()`);
      const before = await canonicalCatalog(fixture.cluster, comparison);
      const after = await canonicalCatalog(fixture.cluster, fixture.compilerDatabase);
      const byIdentity = rows => new Map(rows.map(row => [row.identity, row]));
      const oldFunctions = byIdentity(before.functions), newFunctions = byIdentity(after.functions);
      assert.deepEqual([...newFunctions.keys()].filter(identity => !oldFunctions.has(identity)), [helperName + '()']);
      assert.deepEqual([...oldFunctions.keys()].filter(identity => !newFunctions.has(identity)), []);
      const changed = [...oldFunctions.keys()].filter(identity => serialize(oldFunctions.get(identity)) !== serialize(newFunctions.get(identity))).sort();
      assert.deepEqual(changed.map(identity => identity.split('(')[0]).sort(), changedNames);
      for (const identity of changed) {
        const {definitionSha256: oldHash, ...oldMetadata} = oldFunctions.get(identity);
        const {definitionSha256: newHash, ...newMetadata} = newFunctions.get(identity);
        assert.notEqual(oldHash, newHash); assert.deepEqual(oldMetadata, newMetadata);
      }
      for (const section of Object.keys(before)) {
        if (section === 'functions') continue;
        const stripHelper = rows => rows.filter(row => !JSON.stringify(row).includes(helperName));
        assert.deepEqual(section === 'dependencies' ? stripHelper(after[section]) : after[section], before[section], section);
      }
      const helper = newFunctions.get(helperName + '()');
      assert.equal(helper.owner, 'postgres'); assert.equal(helper.definer, true);
      assert.deepEqual(helper.searchPath, ['search_path=pg_catalog']); assert.equal(helper.volatile, 's');
      for (const flag of ['publicExecute', 'anonExecute', 'authenticatedExecute', 'serviceExecute']) assert.equal(helper[flag], false);
      for (const role of ['anon', 'authenticated', 'service_role'])
        assert.throws(() => f.q(`set role ${role};select ${helperName}()`), /permission denied/);
      evidence.catalog = {beforeSha256: sha(serialize(before)), afterSha256: sha(serialize(after)),
        beforeFunctions: before.functions.length, afterFunctions: after.functions.length, changedFunctions: changed,
        addedFunction: helper, unchangedSections: Object.keys(before).filter(section => !['functions', 'dependencies'].includes(section)),
        addedDependencies: after.dependencies.filter(row => JSON.stringify(row).includes(helperName)),
        existingOwnerAclSecurityPathUnchanged: true,
        reconstruction: 'Clone of local compiler catalog, three exact retained predecessor definitions restored, new helper removed; no historical input/adoption claim'};
    });
    await check('no Google jobs, Production authority, hidden context or read mutation introduced', () => {
      assert.equal(f.q('select count(*)from production_control.resource_scope'), '0');
      assert.equal(f.q('select count(*)from production_control.cutover_activation_state'), '0');
      assert.equal(f.q('select count(*)from production_control.annual_scoring_platform_certifications_v1'), '0');
      assert.equal(f.q('select count(*)from scoring_authority.google_outbox_events'), '0');
      assert.equal(f.q('select count(*)from production_control.canonical_operation_context_v1'), '0');
      assert.equal(runtime.current().tournament_id, '2026');
      evidence.resourceIsolation = {productionRows: 0, productionPlatformCertificates: 0, googleJobs: 0,
        currentTournament: '2026', contextMarkersAfterRequests: 0};
    });
  } catch (error) {
    evidence.failure = {name: error.name, message: error.message, code: error.code || null};
    throw error;
  } finally {
    evidence.sourceAfter = await sourceManifest();
    evidence.sourceStable = serialize(evidence.sourceBefore) === serialize(evidence.sourceAfter);
    if (fixture) { await destroyIsolatedCluster(fixture.cluster); evidence.ownedClusterDestroyed = true; }
    evidence.finishedAt = new Date().toISOString();
    evidence.status = evidence.cases.length === 10 && evidence.sourceStable ? 'PASS' : 'PARTIAL';
    const output = '/private/tmp/r2-069-certification-impact-' + startedAt.replaceAll(':', '-') + '.json';
    await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
    t.diagnostic(JSON.stringify({evidence: output, status: evidence.status, sourceStable: evidence.sourceStable}));
    assert.equal(evidence.sourceStable, true, 'All declared sources remain stable');
    if (!evidence.failure) assert.equal(evidence.cases.length, 10, 'Every focused impact gate must complete');
  }
});
