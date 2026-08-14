import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { homeSchedulePreview } from "../lib/home-dashboard.js";
import {
  homeRoundSummaryMatches,
  matchAction,
  selectRelevantPlayerMatches,
} from "../lib/player-home.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const physicalFixtureMatches = [
  { matchId: "2026-R1-2", round: 1, match: 2, format: "Best Ball", course: "Turtle Point", status: "Final", updatedAt: "2026-09-25T17:00:00Z" },
  { matchId: "2026-R2-2", round: 2, match: 2, format: "Scramble", course: "Cougar Point", status: "Final", updatedAt: "2026-09-26T17:00:00Z" },
  { matchId: "2026-R3-2", round: 3, match: 2, format: "Singles", course: "The Ocean Course", status: "Final", updatedAt: "2026-09-27T17:00:00Z" },
];

test("physical Home fixture presents Round 3 once and summarizes only Rounds 1 and 2", () => {
  const selection = selectRelevantPlayerMatches(physicalFixtureMatches, 3);
  assert.equal(selection.primary.matchId, "2026-R3-2");
  assert.deepEqual(
    homeRoundSummaryMatches(selection.ordered, selection.primary.matchId).map((match) => match.matchId),
    ["2026-R1-2", "2026-R2-2"],
  );
  assert.equal(matchAction(selection.primary).label, "View Match Result");
});

test("Home schedule composition covers live, later today, tomorrow, and terminal states without duplication", () => {
  const timeZone = "America/Chicago";
  const later = homeSchedulePreview([
    { id: "dinner", date: "2026-09-25", startTime: "6:30 PM", endTime: "8:00 PM", title: "Dinner", location: "The Atlantic Room" },
  ], { now: new Date("2026-09-25T17:00:00Z"), timeZone });
  assert.equal(later.kind, "event");
  assert.equal(later.eyebrow, "Next up");

  const live = homeSchedulePreview([
    { id: "lunch", date: "2026-09-25", startTime: "12:00 PM", endTime: "2:00 PM", title: "Lunch" },
  ], { now: new Date("2026-09-25T17:30:00Z"), timeZone });
  assert.equal(live.eyebrow, "Happening now");

  const tomorrow = homeSchedulePreview([
    { id: "round-two", date: "2026-09-26", startTime: "8:10 AM", title: "Round 2" },
  ], { now: new Date("2026-09-25T22:00:00Z"), timeZone });
  assert.equal(tomorrow.dayLabel, "Tomorrow");

  const complete = homeSchedulePreview([
    { id: "breakfast", date: "2026-09-25", startTime: "7:00 AM", endTime: "8:00 AM", title: "Breakfast" },
  ], { now: new Date("2026-09-25T22:00:00Z"), timeZone });
  assert.equal(complete.title, "No more events scheduled today.");

  const empty = homeSchedulePreview([], { now: new Date("2026-09-25T22:00:00Z"), timeZone });
  assert.equal(empty.title, "No events scheduled today.");
});

test("Supabase command center renders one logistics surface and keeps secondary modules independent", async () => {
  const [command, participant, deferred] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/ParticipantSupabaseHome.js"),
    source("app/DeferredHomeContent.js"),
  ]);
  const branch = command.slice(command.indexOf("if (supabaseCommandCenter)"), command.indexOf("return <div className={styles.page}>", command.indexOf("if (supabaseCommandCenter)") + 1));
  assert.equal(branch.match(/<TournamentSchedule/g)?.length, 1);
  assert.match(branch, /<TournamentSchedule compact/);
  assert.match(branch, /<DeferredHomeContent fallback=\{<ModuleSkeleton label="Loading tournament moments"/);
  assert.match(branch, /<PersonalizedPlayerHomeSecondary/);
  assert.match(deferred, /requestIdleCallback/);
  assert.match(participant, /hydrateNetSkins/);
  assert.match(participant, /Home Net Skins secondary module is temporarily unavailable/);
  assert.doesNotMatch(participant, /Google Sheets|gviz|opensheet|spreadsheets\.google/i);
});

test("Home hierarchy uses differentiated Sandbagger surfaces without restoring equal weight", async () => {
  const [commandStyles, personalizedStyles, momentsStyles] = await Promise.all([
    source("app/tournament-command-center.module.css"),
    source("app/personalized-player-home.module.css"),
    source("app/tournament-moments.module.css"),
  ]);
  assert.match(personalizedStyles, /\.card,[\s\S]*box-shadow:\s*var\(--home-card-shadow/);
  assert.match(commandStyles, /\.pulse\{[^}]*background:linear-gradient/);
  assert.match(commandStyles, /\.schedule\[data-density=next\]\{[^}]*border-radius:calc[^}]*background:linear-gradient[^}]*box-shadow/);
  assert.match(personalizedStyles, /\.netSkins\s*\{[^}]*border-radius:[^}]*background:[^}]*box-shadow/);
  assert.match(personalizedStyles, /\.schedule\s*\{[^}]*border-radius:[^}]*background:\s*#fff[^}]*box-shadow/);
  assert.match(momentsStyles, /\.shell\s*\{[^}]*border-radius:[^}]*background:\s*linear-gradient[^}]*box-shadow/);
  assert.doesNotMatch(momentsStyles, /\.shell article\s*\{[^}]*border-radius|\.shell article\s*\{[^}]*background:\s*#fff/);
});

test("Home routes, identity, facts, and accessible actions remain intact", async () => {
  const [personalized, command, schedule, moments, styles] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/TournamentCommandCenter.js"),
    source("app/TournamentSchedule.js"),
    source("app/TournamentMoments.js"),
    source("app/personalized-player-home.module.css"),
  ]);
  assert.match(personalized, /teamLogo\(match\.team\?\.logo\)/);
  assert.match(personalized, /participantNames/);
  assert.match(personalized, /opponentNames/);
  assert.match(personalized, /primary\.course/);
  assert.match(personalized, /\["UPCOMING", "OPEN"\]\.includes\(primaryLifecycle\)/);
  assert.match(personalized, /formatMatchResult/);
  assert.match(personalized, /href=\{detailsHref\}/);
  assert.match(personalized, /href="\/my-match"/);
  assert.match(personalized, /href="\/live\?view=leaderboards&tab=skins"/);
  assert.match(command, /href="\/live\?view=leaderboards"/);
  assert.match(schedule, /href="\/tournament-guide\/schedule"/);
  assert.match(moments, /aria-label="Previous tournament moment"/);
  assert.match(moments, /aria-label="Next tournament moment"/);
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /\.playerLines > span\s*\{[\s\S]*width:\s*100%[\s\S]*word-break:\s*normal/);
  assert.match(styles, /\.playerNameText\s*\{[\s\S]*overflow-wrap:\s*normal/);
});

test("cached primary Home and request topology remain unchanged by presentation polish", async () => {
  const participant = await source("app/ParticipantSupabaseHome.js");
  assert.match(participant, /readParticipantHomeCache\(\)/);
  assert.match(participant, /fetch\("\/api\/participant\/home"/);
  assert.match(participant, /fetch\("\/api\/leaderboards\/net-skins"/);
  assert.match(participant, /setState\(\(current\) => current === "ready" \? "ready" : "error"\)/);
  assert.match(participant, /router\.prefetch\("\/my-match"\)/);
  assert.equal((participant.match(/\/api\/participant\/home/g) || []).length, 2, "primary route appears once per normal request plus one stale-impersonation retry");
});

test("Home polish remains presentation-only and does not reach scoring or authoritative backend contracts", async () => {
  const files = await Promise.all([
    "app/PersonalizedPlayerHome.js",
    "app/TournamentCommandCenter.js",
    "app/TournamentSchedule.js",
    "lib/home-dashboard.js",
  ].map(source));
  const combined = files.join("\n");
  assert.doesNotMatch(combined, /score_mutation|finalize_match|match_holes|hole_scores|SUPABASE_SERVICE_ROLE_KEY/i);
  assert.doesNotMatch(combined, /google-sheets-write|Round Scorecards|archive worker/i);
});
