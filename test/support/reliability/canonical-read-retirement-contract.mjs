// UNIT contract: provider retirement changes selection, not resource admission.
import assert from 'node:assert/strict';
export const canonicalReadFixture = Object.freeze({
 VERCEL_ENV:'preview', SUPABASE_SCORING_MIRROR_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',
 SUPABASE_SCORING_MIRROR_SECRET_KEY:'synthetic-server-secret', SUPABASE_SCORING_MIRROR_ENABLED:'true',
 NEXT_PUBLIC_SUPABASE_AUTH_URL:'https://idgigvjjqkfbqjeredpb.supabase.co',
 NEXT_PUBLIC_SUPABASE_AUTH_PUBLISHABLE_KEY:'synthetic-public-key', SCORING_AUTHORITY:'supabase',
});
export function assertCanonicalReadRetirementContract(select, variable, additions={}) {
 const env={...canonicalReadFixture,...additions};
 assert.equal(Object.keys(env).some(key=>/GOOGLE|SHEET|DRIVE/.test(key)),false);
 for(const selector of [undefined,'supabase']) {
  const state=select({...env,[variable]:selector});
  assert.equal(state.resolved,'supabase');assert.equal(state.blocked,false);
 }
 for(const selector of ['google','passport','application','typo']) {
  const state=select({...env,[variable]:selector});
  assert.equal(state.resolved,'unavailable');assert.equal(state.blocked,true);
 }
 for(const url of ['https://wrong.supabase.co','https://idgigvjjqkfbqjeredpb.supabase.co.evil.example',
  'http://idgigvjjqkfbqjeredpb.supabase.co','https://user:password@idgigvjjqkfbqjeredpb.supabase.co',
  'https://idgigvjjqkfbqjeredpb.supabase.co/rest/v1']) {
  assert.equal(select({...env,SUPABASE_SCORING_MIRROR_URL:url}).blocked,true);
 }
 assert.equal(select({...env,SUPABASE_SCORING_MIRROR_SECRET_KEY:''}).blocked,true);
 assert.equal(select({...env,VERCEL_ENV:'production'}).resolved,'unavailable');
 assert.equal(select({...env,VERCEL_ENV:'production'}).blocked,true);
 // Public/browser configuration cannot select a retired server authority.
 assert.equal(select({...env,[`NEXT_PUBLIC_${variable}`]:'google'}).resolved,'supabase');
}
