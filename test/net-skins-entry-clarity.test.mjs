import test from 'node:test';import assert from 'node:assert/strict';
import {loadDirectorSource,elements,text} from './fixtures/director-behavior.mjs';
import * as workspace from '../lib/net-skins-entry-workspace.js';
function field(pair=false){return {roundNumber:pair?2:1,scope:pair?'PAIR':'PLAYER',format:pair?'SC':'BB',revision:0,configured:false,fieldFingerprint:'a'.repeat(64),enteredCount:0,state:'NOT_CONFIGURED',staleEntries:[],entrants:Array.from({length:pair?12:24},(_,i)=>({key:`entry-${i}`,bindingFingerprint:'b'.repeat(64),entered:false,matchNumber:Math.floor(i/(pair?2:4))+1,teamName:'Fixture Team',players:Array.from({length:pair?2:1},(_,j)=>({id:`P${i}-${j}`,name:`Golfer ${i}-${j}`}))}))};}
async function harness(round,frozen=false){let cursor=0;const cells=[],calls=[];const hooks={useState:initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>cells[i]=typeof value==='function'?value(cells[i]):value]},useRef:value=>{const i=cursor++;return cells[i]??(cells[i]={current:value})},useEffect:()=>{}};
 const module=await loadDirectorSource('app/admin/director/ProductionNetSkinsEntries.js',{'react':hooks,'../../../lib/net-skins-entry-workspace.js':workspace,'./net-skins-entries.module.css':{}});
 return {calls,render(){cursor=0;return module.RoundEntries({round,frozen,onSaved:async()=>{},transport:async body=>{calls.push(body);return {}}})}};}
const find=(tree,predicate)=>elements(tree).find(predicate);
for(const pair of [false,true])test(`${pair?'12 canonical pairs':'24 canonical golfers'}: local enable, explicit state, exact save bindings, no automatic consent`,async()=>{
 const h=await harness(field(pair));let tree=h.render();assert.match(text(tree),/New entries start OUT/);
 find(tree,e=>e.props?.role==='switch').props.onChange({target:{checked:true}});tree=h.render();assert.equal(h.calls.length,0);
 const groups=elements(tree).filter(e=>e.props?.role==='group'&&e.props['aria-label'].includes('participation'));
 assert.equal(groups.length,pair?12:24);assert.ok(groups.every(g=>find(g,e=>e.type==='button'&&text(e)==='OUT').props['aria-pressed']));
 find(groups[0],e=>e.type==='button'&&text(e)==='IN').props.onClick();tree=h.render();
 await tree.props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,1);const body=h.calls[0];assert.equal(body.entries.filter(e=>e.entered).length,1);assert.equal(body.entries.length,pair?12:24);assert.equal(body.expectedRevision,0);assert.equal(body.fieldFingerprint,'a'.repeat(64));assert.ok(body.operationRequestId);assert.equal(body.action,undefined);
 assert.deepEqual(Object.keys(body.entries[0]).sort(),['bindingFingerprint','entered','key']);
});
test('filter/search never delete hidden entries from save; disabled round saves all OUT',async()=>{
 const h=await harness(field());find(h.render(),e=>e.props?.role==='switch').props.onChange({target:{checked:true}});
 let tree=h.render();find(tree,e=>e.type==='input'&&e.props.type==='search').props.onChange({target:{value:'Golfer 1-0'}});
 tree=h.render();assert.equal(elements(tree).filter(e=>e.props?.role==='group'&&e.props['aria-label'].includes('participation')).length,1);
 find(tree,e=>e.type==='button'&&text(e)==='IN').props.onClick();find(h.render(),e=>e.props?.role==='switch').props.onChange({target:{checked:false}});
 await h.render().props.onSubmit({preventDefault(){}});assert.equal(h.calls[0].entries.length,24);assert.ok(h.calls[0].entries.every(e=>!e.entered));
});
test('configured round visibly frozen and submit handler cannot write',async()=>{
 const r=field(true);r.configured=true;const h=await harness(r,true),tree=h.render();assert.match(text(tree),/Configured · entries frozen/);assert.equal(find(tree,e=>e.props?.role==='switch').props.disabled,true);
 for(const g of elements(tree).filter(e=>e.props?.role==='group'&&e.props['aria-label'].includes('participation')))assert.ok(elements(g).filter(e=>e.type==='button').every(e=>e.props.disabled));
 await tree.props.onSubmit({preventDefault(){}});assert.equal(h.calls.length,0);
});
test('Reload Saved Entries resets draft keys even at identical revision; saving one round preserves other draft keys',async()=>{
 let cursor=0;const cells=[],effects=[];const hooks={useState:initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>cells[i]=typeof value==='function'?value(cells[i]):value]},useEffect:fn=>effects.push(fn),useRef:v=>({current:v})};
 const module=await loadDirectorSource('app/admin/director/ProductionNetSkinsEntries.js',{'react':hooks,'../../../lib/net-skins-entry-workspace.js':workspace,'./net-skins-entries.module.css':{}});
 let rounds=[field(),field(true)];const transport=async()=>({rounds:structuredClone(rounds)});const render=()=>{cursor=0;return module.default({transport})};render();effects[0]();await new Promise(resolve=>setImmediate(resolve));
 const children=tree=>elements(tree).filter(e=>e.type===module.RoundEntries);let tree=render();const keys=children(tree).map(e=>e.props.key);
 const previous=globalThis.confirm;globalThis.confirm=()=>true;
 try{find(tree,e=>e.type==='button'&&text(e)==='Reload Saved Entries').props.onClick();await new Promise(resolve=>setImmediate(resolve));}finally{globalThis.confirm=previous}
 tree=render();const reloaded=children(tree).map(e=>e.props.key);assert.ok(reloaded.every((key,i)=>key!==keys[i]));
 rounds[0].revision=1;await children(tree)[0].props.onSaved(1);tree=render();const saved=children(tree).map(e=>e.props.key);assert.notEqual(saved[0],reloaded[0]);assert.equal(saved[1],reloaded[1]);
});
