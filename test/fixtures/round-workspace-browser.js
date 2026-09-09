import React from 'react';
import {createRoot} from 'react-dom/client';
import Panel from '../../app/admin/director/ProductionTournamentSetupPanel.js';
import {normalizeProductionTournamentSetupPayload} from '../../lib/production-tournament-setup-contract.js';
const ids=['JP01','MH01','DT01','AM01','BA01','CL01','CB01','HM01','JK02','MS02','MB01','BC01','MS01','JS01','CP01','JK01','CM01','CS01','MM01','NJ01','PN01','RM01','TL01','WO01'];
const revision='a19f4f10-28f7-46a9-8434-159cd07cc4b6';
const roster=ids.map((playerId,i)=>({playerId,displayName:playerId,teamSide:i<12?1:2,membershipStatus:'ACTIVE',handicapRevisionId:revision,tournamentHandicap:'5'}));
const names=['Jason Powell','Michael Hunnicutt','David Tatum','Alex Monteleone','Brian Atkinson','Caleb Lewis','Clay Beltran','Holman Moores','Jack Keffler','Matthew Smith','Miles Berger','Brenan Cavanaugh','Memo Saldana','Jack Samis','Chase Patterson','Jupjee Kochar','Chris Micheal','Chris Seekely','Max Markley','Nick Julian','Patrick Noonan','Robert Murphy','Taylor Lippincott','Will Oliver'];
roster.forEach((p,i)=>{p.displayName=names[i];});
const rounds=[{number:1,format:'BB'},{number:2,format:'SC'},{number:3,format:'SI'}];
const matches=rounds.flatMap(r=>Array.from({length:r.format==='SI'?12:6},(_,i)=>({matchId:`2026-R${r.number}-${i+1}`,roundNumber:r.number,matchNumber:i+1,format:r.format,participants:[],participantCount:0,courseId:'TPGC01',courseName:'Turtle Point Golf Course',tee:'Gold',teeTime:'07:30:00',contextFingerprint:'baseline',detailsManaged:true,status:'UPCOMING',locked:false,scoredHoles:0,scoringReadinessReasons:['Pairings and scoring context incomplete.'],snapshot:{prepared:false},blockers:[],warnings:[]})));
const data={revision:10,approvedHandicapRevisionId:revision,approvedHandicapRevisionNumber:7,roster,matches,rounds,teams:[{side:1,teamId:'PICKLES',name:'The Pickles'},{side:2,teamId:'LIPPIT',name:'Lipp it and Rip it'}],courses:rounds.map(r=>({roundNumber:r.number,courseId:'TPGC01',tee:'Gold',name:'Turtle Point Golf Course'})),tournament:{name:'Fixture Tournament',destination:'Fixture',startDate:'2026-09-25',endDate:'2026-09-26',timeZone:'America/Chicago',operationalStatus:'UPCOMING'},capabilities:Object.fromEntries(['update-tournament','upsert-match','replace-pairings'].map(a=>[a,{allowed:true}])),readiness:{state:'NEEDS_ATTENTION',sections:[],blockers:[],warnings:[]},audit:[]};
data.dependencies={oddsPublished:false,netSkinsConfigured:false,calcuttaConfigured:false,draftPickCount:22};
const release70=new URLSearchParams(location.search).has('release70');
if(release70){
  data.contractVersion='production-tournament-setup-v1';data.revision=12;
  const pairs=[['JP01','MH01','MS01','JS01'],['DT01','AM01','CP01','JK01'],['HM01','BA01','MM01','NJ01'],['CL01','BC01','CM01','CS01']];
  for(const m of data.matches){m.strictlyUnstarted=true;m.contextFingerprint='a'.repeat(64);m.snapshot={id:`${m.matchId}:S1`,prepared:true,current:false};}
  pairs.forEach((players,i)=>Object.assign(data.matches[i],{participantCount:4,participants:players.map((playerId,s)=>({playerId,teamSide:s<2?1:2,playerSlot:s%2+1}))}));
}
window.__requests=[];window.__failNext=false;
window.fetch=async(url,options={})=>{
  if(url!=='/api/director/tournament-setup')throw Error('Unexpected test request');
  if(!options.method)return {ok:true,json:async()=>({data:release70?normalizeProductionTournamentSetupPayload({ok:true,data:structuredClone(data)}):structuredClone(data)})};
  const input=JSON.parse(options.body);window.__requests.push(input);
  if(window.__failNext){window.__failNext=false;return {ok:false,json:async()=>({code:'TOURNAMENT_SETUP_REVISION_STALE',error:'Fixture stale revision; selections retained.'})};}
  data.revision++;
  const rows=input.matches || [input];
  for(const row of rows){const match=data.matches.find(m=>m.matchId===row.matchId);if(!match)throw Error('Match missing');
    if(input.action==='upsert-match')Object.assign(match,{teeTime:input.teeTime,courseId:input.courseId,tee:input.tee});
    else Object.assign(match,{participants:row.participants,participantCount:row.participants.length});
    match.contextFingerprint=`saved-${data.revision}`;
  }
  return {ok:true,json:async()=>({data:{ok:true,action:input.action.toUpperCase().replaceAll('-','_'),revision:data.revision,idempotent:false,warnings:[]}})};
};
createRoot(document.getElementById('root')).render(<Panel/>);
