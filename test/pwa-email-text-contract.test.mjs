import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ready} from './fixtures/pwa-production-phone-env.mjs';
import {participantAuthExperienceConfiguration as experience} from '../lib/participant-sms-auth-feature.js';
import {formatUsMobile} from '../lib/participant-auth-phone-input.js';
import {participantAuthEntryValidation as validate} from '../lib/participant-auth-error-presentation.js';
import {createParticipantPhoneCookieTransaction} from '../lib/participant-phone-cookie-transaction.js';
import {PRODUCTION_PHONE_IDENTITY_OPERATIONS} from '../lib/production-phone-identity-operations.js';
import {productionCurrentParticipantIdentityRpcResolution} from '../lib/production-current-participant-identity-server.js';
import {participantAuthReturnPath} from '../lib/participant-auth-return-path.js';

test('Production Text uses current Supabase authority and Email is always default',()=>{
 const e=experience(ready);assert.equal(e.smsEnabled,true);assert.equal(e.productionSmsAuthority,true);assert.equal(e.defaultMethod,'email');assert.equal(e.preview,false);
});
for(const key of ['PARTICIPANT_SMS_AUTH_ENABLED','PARTICIPANT_SMS_PROVIDER_CONFIGURED','PARTICIPANT_SMS_PRODUCTION_AUTHORITY_CONFIGURED','PARTICIPANT_PHONE_OTP_RATE_LIMIT_SECRET','PARTICIPANT_AUTH_CAPTCHA_REQUIRED','PARTICIPANT_AUTH_CAPTCHA_CONFIGURED','NEXT_PUBLIC_PARTICIPANT_AUTH_TURNSTILE_SITE_KEY','PRODUCTION_CUTOVER_ACTIVATION_ENABLED'])test(`Text fails closed without ${key}; never changes Email default`,()=>{
 const e=experience({...ready,[key]:''});assert.equal(e.smsEnabled,false);assert.equal(e.defaultMethod,'email');
});
test('US paste +1 and 11 digits normalize for display without truncating another number',()=>{
 for(const value of ['2025550123','+1 (202) 555-0123','12025550123'])assert.equal(formatUsMobile(value),'(202) 555-0123');
 for(const value of ['+44 20 7946 0123','202555012345','2025550123 ext 4']){assert.equal(formatUsMobile(value),value);assert.ok(validate('phone',formatUsMobile(value)));}
 assert.equal(validate('phone',formatUsMobile('+1 2025550123')),null);
});
test('provider session cookie changes remain withheld until explicit canonical completion',()=>{
 const original=[{name:'unrelated',value:'preserved'}],writes=[];
 const t=createParticipantPhoneCookieTransaction({getAll:()=>original,set:()=>assert.fail('must never write original')});
 t.store.set('session','synthetic',{httpOnly:true});assert.equal(writes.length,0);assert.equal(original.length,1);assert.equal(t.store.getAll().length,2);
 t.commit({cookies:{set:(...v)=>writes.push(v)}});assert.equal(writes.length,1);assert.throws(()=>t.commit({}),/ALREADY_COMMITTED/);
});
test('abandoned/failed cookie transaction cannot leak a newly verified session',()=>{
 const writes=[];const t=createParticipantPhoneCookieTransaction({getAll:()=>[],set:(...a)=>writes.push(a)});t.store.set('session','synthetic',{});assert.deepEqual(writes,[]);
});
test('every phone lifecycle operation resolves to explicit Production RPC, never Preview Director',()=>{
 for(const [logical,expected] of Object.entries(PRODUCTION_PHONE_IDENTITY_OPERATIONS)){
  const r=productionCurrentParticipantIdentityRpcResolution({logicalFunctionName:logical,frozenFunctionName:'forbidden_preview',runtime:{tournamentId:'2026',tournamentYear:2026,lifecycle:'ACTIVE',status:'FROZEN_2026_RUNTIME',pointerRevision:1}});assert.equal(r.functionName,expected);assert.match(r.functionName,/production/);
 }
});
for(const dest of ['/home','/my-match','/app/tournament','/app/leaderboards','/app/leaderboards?tab=skins','/app/leaderboards?tab=calcutta','/app/players/CB01'])test(`shared internal auth return: ${dest}`,()=>assert.equal(participantAuthReturnPath(dest),dest));
test('Email request/verify source remains byte-identical to Phase 2; no native change',async()=>{
 for(const file of ['app/api/participant/auth/otp/request/route.js','app/api/participant/auth/otp/verify/route.js'])assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex'),{"app/api/participant/auth/otp/request/route.js": "b638c91b7fdb52eed1d1ce8599e699f5c792056037b8bf5039d06c254b3b4890", "app/api/participant/auth/otp/verify/route.js": "b0e7d123b741d6a22554c5ce8e647815d0ae121608013d9ef7e98af19ac38aa8"}[file]);
});
