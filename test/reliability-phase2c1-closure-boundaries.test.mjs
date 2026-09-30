// Proof layer: SOURCE. This supplements behavioral evidence; it is not runtime certification.
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const base='4f5be5928a362f77edca375919df55be23695177';
const changed=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
test('SOURCE closure preserves shipping native and previous reliability evidence',()=>{
 assert.deepEqual(changed.filter(file=>/\.(swift|xcodeproj|xcworkspace|pbxproj)$/.test(file)),[]);
 assert.deepEqual(changed.filter(file=>/^docs\/reliability\/(?:2026-tournament-postmortem|phase1|phase2|phase2c|phase2c1)\//.test(file)),[]);
});
test('SOURCE closure branch push cannot automatically deploy a hosted candidate',()=>{
 const config=JSON.parse(readFileSync('vercel.json','utf8'));
 assert.equal(config.git.deploymentEnabled['codex/reliability-phase2c1-capability-closure'],false);
});
test('SOURCE runtime dependencies do not resurrect Google SDKs',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies}))assert.doesNotMatch(name,/^(?:googleapis|google-auth-library|google-spreadsheet|@google-cloud\/)/);
});
