import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadDirectorSource,elements,text} from './fixtures/director-behavior.mjs';
import * as model from '../lib/calcutta-management-model.js';
import {fixture} from './calcutta-management.test.mjs';
import {createClientMutationOperationIdentityRegistry} from '../lib/client-mutation-operation-identity.js';
function stateHooks(){const cells=[];let cursor=0;return{cells,reset(){cursor=0},hooks:{useState(v){const i=cursor++;if(!(i in cells))cells[i]=typeof v==='function'?v():v;return[cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}]},useRef(v){const i=cursor++;if(!(i in cells))cells[i]={current:v};return cells[i]},useCallback:fn=>fn,useMemo:fn=>fn(),useEffect:()=>{}}};}
const css=new Proxy({},{get:(_,k)=>String(k)});
async function editorHarness(transport){const h=stateHooks();const exports=await loadDirectorSource('app/admin/director/CalcuttaManagementEditor.js',{react:h.hooks,'../../../lib/calcutta-management-model.js':model,'./calcutta-management.module.css':css});return {...h,exports,render(){h.reset();return exports.default({transport});}};}
const button=(tree,label)=>elements(tree).find(e=>e.type==='button'&&text(e)===label);
function field(tree,label,value){const e=elements(tree).find(e=>e.props?.label===label);assert.ok(e,label);e.props.onChange(value);}
function list(tree){return elements(tree).find(e=>e.props?.rows&&e.props?.onEdit);}
const fx=fixture();

test('Clear is separate, confirmation is dynamic, readback clears counts and removes control',async()=>{
 const saved={...fx,auction_revision:1,auction_fingerprint:'b'.repeat(64),publication_revision:2,purchases:[{player_id:'P2',purchase_price:'100'}],ownership:[{player_id:'P2',owner_player_id:'P3',ownership_fraction:'0.5'},{player_id:'P2',owner_player_id:'P4',ownership_fraction:'0.5'}]};let seen;
 const h=await editorHarness(async(a,p)=>{seen={a,p};return{readbackVerified:true,receipt:{ok:true},data:{...saved,auction_revision:2,purchases:[],ownership:[]}}});h.cells[0]=saved;h.cells[1]=model.configurationDraft(saved);
 list(h.render()).props.onEdit('P2');assert.ok(button(h.render(),'Clear Auction Entry'));button(h.render(),'Clear Auction Entry').props.onClick();assert.match(text(h.render()),/Clear Player 2's auction entry/);assert.match(text(h.render()),/prior auction revision will remain in audit history/);assert.match(text(h.render()),/Player 3 — 50%/);assert.match(text(h.render()),/Player 4 — 50%/);
 const confirms=elements(h.render()).filter(e=>e.type==='button'&&text(e)==='Clear Auction Entry');await confirms.at(-1).props.onClick();assert.equal(seen.a,'management-clear-entry');assert.equal(seen.p.playerId,'P2');assert.equal(seen.p.expectedAuctionRevision,1);assert.equal(h.cells[0].purchases.length,0);assert.equal(h.cells[0].ownership.length,0);assert.equal(button(h.render(),'Clear Auction Entry'),undefined);assert.match(text(h.render()),/cleared and verified/);
 list(h.render()).props.onEdit('P2');assert.equal(button(h.render(),'Clear Auction Entry'),undefined);
});
test('Clear uncertain response retains exact operation identity; Cancel performs no write',async()=>{
 const saved={...fx,auction_revision:1,auction_fingerprint:'b'.repeat(64),purchases:[{player_id:'P2',purchase_price:'100'}],ownership:[{player_id:'P2',owner_player_id:'P3',ownership_fraction:'1'}]};const calls=[];const h=await editorHarness(async(a,p)=>{calls.push({a,p});throw Error('timeout')});h.cells[0]=saved;h.cells[1]=model.configurationDraft(saved);list(h.render()).props.onEdit('P2');button(h.render(),'Clear Auction Entry').props.onClick();elements(h.render()).filter(e=>e.type==='button'&&text(e)==='Cancel').at(-1).props.onClick();assert.equal(calls.length,0);button(h.render(),'Clear Auction Entry').props.onClick();await elements(h.render()).filter(e=>e.type==='button'&&text(e)==='Clear Auction Entry').at(-1).props.onClick();await button(h.render(),'Retry same saved request').props.onClick();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].a,'management-clear-entry');
});
