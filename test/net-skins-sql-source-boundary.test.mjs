import test from 'node:test';import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import fs from'node:fs';
const base='f41a09a2b06f27147faf93721e8377878f6bdf1d',allowed='supabase/production_incremental/net-skins-sql-expressions-v1.sql';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20e6});
test('Release 134 application, guards, Calcutta, Odds and participant runtime remain byte-identical',()=>{
 for(const line of git('ls-tree','-rz',base).split('\0').filter(Boolean)){const [meta,path]=line.split('\t');assert.equal(git('hash-object',path).trim(),meta.split(' ')[2],path);}
 for(const path of git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean)){
  if(path.startsWith('test/')||path.startsWith('docs/')||path===allowed)continue;
  assert.ok(git('ls-tree',base,'--',path).trim(),`unrelated runtime addition: ${path}`);
 }
});
test('incremental installer is pinned and only replaces invalid Net Skins expression qualifiers',()=>{
 const s=fs.readFileSync(allowed,'utf8').replace(/^--.*$/gm,'');assert.equal((s.match(/signature :=/g)||[]).length,3);
 assert.doesNotMatch(s,/\b(insert|update|delete|truncate|grant|revoke|create table|alter table)\b/i);
 assert.equal((s.match(/execute d;/g)||[]).length,3);assert.equal((s.match(/pg_catalog\.least\('/g)||[]).length,3);
 assert.match(s,/SOURCE_MISMATCH/);assert.match(s,/RESULT_MISMATCH/);assert.ok(s.trim().endsWith('commit;'));
});
