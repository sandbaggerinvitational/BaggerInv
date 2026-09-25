import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const base=new URL('../supabase/production_migrations/',import.meta.url);
const patch=readFileSync(new URL('202609250118_production_first_write_audit_revision_v1.sql',base),'utf8');
test('first-write repair is observation-only and preserves every security and audit condition',()=>{
 const old=readFileSync(new URL('202608240019_production_cutover_activation.sql',base),'utf8');
 const start=old.indexOf('create or replace function production_control.capture_first_production_canonical_write()');
 const original=old.slice(start,old.indexOf('$$;',old.indexOf('as $$',start))+3);
 const body=s=>s.slice(s.indexOf('declare'),s.lastIndexOf('end;')+4).replaceAll(/\s+/g,' ').trim();
 assert.equal(body(patch),body(original).replace('set activation_revision = activation_revision + 1, first_supabase_write_observed_at','set first_supabase_write_observed_at'));
 assert.equal((patch.match(/CREATE OR REPLACE FUNCTION/gi)||[]).length,1);
 assert.doesNotMatch(patch,/\b(?:grant|disable trigger|delete from|alter table)\b/i);
 assert.match(patch,/first_supabase_write_observed_at is null/);
 assert.match(patch,/FIRST_SUPABASE_CANONICAL_WRITE_OBSERVED/);
});
