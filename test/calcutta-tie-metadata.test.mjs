import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {buildCalcuttaModel,calcuttaPublicationRecords,deriveCalcuttaRoundResults} from '../lib/calcutta.js';
import {calcuttaDataFromResultView} from '../lib/calcutta-supabase.js';
import {productionCalcuttaV1ContractData,productionCalcuttaV1Data} from '../lib/production-calcutta-v1.js';
import {mobileCalcuttaDataFromProductionView} from '../lib/mobile-v1-calcutta.js';
import {tieFixture} from './fixtures/calcutta-tie-metadata.mjs';

// Exact certified pre-fix implementation, not a second formula written for tests.
const baselineSource=execFileSync('git',['show','76dfb0097f23d132c7010131f34c2df895bdb856:lib/calcutta.js'],{encoding:'utf8',cwd:new URL('..',import.meta.url)});
const baseline=await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString('base64')}`);
const withoutMetadata=v=>JSON.parse(JSON.stringify(v,(key,value)=>['tieSize','Tie Size'].includes(key)?undefined:value));
const rebuild=(engine,input,publication)=>engine({...input,roundResults:publication.roundResults,standings:publication.standings});

for(const format of ['BB','SC','SI'])for(const ties of [1,2,3])test(`${format}: ${ties}-way canonical tie survives publication/JSON/QA/participant readback; money unchanged`,()=>{
  const input=tieFixture(format,ties),round={BB:1,SC:2,SI:3}[format];
  const calculated=buildCalcuttaModel({...input,roundResults:deriveCalcuttaRoundResults(input),standings:[]});
  const publication=JSON.parse(JSON.stringify(calcuttaPublicationRecords(input)));
  const model=rebuild(buildCalcuttaModel,input,publication);
  const oldPublication=baseline.calcuttaPublicationRecords(input);
  const oldModel=rebuild(baseline.buildCalcuttaModel,input,oldPublication);
  assert.deepEqual(withoutMetadata(publication),oldPublication,'serialized publication only adds tie metadata');
  assert.deepEqual(withoutMetadata(model),withoutMetadata(oldModel),'all prices/ownership/places/Points/winnings/value/profit/ROI/portfolios identical');
  const tiedPlayers=ties*(format==='SC'?2:1);
  for(const [i,id] of Object.keys(input.players).entries()) {
    const expected=i<tiedPlayers?ties:1;
    assert.equal(calculated.golfers.find(g=>g.playerId===id).rounds[round].tieSize,expected);
    assert.equal(publication.roundResults.find(r=>r['Player ID']===id)['Tie Size'],expected);
    assert.equal(model.golfers.find(g=>g.playerId===id).rounds[round].tieSize,expected);
    assert.equal(model.golfers.find(g=>g.playerId===id).rounds[round].place,i<tiedPlayers?1:ties+1,'occupied-place authority unchanged');
  }
  // An explicit metadata sentinel proves readback is copying, not reranking.
  const copied=structuredClone(publication);copied.roundResults[0]['Tie Size']=9;
  assert.equal(rebuild(buildCalcuttaModel,input,copied).golfers.find(g=>g.playerId===copied.roundResults[0]['Player ID']).rounds[round].tieSize,9);
  const legacy=structuredClone(publication);legacy.roundResults.forEach(r=>delete r['Tie Size']);
  assert.deepEqual(rebuild(buildCalcuttaModel,input,legacy),oldModel,'historical missing-field behavior preserved');
  const qa=calcuttaDataFromResultView({snapshots:[{engine_key:'CALCUTTA',result_payload:JSON.parse(JSON.stringify(model)),result_state:'PROVISIONAL'}],jobs:[{engine_key:'CALCUTTA',status:'SUCCEEDED'}]}).calcutta;
  const market={pot:model.pot,purchases:input.purchases.map(p=>({player:{player_id:p['Golfer Player ID'],display_name:p['Golfer Player ID']},purchase_price:100,
    owners:[{player:{player_id:'P1',display_name:'P1'},ownership_fraction:.25},{player:{player_id:'P2',display_name:'P2'},ownership_fraction:.75}]}))};
  const state=model.tournamentComplete?'OFFICIAL':'IN_PROGRESS';
  const view={contract_version:'production-calcutta-v1',tournament_id:'2026',state,publication_state:'PUBLISHED',published:true,currency_code:'USD',
    configuration_revision:1,auction_revision:1,publication_revision:1,result_revision:1,configuration_fingerprint:'a'.repeat(64),auction_fingerprint:'b'.repeat(64),
    revision:`calcutta-v1:1:1:1:1:${state}:PUBLISHED`,freshness:{stale:false,updating:false},market,result:JSON.parse(JSON.stringify(model))};
  const contract=productionCalcuttaV1ContractData(view);
  const web=productionCalcuttaV1Data(view).calcutta;
  const mobile=mobileCalcuttaDataFromProductionView(view,{tournamentId:'2026',playerId:'P1'});
  assert.equal(contract.result.golfers[0].rounds[0].tieSize,ties);
  assert.equal(mobile.result.golfers[0].rounds[0].tieSize,ties);
  assert.equal(web.golfers[0].rounds[round].tieSize,qa.golfers[0].rounds[round].tieSize);
});
