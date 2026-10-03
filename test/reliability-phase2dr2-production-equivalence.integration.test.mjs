// Reuse the protected local release fixture, with its explicitly synthetic
// admitted maintenance baseline. Test actual release/domain operations after the
// R2 forward profile, without changing Production manifests or guard bodies.
// This is not end-to-end proof of historical maintenance preparation.
// No hosted connection, provider credentials or real Google calls are possible.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {repositoryRoot} from './support/reliability/postgres17.mjs';
const wrapperPath=path.join(repositoryRoot,'test/reliability-phase2c1-release-admission.integration.test.mjs');
let wrapper=await readFile(wrapperPath,'utf8');
wrapper=wrapper.replace("from './support/reliability/postgres17.mjs'",`from ${JSON.stringify(pathToFileURL(path.join(repositoryRoot,'test/support/reliability/postgres17.mjs')).href)}`);
const entry="await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);";
assert.equal(wrapper.split(entry).length,2);wrapper=wrapper.replace(entry,'export default source;');
process.env.BAGGER_P0F_CANDIDATE='1';
let {default:source}=await import(`data:text/javascript;base64,${Buffer.from(wrapper).toString('base64')}`);
const migrations=[
 '202609300131_canonical_resource_control_v1.sql',
 '202609300132_certification_domain_gateways_v1.sql',
 '202609300133_certification_derived_gateways_v1.sql',
 '202609300134_certification_annual_administration_v1.sql',
 '202609300135_certification_read_contracts_v1.sql',
 '202609300136_certification_durable_ingress_v1.sql',
 '202609300137_certification_domain_resource_recovery_v1.sql',
 '202609300138_certification_annual_transition_v1.sql',
 '202609300139_certification_future_authoring_v1.sql',
 '202609300140_certification_future_scoring_v1.sql',
 '202609300141_certification_future_workers_v1.sql',
 '202609300142_certification_required_worker_reads_v1.sql',
 '202609300143_certification_odds_owner_publication_v1.sql',
 '202609300144_certification_release_rebind_v1.sql',
 '202609300145_certification_closed_tournament_read_v1.sql',
 '202609300146_certification_successor_current_reads_v1.sql',
 '202609300147_certification_closed_history_service_v1.sql',
 '202609300148_certification_odds_two_part_freshness_v1.sql',
 '202609300149_certification_odds_snapshot_guard_v1.sql',
 '202609300150_certification_odds_publication_source_identity_v1.sql',
 '202609300151_certification_annual_reopen_lineage_v1.sql',
 '202609300152_certification_closed_release_admission_v1.sql'];
const marker='        createDatabase(cluster, frozenDatabase, database);';
assert.equal(source.split(marker).length,2);
source=source.replace(marker,marker+`
        for(const r2ResourceDatabase of [database,frozenDatabase]){
        psqlFile(cluster,r2ResourceDatabase,path.join(repositoryRoot,'supabase/production_incremental/player-portrait-policy-v1.sql'));
        const r2ProductionBefore=psql(cluster,r2ResourceDatabase,"select jsonb_build_object('scope',(select jsonb_agg(to_jsonb(r)order by scope_key)from production_control.resource_scope r),'activation',(select jsonb_agg(to_jsonb(a)order by scope_key)from production_control.cutover_activation_state a),'pointer',(select jsonb_agg(to_jsonb(p)order by scope_key)from production_control.current_tournament_pointer_v1 p))::text");
        for(const filename of ${JSON.stringify(migrations)})psqlFile(cluster,r2ResourceDatabase,path.join(migrationsDirectory,filename));
        assert.equal(psql(cluster,r2ResourceDatabase,"select jsonb_build_object('scope',(select jsonb_agg(to_jsonb(r)order by scope_key)from production_control.resource_scope r),'activation',(select jsonb_agg(to_jsonb(a)order by scope_key)from production_control.cutover_activation_state a),'pointer',(select jsonb_agg(to_jsonb(p)order by scope_key)from production_control.current_tournament_pointer_v1 p))::text"),r2ProductionBefore,'R2 forward install must preserve Production control rows exactly');
        assert.equal(psql(cluster,r2ResourceDatabase,"select resource_class from production_control.canonical_resource_v1 where singleton"),'PRODUCTION');
        assert.equal(psql(cluster,r2ResourceDatabase,"select count(*)from production_control.certification_admission_v1"),'0');
        assert.equal(psql(cluster,r2ResourceDatabase,"select count(*)from production_control.certification_ingress_leases_v1"),'0');
        }
        // R2_OWNED_RESOURCE_UPGRADE_COMPLETE
`);
// Historical reports are immutable. This test writes only its R2 evidence.
source=source.replaceAll('docs/reliability/phase2c1-closure/evidence/p0f-approved/protected-equivalence.json',
 'docs/reliability/phase2d-resource-model/implementation-evidence/production-protected-equivalence.json');
source=source.replaceAll('docs/reliability/phase2c1/evidence/annual-initialization.json',
 'docs/reliability/phase2d-resource-model/implementation-evidence/production-annual-initialization-not-run.json');
source=source.replace("if(process.env.BAGGER_P0F_CANDIDATE==='1')evidence.schema=130;", "if(process.env.BAGGER_P0F_CANDIDATE==='1'){evidence.schema=152;evidence.excludedMigrations=[];evidence.r2ForwardMigrations="+JSON.stringify(migrations)+";}");
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
