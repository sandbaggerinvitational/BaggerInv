import test from 'node:test';import assert from 'node:assert/strict';
import{buildManifest}from'../tools/reliability/model-d-d10-manifest.mjs';
test('a model-only tournament cannot freeze a manifest while actual lifecycle hooks are not Queue-only',async()=>{
 for(const value of [undefined,false])await assert.rejects(()=>buildManifest({shippingAccepted:true,lifecyclePostCommitQueueOnly:value},{}),/Actual shipping after\(\) hooks must be certified Queue-only/);
});
