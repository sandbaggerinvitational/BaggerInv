import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';

// Exercise the real installed Supabase JS SDK against an isolated Auth HTTP
// model. Hosted single-session OFF was read in the previous Production audit;
// this suite sends no network request and is not a new live multi-device login.
for(const channel of ['email','phone']) test(`${channel}: A + B + PWA, local logout isolation, explicit global revocation`,async()=>{
 const sessions=new Set(),id='11111111-1111-4111-8111-111111111111',calls=[];
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=name=>`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:id,session_id:name,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),amr:[{method:'otp'}]})}.${encode("local-test-signature")}`;
 const user={id,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',created_at:'2026-09-01T00:00:00Z',app_metadata:{provider:channel},user_metadata:{}};
 const fetch=async(url,options={})=>{
  const u=new URL(url);const h=new Headers(options.headers);const jwt=h.get('authorization')?.replace('Bearer ','');
  const sid=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')).session_id;
  calls.push([u.pathname,u.searchParams.get('scope'),sid]);
  if(u.pathname.endsWith('/logout')) {
   if(u.searchParams.get('scope')==='local')sessions.delete(sid);else sessions.clear();
   return new Response(null,{status:204});
  }
  assert.ok(u.pathname.endsWith('/user'));
  return new Response(JSON.stringify(sessions.has(sid)?user:{code:'session_not_found',msg:'Session revoked'}),{status:sessions.has(sid)?200:401,headers:{'Content-Type':'application/json'}});
 };
 const client=()=>createClient('https://synthetic.invalid','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch}});
 async function login(name) {sessions.add(name);const c=client();const r=await c.auth.setSession({access_token:token(name),refresh_token:'synthetic-'+name});assert.equal(r.error,null);return c}
 const a=await login('native-a'),b=await login('native-b'),pwa=await login('pwa');
 const valid=async(c,t)=>!(await c.auth.getUser(t)).error;
 assert.equal(await valid(a,token('native-a')),true);assert.equal(await valid(b,token('native-b')),true);assert.equal(await valid(pwa,token('pwa')),true);
 assert.equal((await pwa.auth.signOut({scope:'local'})).error,null);
 assert.equal(await valid(pwa,token('pwa')),false);assert.equal(await valid(a,token('native-a')),true);
 const pwa2=await login('pwa-2');await a.auth.signOut({scope:'local'});
 assert.equal(await valid(a,token('native-a')),false);assert.equal(await valid(b,token('native-b')),true);assert.equal(await valid(pwa2,token('pwa-2')),true);
 await b.auth.admin.signOut(token('native-b'),'global');
 assert.equal(await valid(b,token('native-b')),false);assert.equal(await valid(pwa2,token('pwa-2')),false);
 assert.deepEqual(calls.filter(c=>c[0].endsWith('/logout')).map(c=>c[1]),['local','local','global']);
});
test('normal PWA routes and failed-login cleanup explicitly use local scope; account deletion stays separate',async()=>{
 for(const path of ['app/api/participant/auth/session/route.js','app/api/player-passport/session/route.js','app/api/participant/auth/otp/verify/route.js']) {
  const source=await readFile(path,'utf8');assert.match(source,/signOut\(\{ scope: "local" \}\)/);assert.doesNotMatch(source,/scope: "global"/);
 }
 const deletion=await readFile('lib/mobile-account-deletion.js','utf8');assert.match(deletion,/auth\.admin\.deleteUser/);
});
