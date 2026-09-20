import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatHomeTime} from '../lib/home-dashboard.js';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('My Match consumes the shared formatter for stored morning/afternoon times',async()=>{
 const source=await read('app/score/MyMatchDashboard.js');assert.match(source,/formatHomeTime as formatTime/);assert.doesNotMatch(source,/function formatTime/);
 assert.equal(formatHomeTime('07:40:00'),'7:40 AM');assert.equal(formatHomeTime('14:40:00'),'2:40 PM');assert.equal(formatHomeTime('12:00:00'),'12:00 PM');assert.equal(formatHomeTime('00:05:00'),'12:05 AM');
});
test('five leader categories use one accessible rail, not the four-column grid',async()=>{
 const [source,css]=await Promise.all([read('app/live/LeaderboardsDashboard.js'),read('app/live/leaderboards-dashboard.module.css')]);assert.match(source,/ref=\{categoryRail\} className=\{styles.categoryRail\} aria-label="Leaderboard category"/);assert.match(css,/\.categoryRail\{[^}]*overflow-x:auto/);assert.match(css,/\.categoryRail button\{[^}]*min-height:44px/);assert.match(css,/\.categoryRail button:focus-visible/);assert.match(source,/item.right > bounds.right/);
});
test('side-game hole and portfolio detail keep published authority gating',async()=>{
 const s=await read('app/live/ParticipantSideGames.js');assert.match(s,/CANONICAL_PUBLISHED_PARTICIPANT_RESULT/);assert.match(s,/publicationState !== "PUBLISHED"/);assert.match(s,/Front nine/);assert.match(s,/Back nine/);assert.match(s,/aria-label="Owner portfolio"/);assert.doesNotMatch(s,/\/api\/director/);
});
test('Production scoring remains online-only and authenticated; polish cannot enable access',async()=>{
 const [page,source]=await Promise.all([read('app/score/page.js'),read('app/score/ScoreEntry.js')]);assert.match(page,/localFirstEnabled=\{previewMode && !productionShadowReadOnly\}/);assert.match(source,/saveInFlight.current/);assert.match(source,/operationRequestId/);assert.match(source,/expectedMatchRevision/);assert.match(source,/mutationIdentityRegistry\(\)\.confirm/);
});
test('standalone v6 excludes private/auth/scoring documents from offline cache',async()=>{
 const sw=await read('public/sw.js');assert.match(sw,/v6/);for(const route of ['/api','/participant-auth','/score','/game-center'])assert.ok(sw.includes(route));assert.match(sw,/offline.html/);
});
test('Home names occupy the full team width on narrow phones, not the logo column',async()=>{
 const css=await read('app/personalized-player-home.module.css');assert.match(css,/@media \(max-width: 390px\)[\s\S]*\.people > div > \.playerLines\s*\{\s*grid-column: 1 \/ -1/);
});
test('failed sign-out never clears local authority or redirects before server success',async()=>{
 const source=await read('app/me/ParticipantProfile.js');const block=source.slice(source.indexOf('const remove ='),source.indexOf('const shareApp ='));assert.ok(block.indexOf('if (!response.ok)')<block.indexOf('localStorage.removeItem'));assert.match(block,/catch \{/);assert.match(block,/setSignOutError/);assert.match(source,/<p role="alert">\{signOutError\}/);
});
test('Guide formats displayed schedule time without changing the authoritative start/end time',async()=>{
 const {itineraryViewModel}=await import('../lib/tournament-guide-schedule.js');const model=itineraryViewModel({records:[{'Event ID':'local','Event Date':'2026-09-25','Start Time':'14:10:00','End Time':'18:00:00',Title:'Round 2'}],now:new Date('2026-09-20T12:00:00Z')});
 const row=Array.isArray(model)?model[0]:model.events?.[0];assert.ok(row);assert.equal(row.startTime,'14:10:00');assert.equal(row.timeLabel,'2:10 PM – 6:00 PM');
});
test('large text can wrap tournament identity and navigation labels with matching clearance',async()=>{
 const [header,nav,global]=await Promise.all([read('app/tournament-identity-header.module.css'),read('app/participant-navigation.module.css'),read('app/globals.css')]);assert.match(header,/flex:1 1 11rem/);assert.match(nav,/\.mobile b\{white-space:normal;overflow:visible/);assert.match(global,/--participant-nav-height: max\(68px, 4.25rem\)/);
});
