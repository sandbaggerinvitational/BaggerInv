// UNIT component routing proof. Virtual element evaluation, not a browser or
// physical-device claim. The independent integration suite exercises this
// transport through the actual API and PostgreSQL domain operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {transform} from 'next/dist/build/swc/index.js';
import * as models from '../lib/calcutta-management-model.js';
import {productionMatchControlActions} from '../lib/match-control-actions.js';
import {buildTournamentSetupMutation} from '../lib/production-tournament-setup-contract.js';
import {entryDraft,entrySaveRequest,entriesChanged} from '../lib/net-skins-entry-workspace.js';

const element=(type,props,...children)=>({type,props:{...props,children}});
function descendants(tree){if(!tree||typeof tree!=='object')return[];if(Array.isArray(tree))return tree.flatMap(descendants);return[tree,...descendants(tree.props?.children)];}
async function component(file,bindings,states=[]){
 let index=0,refIndex=0;const refs=[];const stateChanges=[];const effects=[];
 const key='p0f-workspace-'+randomUUID();
 const deps={React:{createElement:element},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useRef:value=>refs[refIndex++]|| (refs[refIndex-1]={current:value}),useState:value=>{const i=index++;if(states[i]===undefined)states[i]=typeof value==='function'?value():value;return[states[i],next=>{stateChanges.push([i,next]);states[i]=typeof next==='function'?next(states[i]):next;}];},...bindings};
 globalThis[key]=deps;
 let source=await readFile(new URL(file,import.meta.url),'utf8');
 source=source.replace(/^import\s+(\w+),\s*\{([^}]+)\}\s+from\s+["'][^"']+["'];\n/gm,(_,name,names)=>`const ${name}=globalThis[${JSON.stringify(key)}].${name}; const {${names}}=globalThis[${JSON.stringify(key)}];\n`)
  .replace(/^import\s+\{([\s\S]*?)\}\s+from\s+["'][^"']+["'];\n/gm,(_,names)=>`const {${names}}=globalThis[${JSON.stringify(key)}];\n`)
  .replace(/^import\s+(\w+)\s+from\s+["'][^"']+["'];\n/gm,(_,name)=>`const ${name}=globalThis[${JSON.stringify(key)}].${name};\n`);
 const output=await transform(`const React=globalThis[${JSON.stringify(key)}].React;\n`+source,{filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}},module:{type:'es6'}});
 try{return{module:await import('data:text/javascript;base64,'+Buffer.from(output.code).toString('base64')+'#'+key),effects,stateChanges,render:fn=>{index=0;refIndex=0;return fn();}};}finally{delete globalThis[key];}
}
const transport={read:async()=>({context:{tournamentId:'2026'}}),setupFetch(){},entriesRequest(){},calcuttaRequest(){}};
const bindings={createCanonicalDirectorOperationsTransport:()=>transport,ProductionTournamentSetupPanel:'setup-editor',ProductionNetSkinsEntries:'entry-editor',CalcuttaManagementEditor:'auction-editor',CanonicalDirectorMatchControls:'match-controls'};

test('UI canonical workspace supplies every existing editor its canonical transport and excludes financial configure',async()=>{
 const {module}=await component('../app/admin/director/CanonicalDirectorOperations.js',bindings,[{tournamentId:'2026'}]);
 const nodes=descendants(module.default());
 assert.equal(nodes.find(n=>n.type==='setup-editor').props.request,transport.setupFetch);assert.equal(nodes.find(n=>n.type==='setup-editor').props.isolated,true);
 assert.equal(nodes.find(n=>n.type==='entry-editor').props.transport,transport.entriesRequest);assert.equal(nodes.find(n=>n.type==='entry-editor').props.isolated,true);
 assert.equal(nodes.find(n=>n.type==='auction-editor').props.transport,transport.calcuttaRequest);assert.equal(nodes.find(n=>n.type==='auction-editor').props.auctionOnly,true);
 assert.equal(nodes.find(n=>n.type==='match-controls').props.transport,transport);
});
test('UI missing current authority renders no mutation editor and a local retry',async()=>{
 const {module}=await component('../app/admin/director/CanonicalDirectorOperations.js',bindings,[null,'Canonical authority unavailable']);const nodes=descendants(module.default());
 assert.equal(nodes.some(n=>['setup-editor','entry-editor','auction-editor','match-controls'].includes(n.type)),false);
 assert.ok(nodes.some(n=>n.props.role==='alert'));assert.ok(nodes.some(n=>n.type==='button'));
});
test('UI failed admission stays local and never invokes a different provider',async()=>{
 let calls=0;const testTransport={...transport,read:async()=>{calls++;throw new Error('Context required');}};
 const {module,effects,stateChanges}=await component('../app/admin/director/CanonicalDirectorOperations.js',{...bindings,createCanonicalDirectorOperationsTransport:()=>testTransport});module.default();effects[0]();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);assert.deepEqual(stateChanges,[[0,null],[1,'Context required']]);
});
const model={tournament_id:'2026',players:[{player_id:'P01',display_name:'Synthetic One'},{player_id:'P02',display_name:'Synthetic Two'}],purchases:[],ownership:[],point_structure:[],payout_structure:[],configuration_revision:1,auction_revision:0,publication_revision:0,publication_state:'UNPUBLISHED',currency_code:'USD',state:'CONFIGURED'};
for(const auctionOnly of [true,false])test(`UI auctionOnly=${auctionOnly} preserves only the requested financial controls`,async()=>{
 const {module}=await component('../app/admin/director/CalcuttaManagementEditor.js',{...models,styles:new Proxy({},{get:(_,k)=>String(k)})},[model,models.configurationDraft(model),null,'auction']);
 const tree=module.default({auctionOnly,transport:async()=>assert.fail('render must not mutate')});
 const text=JSON.stringify(tree);assert.equal(text.includes('Points & Payouts'),!auctionOnly);assert.ok(text.includes('Enter Auction'));
});
test('SOURCE console mounts canonical workspace and no retired route; Production defaults remain explicit',async()=>{
 const read=file=>readFile(new URL(file,import.meta.url),'utf8');
 const [consoleSource,setupSource,controlSource]=await Promise.all([read('../app/admin/director/CanonicalDirectorConsole.js'),read('../app/admin/director/ProductionTournamentSetupPanel.js'),read('../app/admin/director/CanonicalDirectorMatchControls.js')]);
 assert.match(consoleSource,/<CanonicalDirectorOperations\s*\/>/);assert.doesNotMatch(consoleSource,/\/api\/(?:director["']|scoring-authority)|googleapis|GOOGLE_/i);
 assert.match(setupSource,/request\s*=\s*fetch/);assert.match(setupSource,/isolated\s*=\s*false/);assert.doesNotMatch(setupSource,/await fetch\(ENDPOINT/);assert.match(setupSource,/await request\(ENDPOINT/);
 assert.match(controlSource,/transport\.controlRead\(/);assert.match(controlSource,/transport\.controlRequest\(/);
});


const match={matchId:'2026-R1-1',roundNumber:1,matchNumber:1,status:'UPCOMING',scoringReady:true,scoringLocked:false,permissionComplete:true,accessState:'REVOKED',matchRevision:4,permissionRevision:2};
const controlsBindings={productionMatchControlActions,styles:new Proxy({},{get:(_,k)=>String(k)})};
const buttonText=node=>JSON.stringify(node.props.children);
test('UI match review captures one UUID and exact current match revisions',async()=>{
 const {module,stateChanges}=await component('../app/admin/director/CanonicalDirectorMatchControls.js',controlsBindings,[[match],null,false,true,'',false]);
 const nodes=descendants(module.default({transport:{controlRead:async()=>({matches:[match]}),controlRequest:()=>assert.fail('review does not mutate')}}));
 const mark=nodes.find(n=>n.type==='button'&&buttonText(n).includes('Mark Live'));assert.ok(mark);assert.equal(mark.props.disabled,false);mark.props.onClick();
 const pending=stateChanges.find(([i])=>i===1)[1];assert.equal(pending.action,'mark-live');assert.equal(pending.match,match);assert.match(pending.operationRequestId,/^[a-f0-9-]{36}$/);
});
test('UI unknown match outcome exposes same-review retry and retains UUID; verified recovery clears it',async()=>{
 const pending={action:'mark-live',match,operationRequestId:'77777777-7777-4777-8777-777777777777'};
 for(const resolved of [false,true]){
  const calls=[];const {module,stateChanges}=await component('../app/admin/director/CanonicalDirectorMatchControls.js',controlsBindings,[[match],pending,false,true,'',true]);
  const nodes=descendants(module.default({transport:{controlRead:async()=>({matches:[match]}),controlRequest:async(action,input)=>{calls.push({action,input});if(!resolved)throw Object.assign(new Error('Still unknown'),{outcome:'UNKNOWN'});return{receipt:{ok:true,match_revision:5},readbackVerified:true};}}}));
  const cancel=nodes.find(n=>n.type==='button'&&buttonText(n).includes('Cancel'));assert.equal(cancel.props.disabled,true);
  const retry=nodes.find(n=>n.type==='button'&&buttonText(n).includes('Retry Same Operation'));assert.ok(retry);await retry.props.onClick();
  assert.deepEqual(calls,[{action:'mark-live',input:{match_id:match.matchId,expected_match_revision:4,expected_permission_revision:2,operationRequestId:pending.operationRequestId}}]);
  assert.equal(stateChanges.some(([i,value])=>i===1&&value===null),resolved);assert.ok(stateChanges.some(([i,value])=>i===5&&value===!resolved));
 }
});
test('SOURCE isolated profile cannot mount the Production awards editor even with stale selected section',async()=>{
 const source=await readFile(new URL('../app/admin/director/ProductionTournamentSetupPanel.js',import.meta.url),'utf8');
 assert.match(source,/SECTIONS\.filter\(\(\[id\]\) => !isolated \|\| id !== "awards"\)/);
 assert.match(source,/!isolated && section === "awards" \? <ProductionTournamentAwardsPanel/);
});


const styleBindings={styles:new Proxy({},{get:(_,k)=>String(k)})};
const setupModel={revision:4,matches:[],readiness:{state:'READY',sections:[]},capabilities:{'upsert-match':{allowed:true},'replace-pairings':{allowed:true}},audit:[]};
const setupBindings={...styleBindings,buildTournamentSetupMutation,mergePairingDrafts:()=>({}),pairingDirty:()=>false,detailsDirty:()=>false,ProductionTournamentAwardsPanel:'awards',RoundPairingWorkspace:'pairing-workspace',PairingReview:'pairing-review'};
const review={action:'update-team',values:{teamId:'TEAM_A',name:'Synthetic Team',captainPlayerId:'P01'},description:'Rename synthetic team',expectedRevision:4,operationRequestId:'77777777-7777-4777-8777-777777777777'};
test('UI isolated setup contains an unknown attempt and retries the same reviewed payload; confirmation releases containment',async()=>{
 const calls=[];let attempts=0;const request=async(url,init={})=>{calls.push({url,init});if(init.method==='POST'){attempts++;if(attempts===1)return Response.json({error:'Unknown acknowledgement',code:'DIRECTOR_OPERATIONS_UNAVAILABLE',outcome:'UNKNOWN'},{status:503});return Response.json({data:{ok:true,revision:5,action:'UPDATE_TEAM'}});}return Response.json({data:{...setupModel,revision:5}});};
 const c=await component('../app/admin/director/ProductionTournamentSetupPanel.js',setupBindings,[setupModel,'ready','','matches',review,{},1,true,null]);
 const draw=()=>descendants(c.render(()=>c.module.default({request,isolated:true})));
 let nodes=draw();await nodes.find(n=>n.type==='button'&&buttonText(n).includes('Confirm Change')).props.onClick();nodes=draw();
 assert.ok(JSON.stringify(nodes).includes('The outcome is not yet confirmed'));assert.equal(JSON.stringify(nodes).includes('No change has been made.'),false);
 const discard=nodes.find(n=>n.type==='button'&&buttonText(n).includes('Return to Editing'));assert.equal(discard.props.disabled,true);discard.props.onClick();
 assert.equal(c.stateChanges.some(([i,v])=>i===4&&v===null),false);
 assert.equal(nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.disabled,true);
 const workspace=nodes.find(n=>n.type==='pairing-workspace');assert.equal(workspace.props.disabled,true);await workspace.props.reload();workspace.props.stage('update-team',{teamId:'TEAM_A',name:'Different'},'not allowed');
 assert.equal(calls.length,1);assert.equal(c.stateChanges.some(([i,v])=>i===4&&v?.operationRequestId!==review.operationRequestId),false);
 await nodes.find(n=>n.type==='button'&&buttonText(n).includes('Retry Same Operation')).props.onClick();
 assert.deepEqual(JSON.parse(calls[0].init.body),JSON.parse(calls[1].init.body));assert.equal(calls.filter(x=>x.init.method==='POST').length,2);assert.equal(calls.length,3);
 assert.ok(c.stateChanges.some(([i,v])=>i===4&&v===null));assert.equal(draw().some(n=>n.type==='button'&&buttonText(n).includes('Retry Same Operation')),false);
});
test('UI Production setup default keeps its existing post-error editing behavior',async()=>{
 const c=await component('../app/admin/director/ProductionTournamentSetupPanel.js',setupBindings,[setupModel,'ready','','matches',review,{},1,true,null]);
 const request=async()=>Response.json({error:'Existing error'},{status:409});const draw=()=>descendants(c.render(()=>c.module.default({request})));
 await draw().find(n=>n.type==='button'&&buttonText(n).includes('Confirm Production Change')).props.onClick();const nodes=draw();
 assert.equal(nodes.find(n=>n.type==='button'&&buttonText(n).includes('Return to Editing')).props.disabled,false);
 assert.equal(nodes.some(n=>n.type==='button'&&buttonText(n).includes('Retry Same Operation')),false);
});
const entrant={key:'P01',bindingFingerprint:'b'.repeat(64),entered:false,players:[{id:'P01',name:'Synthetic One'}],teamName:'Team A',matchNumber:1};
const entryRound={roundNumber:1,format:'BB',scope:'PLAYER',configured:true,revision:2,fieldFingerprint:'a'.repeat(64),entrants:[entrant],staleEntries:[],enteredCount:0};
const entryBindings={...styleBindings,entryDraft,entrySaveRequest,entriesChanged};
test('UI isolated entry unknown outcome freezes selections and retains exact payload/UUID on retry',async()=>{
 const draft=entryDraft(entryRound);draft.entries[0].entered=true;const calls=[],pending=[];let attempt=0,saved=0;
 const c=await component('../app/admin/director/ProductionNetSkinsEntries.js',entryBindings,[draft,false,'',false,'','All']);
 const props={round:entryRound,isolated:true,onPendingChange:(...value)=>pending.push(value),onSaved:async()=>{saved++;},transport:async input=>{calls.push(input);if(++attempt===1)throw Object.assign(new Error('Unknown'),{outcome:'UNKNOWN'});return{ok:true,revision:3};}};
 const draw=()=>descendants(c.render(()=>c.module.RoundEntries(props)));await draw()[0].props.onSubmit({preventDefault(){}});let nodes=draw();
 assert.ok(nodes.filter(n=>n.type==='button'&&['["IN"]','["OUT"]'].includes(buttonText(n))).every(n=>n.props.disabled));assert.equal(nodes.find(n=>n.type==='input'&&n.props.role==='switch').props.disabled,true);
 assert.ok(nodes.find(n=>n.type==='button'&&n.props.type==='submit'&&buttonText(n).includes('Retry Same Operation')));
 await nodes[0].props.onSubmit({preventDefault(){}});assert.deepEqual(calls[1],calls[0]);assert.deepEqual(pending,[[1,true],[1,true],[1,false]]);assert.equal(saved,1);
 assert.equal(draw().find(n=>n.type==='input'&&n.props.role==='switch').props.disabled,false);
});
test('UI isolated entry workspace blocks reload and other round edits while a reviewed operation is unresolved',async()=>{
 const calls=[];const c=await component('../app/admin/director/ProductionNetSkinsEntries.js',entryBindings,[{rounds:[entryRound,{...entryRound,roundNumber:2}]},'','',0]);
 const props={isolated:true,transport:async()=>{calls.push('read');return{rounds:[entryRound]};}};const draw=()=>descendants(c.render(()=>c.module.default(props)));
 let nodes=draw();const first=nodes.find(n=>n.type===c.module.RoundEntries);first.props.onPendingChange(1,true);nodes=draw();
 const reload=nodes.find(n=>n.type==='button'&&buttonText(n).includes('Reload Saved Entries'));assert.equal(reload.props.disabled,true);reload.props.onClick();
 const rounds=nodes.filter(n=>n.type===c.module.RoundEntries);assert.equal(rounds[0].props.blocked,false);assert.equal(rounds[1].props.blocked,true);await rounds[1].props.onSaved(2);assert.equal(calls.length,0);
 rounds[0].props.onPendingChange(1,false);assert.equal(draw().find(n=>n.type==='button'&&buttonText(n).includes('Reload Saved Entries')).props.disabled,false);
});
test('UI Production entries default remains editable after a failed save',async()=>{
 const draft=entryDraft(entryRound);draft.entries[0].entered=true;const c=await component('../app/admin/director/ProductionNetSkinsEntries.js',entryBindings,[draft,false,'',false,'','All']);
 const props={round:entryRound,onSaved:async()=>{},transport:async()=>{throw new Error('Existing error');}};const draw=()=>descendants(c.render(()=>c.module.RoundEntries(props)));
 await draw()[0].props.onSubmit({preventDefault(){}});const nodes=draw();assert.equal(nodes.find(n=>n.type==='input'&&n.props.role==='switch').props.disabled,false);assert.equal(nodes.some(n=>n.type==='button'&&buttonText(n).includes('Retry Same Operation')),false);
});
test('UI auction-only unknown outcome disables discard/read, retains exact request and releases only after verified recovery',async()=>{
 const entry={...models.auctionEntry(model,'P01'),purchasePrice:'100',owners:[{buyerId:'P02',percentage:'100'}]};const calls=[];let attempts=0;
 const c=await component('../app/admin/director/CalcuttaManagementEditor.js',{...models,...styleBindings},[model,models.configurationDraft(model),entry,'auction',false,'',true,true]);
 const props={auctionOnly:true,transport:async(action,input)=>{calls.push({action,input});if(++attempts===1)throw new Error('Unknown acknowledgement');return{readbackVerified:true,receipt:{ok:true},data:model};}};
 const draw=()=>descendants(c.render(()=>c.module.default(props)));let nodes=draw();await nodes.find(n=>n.type==='button'&&buttonText(n).includes('Save Auction Entry')).props.onClick();nodes=draw();
 const discard=nodes.find(n=>n.type==='button'&&buttonText(n).includes('Discard Changes / Reload'));assert.equal(discard.props.disabled,true);discard.props.onClick();await c.effects[1]();assert.equal(calls.length,1);
 assert.ok(JSON.stringify(nodes).includes('editing and reload remain disabled'));
 await nodes.find(n=>n.type==='button'&&buttonText(n).includes('Retry same saved request')).props.onClick();assert.deepEqual(calls[1],calls[0]);
 assert.equal(draw().some(n=>n.type==='button'&&buttonText(n).includes('Retry same saved request')),false);
});
test('UI Production Calcutta default preserves the existing explicit discard option',async()=>{
 const entry={...models.auctionEntry(model,'P01'),purchasePrice:'100',owners:[{buyerId:'P02',percentage:'100'}]};
 const c=await component('../app/admin/director/CalcuttaManagementEditor.js',{...models,...styleBindings},[model,models.configurationDraft(model),entry,'auction',false,'',true,true]);const props={transport:async()=>{throw new Error('Existing error');}};
 const draw=()=>descendants(c.render(()=>c.module.default(props)));await draw().find(n=>n.type==='button'&&buttonText(n).includes('Save Auction Entry')).props.onClick();
 assert.equal(draw().find(n=>n.type==='button'&&buttonText(n).includes('Discard Changes / Reload')).props.disabled,false);
});


test('CLIENT BOUNDARY match controls import only the pure availability helper and preserve action semantics',async()=>{
 const [clientSource,helperSource,serverSource]=await Promise.all([
  readFile(new URL('../app/admin/director/CanonicalDirectorMatchControls.js',import.meta.url),'utf8'),
  readFile(new URL('../lib/match-control-actions.js',import.meta.url),'utf8'),
  readFile(new URL('../lib/production-director-console.js',import.meta.url),'utf8'),
 ]);
 assert.match(clientSource,/from "\.\.\/\.\.\/\.\.\/lib\/match-control-actions\.js"/);
 assert.doesNotMatch(clientSource,/production-director-console/);
 assert.doesNotMatch(helperSource,/^import\s|server-only|process\.env|fetch\(/m);
 assert.match(serverSource,/export \{ productionMatchControlActions \} from "\.\/match-control-actions\.js"/);
 const cases=[
  [{status:'UPCOMING'},['scoring-lock']],
  [{status:'UPCOMING',scoringReady:true,permissionComplete:true,accessState:'REVOKED'},['mark-live','scoring-lock','access-activate']],
  [{status:'LIVE',scoringLocked:true,permissionComplete:true,accessState:'REVOKED'},['scoring-unlock']],
  [{status:'FINAL',scoringLocked:true},['reopen']],
  [{status:'LIVE',permissionComplete:true,accessState:'ACTIVE',scorecardComplete:true,scoredHoles:18,unresolvedMutations:0,resultWinner:'TEAM_A'},['scoring-lock','access-revoke','finalize']],
 ];
 for(const [match,actions] of cases)assert.deepEqual(productionMatchControlActions(match),actions);
});
