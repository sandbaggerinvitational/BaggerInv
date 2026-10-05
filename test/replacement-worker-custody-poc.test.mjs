import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign, verify} from 'node:crypto';
import {createLocalCustodyModel,FIXED} from '../tools/reliability/poc/replacement-worker-custody.mjs';

const adapter=()=>({tick:async()=>({ok:true,ready:{CALCUTTA:false,COMPETITION:true,INTELLIGENCE:true}}),
  processors:{CALCUTTA:async()=>assert.fail('financial work outside scope'),COMPETITION:async()=>({ok:true}),
    INTELLIGENCE:async()=>({ok:true})}});
function active(options={}) {const m=createLocalCustodyModel(options);m.start(m.owner,{expiresAt:Date.now()+60_000,budget:3});return m;}

test('asymmetric custody: public verification material cannot sign; captured signed ticket can win first use',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const body=Buffer.from(JSON.stringify({method:'POST',path:'/api/internal/derived-worker/run',
    ...FIXED,reservation:'LOCAL_SYNTHETIC_RESERVATION',expiresAt:30_000}));
  const signature=sign(null,body,privateKey);
  assert.equal(verify(null,body,publicKey,signature),true);
  assert.equal(verify(null,Buffer.from('altered'),publicKey,signature),false);
  assert.throws(()=>sign(null,body,publicKey));
  let consumed=false;
  const consume=()=>{assert.equal(verify(null,body,publicKey,signature),true);if(consumed)return false;consumed=true;return true;};
  assert.equal(consume(),true,'captured valid request can preplay before legitimate dispatcher');
  assert.equal(consume(),false,'single use stops second use, not first-use theft');
});

test('OFF is default and denies modeled private queue reservation',()=>{
  const m=createLocalCustodyModel();assert.equal(m.status(m.owner).state,'OFF');
  assert.throws(()=>m.reserve(m.platform),/SUPERVISOR_DORMANT/);
});
for(const actor of ['participant','anon','authenticated','service_role']) {
  test(`${actor} cannot START, STOP, STATUS, reserve, or deliver through modeled boundary`,async()=>{
    const m=active(),ticket=m.reserve(m.platform);
    assert.throws(()=>m.start(actor,{expiresAt:Date.now()+1000}),/OWNER_DENIED/);
    assert.throws(()=>m.stop(actor),/OWNER_DENIED/);assert.throws(()=>m.status(actor),/OWNER_DENIED/);
    assert.throws(()=>m.reserve(actor),/PRIVATE_QUEUE_REQUIRED/);
    await assert.rejects(m.deliver(actor,ticket,adapter()),/PRIVATE_QUEUE_REQUIRED/);
  });
}
test('existing worker engine executes exactly one modeled tick and both nonfinancial processors',async()=>{
  const m=active(),ticket=m.reserve(m.platform);let ticks=0,competition=0,intelligence=0;
  const a=adapter();a.tick=async()=>{ticks++;return {ok:true,ready:{CALCUTTA:false,COMPETITION:true,INTELLIGENCE:true}};};
  a.processors.COMPETITION=async()=>{competition++;return {ok:true};};
  a.processors.INTELLIGENCE=async()=>{intelligence++;return {ok:true};};
  assert.deepEqual(await m.deliver(m.platform,ticket,a),{outcome:'SUCCEEDED',cycles:1});
  assert.deepEqual([ticks,competition,intelligence],[1,1,1]);
  await assert.rejects(m.deliver(m.platform,ticket,a),/REPLAY_DENIED/);assert.equal(ticks,1);
});
test('modeled SQL ledger stores only a single-use proof digest; no raw proof/key in status',()=>{
  const m=active(),ticket=m.reserve(m.platform), row=m.durable.ledger.get(ticket.id);
  assert.equal(JSON.stringify(row).includes(ticket.proof),false);
  assert.equal(JSON.stringify(m.status(m.owner)).includes(ticket.proof),false);
  assert.deepEqual(Object.keys(row).sort(),['epoch','expiresAt','proofHash','state']);
});
for(const [key,value] of Object.entries({resource:'PRODUCTION:foreign',project:'foreign',deployment:'dpl_foreign',
  release:'foreign',environment:'production',generation:'stale'})) {
  test(`${key} drift denied before worker`,async()=>{
    const m=active(),ticket=m.reserve(m.platform);ticket.binding[key]=value;
    await assert.rejects(m.deliver(m.platform,ticket,adapter()),/BINDING_DENIED/);
    assert.equal(m.durable.ledger.get(ticket.id).state,'RESERVED');
  });
}
test('extra client target field denied',async()=>{
  const m=active(),ticket=m.reserve(m.platform);ticket.binding.url='https://foreign.invalid';
  await assert.rejects(m.deliver(m.platform,ticket,adapter()),/BINDING_DENIED/);
});
test('simulated public HTTP headers cannot fabricate modeled native authority',async()=>{
  const m=active(),ticket=m.reserve(m.platform);
  await assert.rejects(m.deliver({'x-vercel-queue':'true'},ticket,adapter()),/PRIVATE_QUEUE_REQUIRED/);
});
test('wrong reservation proof denied',async()=>{
  const m=active(),ticket=m.reserve(m.platform);ticket.proof='0'.repeat(64);
  await assert.rejects(m.deliver(m.platform,ticket,adapter()),/RESERVATION_DENIED/);
});
test('expired reservation denied',async()=>{
  let now=Date.now();const m=active({clock:()=>now}),ticket=m.reserve(m.platform);now+=30_001;
  await assert.rejects(m.deliver(m.platform,ticket,adapter()),/RESERVATION_DENIED/);
});
test('budget is finite',()=>{
  const m=active();for(let i=0;i<3;i++)m.reserve(m.platform);
  assert.throws(()=>m.reserve(m.platform),/SUPERVISOR_DORMANT/);
});
test('STOP blocks pending invocation without erasing ledger evidence',async()=>{
  const m=active(),ticket=m.reserve(m.platform);m.stop(m.owner);
  await assert.rejects(m.deliver(m.platform,ticket,adapter()),/SUPERVISOR_DORMANT/);
  assert.equal(m.durable.ledger.get(ticket.id).state,'RESERVED');
});
test('same reservation contention runs existing engine once',async()=>{
  const m=active(),ticket=m.reserve(m.platform);let ticks=0;
  const a=adapter();a.tick=async()=>{ticks++;await new Promise(r=>setTimeout(r,5));return {ok:true,ready:{CALCUTTA:false}};};
  const r=await Promise.allSettled([m.deliver(m.platform,ticket,a),m.deliver(m.platform,ticket,a)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(ticks,1);
});
test('new modeled process observes durable outcome and cannot replay it',async()=>{
  const m=active(),ticket=m.reserve(m.platform);await m.deliver(m.platform,ticket,adapter());
  const restarted=createLocalCustodyModel({durable:m.durable});
  await assert.rejects(restarted.deliver(restarted.platform,ticket,adapter()),/REPLAY_DENIED/);
  assert.equal(restarted.status(restarted.owner).invocations[0].state,'SUCCEEDED');
});
test('new epoch revokes old reservation',async()=>{
  const m=active(),ticket=m.reserve(m.platform);m.stop(m.owner);m.start(m.owner,{expiresAt:Date.now()+60_000});
  await assert.rejects(m.deliver(m.platform,ticket,adapter()),/RESERVATION_DENIED/);
});
