import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteMobileAccount } from '../lib/mobile-account-deletion.js';
const user = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const request = new Request('https://baggerinv.com/api/mobile/v1/account/deletion', {headers:{authorization:'Bearer synthetic-test-token'}});
const input = {requestId, confirmation:'DELETE_ACCOUNT'};
function fixture(status = 'READY', options = {}) {
  const calls = [];
  let deleted = false;
  return {calls, dependencies: {
    verifyUser: async () => ({status:'active',authUserId:user}),
    adminClient: {
      rpc: async (name,args) => {
        calls.push({name,args});
        if (name === 'initiate_account_deletion_v1') return {data:{requestId,status: options.afterFailure && calls.some(c=>c.name==='delete') ? options.afterFailure : status,completed:false}};
        return {data:{requestId,status: deleted && !options.badReceipt ? 'COMPLETED':'READY',completed: deleted && !options.badReceipt}};
      },
      auth:{admin:{deleteUser:async(id,soft)=>{calls.push({name:'delete',id,soft});deleted=!options.failure;return {error:options.failure};}}},
    },
  }};
}
test('normal deletion requires provider success and canonical completion receipt',async()=>{
  const f=fixture();const result=await deleteMobileAccount({request,input},f.dependencies);
  assert.equal(result.data.completed,true);
  assert.deepEqual(f.calls.map(c=>c.name),['initiate_account_deletion_v1','delete','read_account_deletion_receipt_v1']);
  assert.equal(f.calls[0].args.target_auth_user_id,user);assert.equal(f.calls[1].soft,false);
});
for(const status of ['PENDING_ADMINISTRATIVE_HANDOFF','PENDING_REVIEW_ACCESS_HANDOFF']) test(`${status} does not invoke provider or revoke access`,async()=>{
  const f=fixture(status);const result=await deleteMobileAccount({request,input},f.dependencies);
  assert.equal(result.data.status,status);assert.equal(result.data.completed,false);assert.equal(f.calls.length,1);
});
test('late protection change is reflected after provider rejects transactional deletion',async()=>{
  const f=fixture('READY',{failure:true,afterFailure:'PENDING_REVIEW_ACCESS_HANDOFF'});
  const result=await deleteMobileAccount({request,input},f.dependencies);
  assert.equal(result.data.status,'PENDING_REVIEW_ACCESS_HANDOFF');assert.equal(result.data.completed,false);
});
test('provider failure is retryable and never success',async()=>{
  const f=fixture('READY',{failure:true});const result=await deleteMobileAccount({request,input},f.dependencies);
  assert.equal(result.data.status,'RETRY_REQUIRED');assert.equal(result.data.completed,false);
});
test('provider success alone cannot certify deletion',async()=>{
  const f=fixture('READY',{badReceipt:true});
  await assert.rejects(()=>deleteMobileAccount({request,input},f.dependencies),e=>e.code==='MOBILE_API_UNAVAILABLE');
});
test('client cannot select identity, reviewer protection or another account',async()=>{
  for(const extra of [{authUserId:user},{activeOwner:false},{soleProtectedReviewer:false},{accountKind:'participant'}]){
    const f=fixture();await assert.rejects(()=>deleteMobileAccount({request,input:{...input,...extra}},f.dependencies),e=>e.code==='INVALID_AUTH_REQUEST');assert.equal(f.calls.length,0);
  }
});
test('missing, expired and invalid authentication never reach deletion authority',async()=>{
  for(const status of ['invalid','unavailable']){
    const f=fixture();f.dependencies.verifyUser=async()=>({status,authUserId:user});
    await assert.rejects(()=>deleteMobileAccount({request,input},f.dependencies));assert.equal(f.calls.length,0);
  }
  const f=fixture();await assert.rejects(()=>deleteMobileAccount({request:new Request('https://baggerinv.com'),input},f.dependencies));assert.equal(f.calls.length,0);
});
