import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {transform} from 'next/dist/build/swc/index.js';
import {entryDraft,entrySaveRequest,entriesChanged,normalizeNetSkinsEntries} from '../lib/net-skins-entry-workspace.js';
const source=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const round=(format='BB')=>{const rn={BB:1,SC:2,SI:3}[format],scope=format==='SC'?'PAIR':'PLAYER';return{
  roundNumber:rn,format,scope,revision:0,configured:false,fieldFingerprint:'a'.repeat(64),enteredCount:0,state:'NOT_CONFIGURED',staleEntries:[],
  entrants:[0,1].map(n=>({key:`R${rn}:${n}`,bindingFingerprint:String(n).repeat(64),entered:false,roundNumber:rn,format,scope,
    matchId:`2026-R${rn}-1`,matchNumber:1,playerIds:scope==='PAIR'?[`A${n}`,`B${n}`]:[`A${n}`],
    players:scope==='PAIR'?[{id:`A${n}`,name:`Alex ${n} Very Long Name`},{id:`B${n}`,name:`Partner ${n} Equally Important`}]:[{id:`A${n}`,name:`Alex ${n} Very Long Name`}],
    teamId:'TEAM1',teamName:'A Long Tournament Team Name'}))};};
test('explicit drafts never infer consent; pair selection is one entry; disabling a Round submits all OUT',()=>{
  for(const format of ['BB','SC','SI']){const r=round(format),d=entryDraft(r);assert.ok(d.entries.every(e=>!e.entered));
    assert.equal(entriesChanged(r,d),false);d.configured=true;d.entries[0].entered=true;
    const request=entrySaveRequest(r,d,'request');assert.equal(request.entries.filter(e=>e.entered).length,1);assert.equal(request.roundNumber,r.roundNumber);
    assert.equal(request.expectedRevision,0);assert.equal(request.fieldFingerprint,r.fieldFingerprint);assert.equal(entriesChanged(r,d),true);
    d.configured=false;assert.ok(entrySaveRequest(r,d,'request').entries.every(e=>!e.entered));}
});
test('safe decoder preserves identities and server facts; rejects foreign, duplicate, malformed and ambiguous fields',()=>{
  const value={contract:'production-net-skins-entries-v1',tournamentId:'2026',rounds:[round('BB'),round('SC'),round('SI')],authorization:'DO NOT EXPOSE'};
  assert.equal(normalizeNetSkinsEntries(value).rounds.length,3);assert.ok(!('authorization' in normalizeNetSkinsEntries(value)));
  assert.throws(()=>normalizeNetSkinsEntries({...value,tournamentId:'2027'}));
  assert.throws(()=>normalizeNetSkinsEntries({...value,rounds:[round(),round()]}));
  assert.throws(()=>normalizeNetSkinsEntries({...value,rounds:[{...round('SC'),scope:'PLAYER'}]}));
  const bad=round();bad.entrants[0].entered=0;assert.throws(()=>normalizeNetSkinsEntries({...value,rounds:[bad]}));
});
let Component;
async function component(){if(Component)return Component;let text=await source('app/admin/director/ProductionNetSkinsEntries.js');
  text=text.replace(/^import .*;$/gm,'').replace(/export default /g,'').replace(/export function /g,'function ');
  const compiled=await transform(text,{jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}}});
  Component=new Function('React','useState','useEffect','useRef','entryDraft','entrySaveRequest','entriesChanged','styles',`${compiled.code};return RoundEntries;`)
    (React,React.useState,React.useEffect,React.useRef,entryDraft,entrySaveRequest,entriesChanged,{});return Component;
}
for(const format of ['BB','SC','SI'])test(`${format} real entry JSX: both pair names, explicit Out, accessible labels and future Round support`,async()=>{
  const r=round(format);r.configured=true;const html=renderToStaticMarkup(React.createElement(await component(),{round:r,onSaved:()=>{}}));
  assert.match(html,new RegExp(`Round ${r.roundNumber}`));assert.match(html,/Alex 0 Very Long Name/);assert.match(html,/OUT/);
  if(format==='SC'){assert.match(html,/Partner 0 Equally Important/);assert.equal((html.match(/type="checkbox"/g)||[]).length,1);}
  assert.match(html,/aria-label=/);assert.match(html,/role="switch"/);
});
test('stale entry review and intentionally empty R3 fail closed in real JSX',async()=>{
  const r=round('SC');r.configured=true;r.staleEntries=[{...r.entrants[0],entered:true}];r.state='REVIEW_REQUIRED';
  const html=renderToStaticMarkup(React.createElement(await component(),{round:r,onSaved:()=>{}}));
  assert.match(html,/review required/);assert.match(html,/have not transferred/);assert.match(html,/I reviewed the current field/);
  const empty=round('SI');empty.entrants=[];const blank=renderToStaticMarkup(React.createElement(await component(),{round:empty,onSaved:()=>{}}));
  assert.match(blank,/Round 3 entries will be available/);assert.doesNotMatch(blank,/Save Round Entries/);
});
test('responsive controls, stable retries, isolated endpoint and calculation gate remain explicit',async()=>{
  const css=await source('app/admin/director/net-skins-entries.module.css');assert.match(css,/min-height: 44px/);assert.match(css,/flex-wrap: wrap/);assert.match(css,/overflow-wrap: anywhere/);assert.match(css,/:focus-visible/);assert.doesNotMatch(css,/overflow-x:\s*(scroll|auto)/);
  const ui=await source('app/admin/director/ProductionNetSkinsEntries.js');assert.match(ui,/retry.current.id/);assert.match(ui,/credentials:"same-origin"/);
  const route=await source('app/api/director/net-skins-entries/route.js');assert.match(route,/requireOrigin:true/);assert.match(route,/allowBootstrap:false/);assert.match(route,/production-director-entitlement/);
  assert.doesNotMatch(route,/enqueue|publishProduction|processProduction|recalculate/);
  const configure=await source('app/api/admin/production-net-skins-v1/route.js');
  assert.match(configure,/entryRevisions: input.entryRevisions/);assert.doesNotMatch(configure,/optInEntries/);
  assert.match(await source('lib/production-net-skins-server.js'),/entry_revisions: entryRevisions/);
});
