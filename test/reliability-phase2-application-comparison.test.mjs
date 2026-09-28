// Proof layer: UNIT; artifact failure classification, no application or database execution.
import assert from 'node:assert/strict';
import test from 'node:test';
import {compareApplicationEvidence} from '../tools/reliability/phase2-application-comparison.mjs';
const fixture = (mode, failures = [{name:'old failure',diagnostic:'same assertion'}]) => ({
  mode,head:'184b5c65a8e63784e1af8d38121fa2e16a015628',selectionCount:493,
  manifestSha256:'a'.repeat(64),error:null,failures,
  counts:{tests:10,pass:10-failures.length,fail:failures.length,cancelled:0,skipped:0,todo:0},
});
test('unchanged failures are retained without calling the whole suite PASS',()=>{
 const result=compareApplicationEvidence(fixture('baseline'),fixture('candidate'));
 assert.equal(result.result,'NO_NEW_REGRESSIONS');assert.equal(result.candidateCounts.fail,1);
});
test('equal failure counts with a new failure name fail',()=>{
 const result=compareApplicationEvidence(fixture('baseline'),fixture('candidate',[{name:'new security failure',diagnostic:'denial missing'}]));
 assert.equal(result.result,'FAIL');assert.deepEqual(result.newFailureNames,['new security failure']);
});
test('changed failure diagnostic needs explicit review',()=>{
 const result=compareApplicationEvidence(fixture('baseline'),fixture('candidate',[{name:'old failure',diagnostic:'different assertion'}]));
 assert.equal(result.result,'REVIEW_REQUIRED');
});
test('resolved prior failure is a reviewed difference',()=>{
 assert.equal(compareApplicationEvidence(fixture('baseline'),fixture('candidate',[])).result,'REVIEW_REQUIRED');
});
test('wrong baseline SHA or selection identity is rejected',()=>{
 const before=fixture('baseline');before.head='b'.repeat(40);
 assert.throws(()=>compareApplicationEvidence(before,fixture('candidate')));
 const after=fixture('candidate');after.manifestSha256='c'.repeat(64);
 assert.throws(()=>compareApplicationEvidence(fixture('baseline'),after));
});
test('missing failed-test detail or incomplete counts is rejected',()=>{
 const after=fixture('candidate');after.failures=[];
 assert.throws(()=>compareApplicationEvidence(fixture('baseline'),after));
 after.counts.tests=NaN;assert.throws(()=>compareApplicationEvidence(fixture('baseline'),after));
});
