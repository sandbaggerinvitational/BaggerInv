import test from 'node:test';import assert from 'node:assert/strict';
import {applyGuideProjectionToHome} from '../lib/guide-participant-adapter.js';
import {timelineFromGuideProjection} from '../lib/tournament-guide-projection.js';
import {tournamentDateTime,tournamentDayKey,publishedTournamentTimeZone} from '../lib/tournament-timeline.js';
import {todaysSchedule,homeSchedulePreview,tournamentDayLabel} from '../lib/home-dashboard.js';
const zone='America/New_York';
const rows=[['2026-09-24','21:00','Calcutta Auction','Meeting'],['2026-09-25','07:30','Round 1','Golf'],['2026-09-25','14:00','Round 2','Golf'],['2026-09-26','10:10','Round 3','Golf']].map(([date,time,title,type])=>({Year:'2026','Event Date':date,'Start Time':time,Title:title,'Event Type':type,'Display on Home':'TRUE'}));
const guide={tournamentIdentity:{year:2026,timeZone:zone},timelineRows:rows};
const input={liveData:{tournament:{year:2026,timeZone:'America/Chicago',status:'Upcoming'},rounds:[1,2,3].map(number=>({number,status:'Upcoming',matches:[]}))},participant:{matches:[]}};
function read(utc,changes={}){const d=structuredClone(input);for(const r of d.liveData.rounds)r.status=changes[r.number]||'Upcoming';return applyGuideProjectionToHome(d,guide,{now:new Date(utc)}).liveData;}
for(const device of ['America/New_York','America/Chicago','UTC'])test(`published identity wins in ${device}; all tournament boundaries are same instant`,()=>{
 const old=process.env.TZ;process.env.TZ=device;
 try{for(const [utc,day] of [['2026-09-25T03:59:00Z','2026-09-24'],['2026-09-25T04:00:00Z','2026-09-25'],['2026-09-26T03:59:00Z','2026-09-25'],['2026-09-26T04:00:00Z','2026-09-26'],['2026-09-27T03:59:00Z','2026-09-26'],['2026-09-27T04:00:00Z','2026-09-27']]){
  const v=read(utc);assert.equal(v.tournament.timeZone,zone);assert.equal(v.timeline.effectiveDate,day);assert.equal(tournamentDayKey(new Date(utc),zone),day);assert(todaysSchedule(v.timeline.events,{now:new Date(utc),timeZone:zone}).every(e=>e.date===day));
 }
 assert.equal(tournamentDayLabel({startDate:'2026-09-24',roundCount:4,now:new Date('2026-09-25T04:00:00Z'),timeZone:zone}),'Day 2 of 4');
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('countdown boundaries use elapsed IANA instant, never device-local clock',()=>{
 for(const [utc,title,minutes] of [['2026-09-25T11:29:00Z','Round 1',1],['2026-09-25T11:30:00Z','Round 1',0],['2026-09-25T12:20:00Z','Round 1',0],['2026-09-25T17:59:00Z','Round 2',1],['2026-09-25T18:00:00Z','Round 2',0],['2026-09-25T18:50:00Z','Round 2',0],['2026-09-26T14:09:00Z','Round 3',1],['2026-09-26T14:10:00Z','Round 3',0],['2026-09-26T16:00:00Z','Round 3',0]]){
  const v=read(utc,{1:title==='Round 2'?'Final':'Upcoming'});const e=todaysSchedule(v.schedule,{now:new Date(utc),timeZone:zone}).find(e=>e.title===title);assert.equal(e.minutesUntil,minutes);assert.equal(e.state,'upcoming');
 }
});
test('IANA conversion is DST-safe without a fixed offset, including elapsed countdown across transitions',()=>{
 assert.equal(tournamentDateTime('2026-01-15','12:00',zone).toISOString(),'2026-01-15T17:00:00.000Z');assert.equal(tournamentDateTime('2026-07-15','12:00',zone).toISOString(),'2026-07-15T16:00:00.000Z');
 for(const [date,now,start,minutes] of [['2026-03-08','2026-03-08T06:30:00Z','03:30',60],['2026-11-01','2026-11-01T04:30:00Z','02:30',180]]){
  const [e]=todaysSchedule([{id:'event',date,startTime:start,title:'Meeting'}],{now:new Date(now),timeZone:zone});assert.equal(e.minutesUntil,minutes);
 }
 assert.equal(tournamentDayLabel({startDate:'2026-03-07',roundCount:4,now:new Date('2026-03-09T04:00:00Z'),timeZone:zone}),'Day 3 of 4');
});
test('delayed Upcoming remains Next Up; Live wins; Final advances, while full day retains all events',()=>{
 const now=new Date('2026-09-25T13:00:00Z');for(const status of ['Upcoming','Live','Final']){
  const v=read(now,{1:status});const p=homeSchedulePreview(v.schedule,{now,timeZone:zone});assert.equal(p.event.title,status==='Final'?'Round 2':'Round 1');assert.equal(p.event.state,status==='Live'?'live':'upcoming');assert.equal(todaysSchedule(v.schedule,{now,timeZone:zone}).length,2);
 }
});
test('publication clock presentation cannot mutate input lifecycle/access/results',()=>{
 const before=JSON.stringify(input);for(const utc of ['2026-09-24T23:59Z','2026-09-25T13:00Z','2026-09-27T13:00Z']){
  const v=read(utc);assert.deepEqual(v.rounds.map(({course,...r})=>r),input.liveData.rounds);assert(v.rounds.every(r=>r.status==='Upcoming'));
 }assert.equal(JSON.stringify(input),before);
 const v=read('2026-09-27T13:00Z',{1:'Final',2:'Final',3:'Final'});assert.deepEqual(todaysSchedule(v.schedule,{now:new Date('2026-09-27T13:00Z'),timeZone:zone}),[]);assert.equal(homeSchedulePreview(v.schedule,{now:new Date('2026-09-27T13:00Z'),timeZone:zone}).kind,'empty');
});
test('Guide timeline and native shared zone resolver agree; historical explicit fallback remains supported',()=>{
 assert.equal(publishedTournamentTimeZone(guide,'America/Chicago'),zone);assert.equal(timelineFromGuideProjection(guide,{tournament:input.liveData.tournament,timeZone:'America/Chicago',rounds:input.liveData.rounds,now:new Date('2026-09-25T04:00Z')}).effectiveDate,'2026-09-25');assert.equal(publishedTournamentTimeZone({},'America/Chicago'),'America/Chicago');
});
