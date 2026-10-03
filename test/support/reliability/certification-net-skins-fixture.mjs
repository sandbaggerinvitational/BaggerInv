// Explicit initial synthetic configuration, not an exposed configuration API.
// Entries are saved by the shipping Director client. The canonical manifest
// builder defines domain values. Every constraint/trigger remains enabled.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {entryDraft,entrySaveRequest} from '../../../lib/net-skins-entry-workspace.js';
import {certificationDirectorStack} from './certification-director-proof.mjs';
import {jsonLiteral} from './postgres17.mjs';

export async function provisionCertificationNetSkinsFixture(f){
 const stack=await certificationDirectorStack(f),revisions={};
 for(const roundNumber of[1,2,3]){
  const round=(await stack.transport.entriesRequest()).rounds.find(row=>row.roundNumber===roundNumber);
  const draft=entryDraft(round);draft.configured=true;for(const entry of draft.entries)entry.entered=true;
  const result=await stack.transport.entriesRequest(entrySaveRequest(round,draft,randomUUID()));revisions[roundNumber]=result.revision;
 }
 const context=f.context();
 f.q(`begin;set local request.jwt.claim.role='service_role';
 select production_control.push_certification_context_v1(${jsonLiteral(f.envelope)},'DIRECTOR',false);
 do $fixture$declare manifest jsonb;revision scoring_authority.net_skins_v1_configuration_revisions%rowtype;
 round_row jsonb;entry_row jsonb;begin
 manifest:=production_control.full_net_skins_manifest_v2('2026',array[1,2,3],${jsonLiteral(revisions)});
 insert into scoring_authority.net_skins_v1_configuration_revisions(tournament_id,configuration_revision,contract_version,state,
 publication_policy,configuration_manifest,configuration_fingerprint,resource_fingerprint,activation_revision,authority_epoch_id,
 configured_by_player_id,configured_by_auth_user_id,request_fingerprint,request_payload_hash,configured_at)
 values('2026',coalesce((select max(configuration_revision)from scoring_authority.net_skins_v1_configuration_revisions where tournament_id='2026'),0)+1,
 'production-net-skins-v1','CONFIGURED','OFFICIAL_ONLY',manifest,production_control.net_skins_v1_hash(manifest),
 production_control.net_skins_v1_hash(${jsonLiteral(f.resource)}),${context.activation_revision},'${context.authority_epoch_id}',
 '${f.envelope.authorization.player_id}','${f.envelope.authorization.auth_user_id}',
 production_control.net_skins_v1_hash(jsonb_build_object('fixture','certification-initial-net-skins-v1','resource',${jsonLiteral(f.resource)})),
 production_control.net_skins_v1_hash(manifest),clock_timestamp())returning*into revision;
 for round_row in select value from jsonb_array_elements(manifest->'rounds')loop
  insert into scoring_authority.net_skins_configurations(tournament_id,round_number,format,enabled,entry_type,buy_in_per_entry,
   expected_pot,completion_rule,payout_rounding,tie_rule,configuration_revision,configuration_fingerprint,source_workbook_id,
   imported_by,imported_at,approved_at,updated_at)
  values('2026',(round_row->>'round_number')::integer,round_row->>'format',true,round_row->>'entry_type',
   (round_row->>'buy_in_per_entry')::numeric,(round_row->>'expected_pot')::numeric,round_row->>'completion_rule',round_row->>'payout_rounding',
   round_row->>'tie_rule',revision.configuration_revision,round_row->>'configuration_fingerprint',
   'urn:bagger:synthetic:${f.resource.installation_id}','SYNTHETIC_INITIAL_CONFIGURATION',now(),now(),now());
  for entry_row in select value from jsonb_array_elements(round_row->'entries')loop
   insert into scoring_authority.net_skins_configuration_entries(tournament_id,round_number,entry_id,match_number,format,
    player_id_1,player_id_2,team_handicap,buy_in,eligible,source_payload)
   values('2026',(round_row->>'round_number')::integer,entry_row->>'entry_id',entry_row->>'match_number',round_row->>'format',
    entry_row->>'player_id_1',nullif(entry_row->>'player_id_2',''),null,(entry_row->>'buy_in')::numeric,true,
    jsonb_build_object('Contract Version','production-net-skins-v1','Canonical Match ID',entry_row->>'match_id',
     'Stable Player IDs',entry_row->'player_ids','Eligible Holes',round_row->'eligible_holes',
     'Entry Revision',entry_row->'entry_revision','Entry Key',entry_row->>'entry_key',
     'Entry Binding Fingerprint',entry_row->>'binding_fingerprint',
     'Net Handicap Basis',round_row->>'net_handicap_basis','Individual Stroke Allocation',entry_row->'individual_stroke_allocation'));
  end loop;
 end loop;
 insert into scoring_authority.net_skins_v1_configuration_current(tournament_id,configuration_revision_id,configuration_revision,state)
 values('2026',revision.configuration_revision_id,revision.configuration_revision,'CONFIGURED')
 on conflict(tournament_id)do update set configuration_revision_id=excluded.configuration_revision_id,
 configuration_revision=excluded.configuration_revision,state=excluded.state;
 end;$fixture$;
 select production_control.pop_certification_context_v1();commit;`);
 assert.equal(f.q('select count(*)from production_control.resource_scope'),'0');
 assert.equal(f.q('select count(*)from production_control.cutover_activation_state'),'0');
 return{entryRevisions:revisions,configurationRevision:Number(f.q("select configuration_revision from scoring_authority.net_skins_v1_configuration_current where tournament_id='2026'"))};
}
