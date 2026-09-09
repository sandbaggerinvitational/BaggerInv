import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {bestBallView,bestBallRows} from './fixtures/best-ball-decimal-handicaps.mjs';
import {scrambleView,expectedScramble} from './fixtures/match-center-handicaps.mjs';
import {tournamentLiveDataFromSupabaseView as project} from '../lib/tournament-live-supabase.js';
import {formatHandicap,playerDisplayHandicap} from '../lib/formatters.js';
import {courseHandicap,allocateStrokes} from '../lib/prediction-engine.js';

const display = view => project(view,{matchCenterHandicapPresentation:true});
const players = match => [...match.team1Players,...match.team2Players];
const stripDisplay = data => JSON.parse(JSON.stringify(data,(key,value)=>key==='displayHandicap'?undefined:value));

test('all 24 R1 labels retain meaningful Course Handicap decimals; integer PH and every hole stroke are unchanged',()=>{
  const view=bestBallView(),before=structuredClone(view), normal=project(view), web=display(view);
  assert.deepEqual(stripDisplay(web),normal);
  web.rounds[0].matches.forEach((m,i)=>players(m).forEach((p,j)=>{
    const row=bestBallRows[i][j],old=players(normal.rounds[0].matches[i])[j];
    assert.equal(formatHandicap(playerDisplayHandicap(p)),row[4],p.id);
    assert.equal(p.playingHcp,row[2]);assert.ok(Number.isInteger(p.playingHcp));assert.equal(p.stroke,row[3]);
    const holes=view.matches[i].snapshot.hole_definitions.map(h=>({'Stroke Index':h.stroke_index}));
    assert.deepEqual(allocateStrokes(p.stroke,holes),allocateStrokes(old.stroke,holes));
  }));
  assert.deepEqual(view,before,'read-only; no pairing or scoring preparation');
});

test('release73 regression: Clay was incorrectly 15.0, corrected 14.6, PH15 and strokes14 untouched',()=>{
  const view=bestBallView();
  const old=players(project(view).rounds[0].matches[3]).find(p=>p.id==='CB01');
  const fixed=players(display(view).rounds[0].matches[3]).find(p=>p.id==='CB01');
  assert.equal(formatHandicap(old.playingHcp),'15.0');
  assert.equal(formatHandicap(playerDisplayHandicap(fixed)),'14.6');
  assert.notEqual(formatHandicap(old.playingHcp),formatHandicap(playerDisplayHandicap(fixed)));
  assert.equal(fixed.playingHcp,15);assert.equal(fixed.stroke,14);
});

test('historical PWA evidence used full CH, not 90% CH or integer PH; legacy presentation remains compatible',()=>{
  // Retained workbook revisions 5143/5146, Round Handicaps + Live Matches.
  // [format, historical Hybrid H, rating, slope, actual legacy Playing HCP]
  for(const [format,h,rating,slope,legacy] of [
    ['BB',11.1,71.9,136,13.3],['BB',7.65,71.9,136,9.1],['BB',10.75,71.9,136,12.8],
    ['BB',-.6,71.9,136,-.8],['SI',11.1,74.7,150,17.4],['SI',12.2,74.7,150,18.9],
  ]) {
    const ch=courseHandicap(h,rating,slope,72);
    assert.equal(formatHandicap(ch),formatHandicap(playerDisplayHandicap({playingHcp:legacy})),format);
    assert.notEqual(formatHandicap(ch*.9),formatHandicap(legacy));
  }
  const source=execFileSync('git',['show','2f35fc8:lib/stats.js'],{encoding:'utf8'});
  assert.ok(source.includes('playingHcp: validNumber(match[`Team 1 Player ${index + 1} Playing HCP`])'));
  assert.ok(source.includes('playingHcp: validNumber(match[`Team 2 Player ${index + 1} Playing HCP`])'));
});

test('existing display rounding and parentheses are preserved; explicit unavailable cannot fall back to integer',()=>{
  for(const [n,label] of [[7.84,'7.8'],[7.85,'7.8'],[0,'0.0'],[-.8,'(0.8)']])
    assert.equal(formatHandicap(playerDisplayHandicap({displayHandicap:n,playingHcp:99})),label);
  assert.equal(formatHandicap(playerDisplayHandicap({displayHandicap:null,playingHcp:15})),'—');
});

test('missing/conflicting/stale/unpaired inputs fail closed without changing official PH/strokes',()=>{
  for(const change of [v=>v.matches[0].participants.pop(),v=>v.matches[0].holes=[{hole_number:1,par:4,stroke_index:9}],
    v=>v.matches[1].snapshot.rating=72,v=>v.matches[0].participants[0].course_handicap=null,
    v=>v.matches[0].participants[0].course_handicap=999,v=>v.players[0].tournament_source_payload={},
    v=>v.players[0].participation_status='INACTIVE',v=>v.players[0].team_id='OTHER',
    v=>v.matches[0].participants[1].player_id=v.matches[0].participants[0].player_id,
    v=>v.matches[0].match.status='LIVE',v=>v.matches[0].scores.push({hole_number:1}),
    v=>{v.matches[0].snapshot.handicap_revision_id='prepared';v.matches[0].snapshot.participant_configuration={all_ids:['WRONG']};},
    v=>v.matches[0].snapshot.hole_definitions[0].stroke_index=10,
  ]) {
    const view=bestBallView();change(view);
    const actual=display(view);assert.ok(players(actual.rounds[0].matches[0]).every(p=>p.displayHandicap===null),change.toString());
    assert.deepEqual(stripDisplay(actual),project(view));
  }
});

test('prepared contexts retain frozen Course Handicap; no current approved substitution',()=>{
  const view=bestBallView(),e=view.matches[0];e.match.status='LIVE';
  e.holes=structuredClone(e.snapshot.hole_definitions);e.snapshot.handicap_revision_id='prepared';
  const frozen=e.participants.map(p=>({id:p.player_id,team:p.team_side,slot:p.player_slot,course_handicap:p.course_handicap}));
  e.snapshot.participant_configuration={all_ids:frozen.map(p=>p.id),team_1:frozen.slice(0,2),team_2:frozen.slice(2)};
  view.players[0].tournament_source_payload['Tournament Handicap']=40;
  assert.equal(players(display(view).rounds[0].matches[0])[0].displayHandicap,e.participants[0].course_handicap);
  frozen[0].course_handicap+=1;
  assert.ok(players(display(view).rounds[0].matches[0]).every(p=>p.displayHandicap===null));
});

test('Singles uses same full-CH meaning only when paired; Scramble release73 remains exact; native/default isolation',()=>{
  const view=bestBallView();view.matches=view.matches.slice(0,1);const e=view.matches[0];
  e.match.format=e.snapshot.format='SI';e.participants=[e.participants[0],e.participants[2]];
  assert.equal(players(display(view).rounds[0].matches[0])[0].displayHandicap,e.participants[0].course_handicap);
  e.participants=[];assert.deepEqual(players(display(view).rounds[0].matches[0]),[]);
  const sc=scrambleView();
  assert.deepEqual(display(sc).rounds[0].matches.map(m=>[m.team1PlayingHcp,m.team2PlayingHcp,m.team1Stroke,m.team2Stroke]),expectedScramble);
  for(const v of [bestBallView(),view,sc]) assert.deepEqual(project(v,{mobileContract:true,matchCenterHandicapPresentation:true}),project(v,{mobileContract:true}));
});

test('public and participant Match Center use the same display-only selector, never integer PH as a decimal source',async()=>{
  const card=await readFile(new URL('../app/PublicMatchCard.js',import.meta.url),'utf8');
  const pwa=await readFile(new URL('../app/live/TournamentDashboard.js',import.meta.url),'utf8');
  assert.match(card,/formatHandicap\(playerDisplayHandicap\(player\)\)/);
  assert.match(pwa,/formatHandicap\(playerDisplayHandicap\(player\)\)/);
  assert.match(card,/strokeText\(player.stroke\)/);
  assert.doesNotMatch(card,/player\.stroke\s*=|player\.playingHcp\s*=/);
});
