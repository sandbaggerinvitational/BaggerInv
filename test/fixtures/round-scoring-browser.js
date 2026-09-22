import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TournamentDayPanel} from '../../app/admin/director/ProductionDirectorOperations.js';
import fixtures from './round-scoring-states.json';
let current=structuredClone(fixtures.pristine),history=[],scenario='pristine';
window.__roundRequests=[];
function select(name){scenario=name;current=structuredClone(fixtures[name]);history=[];current.history=[];window.__roundRequests=[];sessionStorage.clear();}
function data(){return {tournament:{status:'UPCOMING',currentRound:{label:'Round '+current.round}},authority:{ingress:{label:'Supabase / current'}},tournamentDay:{available:true,mutationContract:'isolated',rounds:[{number:current.round,label:current.format==='SI'?'Singles':'Best Ball',format:current.format,status:current.summary.live?'LIVE':'UPCOMING',matches:current.matches.map((m,i)=>({id:m.matchId,matchNumber:i+1,format:current.format,status:m.status,teamOne:[{id:'SYNTHETIC-A',name:'Synthetic golfer A'}],teamTwo:[{id:'SYNTHETIC-B',name:'Synthetic golfer B'}],course:'Isolated canonical course',tee:'Tournament',teeTime:'09:00',scoredHoles:0,result:'No official result',scoringLocked:m.locked,accessState:m.accessActive?'ACTIVE':'REVOKED',warnings:[],matchRevision:m.matchRevision,permissionRevision:m.permissionRevision,actions:m.status==='UPCOMING'?['mark-live','access-activate']:m.status==='FINAL'?['reopen']:m.locked?['scoring-unlock']:['scoring-lock','access-revoke','finalize']}))}]}};}
window.fetch=async(url,options={})=>{
 if(url==='/api/director/tournament-setup')return Response.json({data:{matches:current.matches.map(m=>({matchId:m.matchId,scoringReady:m.ready,scoringReadinessReasons:m.openReasons.map(x=>x.code)}))}});
 if(!String(url).startsWith('/api/director/round-scoring?'))throw new Error('Non-fixture transport prohibited');
 if(options.method!=='POST')return Response.json({ok:true,data:{...current,history}});
 const input=JSON.parse(options.body);window.__roundRequests.push(input);
 const old=history.find(h=>h.operationId===input.operationId);
 if(old)return Response.json({ok:true,idempotent:true,receipt:old,data:{...current,history}});
 if(window.__denyNext){window.__denyNext=false;return Response.json({ok:false,code:'ROUND_STATE_CHANGED',data:fixtures.failed},{status:409});}
 const next=structuredClone(fixtures[{OPEN:'open',LOCK:'locked',RESUME:'resumed'}[input.operation]]);
 const receipt=structuredClone(next.history.find(h=>h.operation===input.operation));receipt.operationId=input.operationId;
 history=[receipt,...history];current={...next,history};
 if(window.__dropNext){window.__dropNext=false;throw new Error('Connection dropped after local commit');}
 return Response.json({ok:true,receipt,data:current});
};
function App(){const [value,setValue]=useState(data),[key,setKey]=useState(0);return <main><aside style={{background:'#fff0c2',padding:14,borderRadius:10,marginBottom:18}}><b>ISOLATED LOCAL CERTIFICATION · NO PRODUCTION CONNECTION</b><p>Real Director components; synthetic PostgreSQL readbacks. No real scoring occurs.</p>{Object.keys(fixtures).filter(x=>!['open','locked','resumed'].includes(x)).map(name=><button style={{minHeight:44,marginRight:8}} key={name} onClick={()=>{select(name);setValue(data());setKey(k=>k+1);}}>Fixture: {name}</button>)}</aside><TournamentDayPanel key={key} data={value} refresh={async()=>{setValue(data());return true;}}/></main>;}
createRoot(document.getElementById('root')).render(<App/>);
