import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchCenterScrambleHandicaps } from "../lib/match-center-handicap-presentation.js";
import { tournamentLiveDataFromSupabaseView } from "../lib/tournament-live-supabase.js";
import { formatHandicap } from "../lib/formatters.js";
import { allocateStrokes } from "../lib/prediction-engine.js";
import { scrambleView, expectedScramble } from "./fixtures/match-center-handicaps.mjs";

const values = p => [p.team1PlayingHcp,p.team2PlayingHcp,p.team1Stroke,p.team2Stroke];
const first = view => matchCenterScrambleHandicaps(view).get("2026-R2-1");
test("six paired Scrambles use exact approved Course Handicaps, not retained zero display or individual PH", () => {
  const view = scrambleView(), before = structuredClone(view);
  assert.deepEqual([...matchCenterScrambleHandicaps(view).values()].map(values), expectedScramble);
  assert.deepEqual(view,before,"read-only derivation cannot prepare a snapshot or change participants");
  const web = tournamentLiveDataFromSupabaseView(view,{matchCenterHandicapPresentation:true});
  assert.deepEqual(web.rounds[0].matches.map(values),expectedScramble);
  for (const options of [{},{mobileContract:true},{mobileContract:true,matchCenterHandicapPresentation:true}]) {
    assert.ok(tournamentLiveDataFromSupabaseView(view,options).rounds[0].matches.every(m=>m.team1PlayingHcp===0));
  }
});
test("zero and plus teams retain signed full team PH, with nonnegative relative strokes", () => {
  const view = scrambleView([[['A',-10],['B',-10],['C',0],['D',0]]]);
  const result=first(view);
  assert.deepEqual(values(result),[-6,0,0,6]);
  assert.equal(formatHandicap(result.team1PlayingHcp),"(6.0)");
  assert.equal(allocateStrokes(result.team2Stroke,view.matches[0].holes.map(h=>({'Stroke Index':h.stroke_index}))).reduce((a,b)=>a+b,0),6);
});
test("incomplete/conflicting course, pairing, roster and handicap inputs fail closed", () => {
  const cases = [
    v=>v.matches[0].holes.pop(), v=>v.matches[0].holes=[],
    v=>v.matches[0].holes[0].stroke_index=0,
    v=>v.matches[1].holes[0].stroke_index=11,
    v=>v.matches[1].snapshot.rating=72.8,
    v=>v.matches[0].snapshot.slope=null,
    v=>v.matches[0].participants.pop(),
    v=>v.matches[0].participants[0].player_id=v.matches[0].participants[1].player_id,
    v=>v.matches[0].participants[0].team_side=2,
    v=>v.players[0].participation_status="INACTIVE",
    v=>v.players[0].team_side=2,
    v=>v.players[0].team_id="OTHER",
    v=>v.matches[0].snapshot.snapshot_id="OTHER",
    v=>v.players[0].tournament_source_payload={},
    v=>v.players[0].tournament_source_payload['Tournament Handicap']=9,
    v=>v.matches[0].participants[0].course_handicap=null,
    v=>v.matches[0].participants[0].course_handicap=10,
    v=>v.matches[0].match.tournament_id="2025",
  ];
  for(const change of cases) { const view=scrambleView();change(view);assert.equal(first(view).handicapPresentation,"UNAVAILABLE",change.toString()); }
});
test("started or otherwise evidenced matches cannot recompute from current handicap", () => {
  for(const patch of [{status:'LIVE'},{status:'FINAL'},{scoring_locked:true},{scored_holes:1},
    {current_hole:1},{unresolved_mutations:1},{clinched:true},{scorecard_complete:true},
    {finalized_at:'2026-09-09'},{result_winner:'TEAM_1'},{team_1_points:1}]) {
    const view=scrambleView();Object.assign(view.matches[0].match,patch);
    assert.equal(first(view).handicapPresentation,'UNAVAILABLE');
  }
  const view=scrambleView();view.matches[0].scores.push({hole_number:1});
  assert.equal(first(view).handicapPresentation,'UNAVAILABLE');
});
test("frozen matched snapshot wins over legacy overlay and today's approved values; mismatched context fails closed", () => {
  const view=scrambleView(),e=view.matches[0];e.match.status='LIVE';
  const p=e.participants.map(p=>({id:p.player_id,team:p.team_side,slot:p.player_slot}));
  e.snapshot.participant_configuration={all_ids:p.map(p=>p.id),team_1:p.slice(0,2),team_2:p.slice(2)};
  e.snapshot.team_configuration={team_1_playing_handicap:8,team_2_playing_handicap:3,team_1_strokes:5,team_2_strokes:0};
  view.players[0].tournament_source_payload['Tournament Handicap']=20;
  assert.deepEqual(values(first(view)),[8,3,5,0]);
  assert.equal(first(view).handicapPresentation,'SCORING_SNAPSHOT');
  e.snapshot.participant_configuration.team_1[0].id='OTHER';
  assert.equal(first(view).handicapPresentation,'UNAVAILABLE');
});
test("BB and Singles semantic PH and official integer strokes are untouched", async () => {
  for(const format of ['BB','SI']) {
    const view=scrambleView();view.matches[0].match.format=format;view.matches[0].snapshot.format=format;
    view.matches[0].participants[0].playing_handicap=-1;view.matches[0].participants[0].final_strokes=0;
    view.matches[0].participants[1].playing_handicap=7;view.matches[0].participants[1].final_strokes=3;
    const normal=tournamentLiveDataFromSupabaseView(view).rounds[0].matches[0];
    assert.deepEqual(tournamentLiveDataFromSupabaseView(view,{matchCenterHandicapPresentation:true}).rounds[0].matches[0],normal);
    assert.equal(normal.team1Players[0].playingHcp,-1);assert.equal(normal.team1Players[1].stroke,3);
  }
  for(const [value,expected] of [[7,'7.0'],[7.8,'7.8'],[0,'0.0'],[-.8,'(0.8)'],[null,'—']]) assert.equal(formatHandicap(value),expected);
  for(const file of ['app/PublicMatchCard.js','app/live/TournamentDashboard.js','app/game-center/GameCenter.js']) {
    const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');
    assert.match(source,/formatHandicap\(player\.playingHcp\)/);
  }
});
