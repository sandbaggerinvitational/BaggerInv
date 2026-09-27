import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../supabase/production_migrations/'+p,import.meta.url),'utf8');
const next=read('202609270120_bounded_late_r3_result_compatibility_v1.sql');
const before=read('202609090097_production_late_r3_initialization_v1.sql');
const norm=x=>x.replace(/\s+/g,' ').trim().toLowerCase();
test('bounded eligibility gate retains every original compatibility predicate',()=>{
 const prior=before.slice(before.indexOf('create function production_control.late_r3_result_compatible_v1('));
 const body=prior.slice(prior.indexOf('select exists('),prior.indexOf('$$;',prior.indexOf('select exists('))).trim().replace(/;$/,'');
 const after=next.slice(next.indexOf('return exists(')+'return '.length,next.indexOf(';\nend;'));
 assert.equal(norm(after),norm(body.slice('select '.length)));
 assert.match(next,/if not exists[\s\S]*return false;[\s\S]*end if;[\s\S]*return exists/);
 assert.match(next,/LANGUAGE plpgsql[\s\S]*STABLE SECURITY DEFINER[\s\S]*SET search_path TO 'pg_catalog'/);
});
test('repair changes one private predicate without writes, grants, triggers or timeout overrides',()=>{
 assert.equal((next.match(/CREATE OR REPLACE FUNCTION/gi)||[]).length,1);
 assert.doesNotMatch(next,/\b(insert into|update |delete from|grant |revoke |alter table|disable trigger|set statement_timeout)\b/i);
});
