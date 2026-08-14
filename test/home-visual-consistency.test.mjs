import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatHomeDateLabel, homeSchedulePreview } from "../lib/home-dashboard.js";
import { homeFormatLabel, homeRoundSummaryMatches, selectRelevantPlayerMatches } from "../lib/player-home.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home visual correction preserves the approved command-center hierarchy", async () => {
  const command = await source("app/TournamentCommandCenter.js");
  const branch = command.slice(command.indexOf("if (supabaseCommandCenter)"), command.indexOf("return <div className={styles.page}>", command.indexOf("if (supabaseCommandCenter)") + 1));
  const ordered = [
    "<PersonalizedPlayerHome",
    "{pulse}",
    "<TournamentSchedule compact",
    "<TournamentMoments moments={moments}",
    "<PersonalizedPlayerHomeSecondary",
  ].map((token) => branch.indexOf(token));
  assert.ok(ordered.every((position) => position >= 0));
  assert.deepEqual(ordered, [...ordered].sort((left, right) => left - right));
  assert.equal(branch.match(/<TournamentSchedule/g)?.length, 1);
});

test("multiple promoted scorecards stay in one compact selector and out of My Rounds", async () => {
  const matches = [
    { matchId: "2026-R1-4", round: 1, match: 4, scoringEnabled: true, status: "In Progress" },
    { matchId: "2026-R2-5", round: 2, match: 5, scoringEnabled: true, status: "In Progress" },
    { matchId: "2026-R3-2", round: 3, match: 2, status: "Final" },
  ];
  const selection = selectRelevantPlayerMatches(matches, 3);
  assert.deepEqual(selection.choices.map((match) => match.matchId), ["2026-R1-4", "2026-R2-5"]);
  assert.deepEqual(homeRoundSummaryMatches(selection.ordered, selection.choices.map((match) => match.matchId)).map((match) => match.matchId), ["2026-R3-2"]);
  const [component, styles] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/personalized-player-home.module.css"),
  ]);
  assert.match(component, /data-variant="choices"/);
  assert.match(component, /More than one match is open/);
  assert.match(component, /Open Scorecard/);
  assert.match(styles, /\.choices button\s*\{[\s\S]*grid-template-columns:\s*44px minmax\(0, 1fr\) auto[\s\S]*min-height:\s*70px/);
  assert.match(styles, /\.card\[data-variant="choices"\] h2\s*\{[^}]*font-size:\s*clamp\(1\.18rem, 3\.3vw, 1\.35rem\)/);
});

test("Home round and format content uses natural casing while status pills stay distinct", async () => {
  const [component, styles] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/personalized-player-home.module.css"),
  ]);
  assert.deepEqual(["BB", "SC", "SI"].map(homeFormatLabel), ["Best Ball", "Scramble", "Singles"]);
  assert.match(component, /`Round \$\{match\.round\}`/);
  assert.match(component, /homeFormatLabel\(match\.format\)/);
  assert.doesNotMatch(component, /`R\$\{match\.round\}`/);
  assert.doesNotMatch(styles.match(/\.roundIdentity\s*\{[^}]*\}/)?.[0] || "", /text-transform:\s*uppercase/);
  assert.match(styles, /\.roundResult\s*\{[\s\S]*text-transform:\s*uppercase/);
});

test("Home dates are human friendly without changing canonical schedule selection", () => {
  assert.equal(formatHomeDateLabel("2026-09-24"), "THU · SEP 24");
  const preview = homeSchedulePreview([
    { id: "practice", date: "2026-09-24", startTime: "2:00 PM", title: "Practice Round" },
  ], { now: new Date("2026-09-20T17:00:00Z"), timeZone: "America/Chicago" });
  assert.equal(preview.dayLabel, "THU · SEP 24");
  assert.equal(preview.event.dateKey, "2026-09-24");
  assert.equal(preview.event.startTime, "2:00 PM");
});

test("Coming Up, Moments, Net Skins, and My Rounds use distinct compact card weights", async () => {
  const [commandStyles, momentsStyles, playerStyles, schedule] = await Promise.all([
    source("app/tournament-command-center.module.css"),
    source("app/tournament-moments.module.css"),
    source("app/personalized-player-home.module.css"),
    source("app/TournamentSchedule.js"),
  ]);
  assert.match(commandStyles, /differentiated Sandbagger surfaces/);
  assert.match(commandStyles, /\.schedule\[data-density=next\]\{[^}]*border:[^}]*border-radius:[^}]*background:linear-gradient[^}]*box-shadow/);
  assert.match(momentsStyles, /\.shell\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(momentsStyles, /\.shell article\s*\{[^}]*border-top:[^}]*background:\s*transparent/);
  assert.match(playerStyles, /\.netSkins\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(playerStyles, /\.schedule\s*\{[^}]*background:\s*#fff/);
  assert.match(playerStyles, /\.roundCard\s*\{[\s\S]*border-top:\s*1px solid/);
  assert.match(schedule, /data-density="compact"/);
});

test("loading, failures, request topology, and backend freeze remain unchanged", async () => {
  const [participant, deferred, stateStyles, combined] = await Promise.all([
    source("app/ParticipantSupabaseHome.js"),
    source("app/DeferredHomeContent.js"),
    source("app/ui/state-primitives.module.css"),
    Promise.all([
      "app/PersonalizedPlayerHome.js",
      "app/TournamentCommandCenter.js",
      "app/TournamentSchedule.js",
      "lib/home-dashboard.js",
    ].map(source)).then((files) => files.join("\n")),
  ]);
  assert.match(deferred, /requestIdleCallback/);
  assert.match(stateStyles, /\.module\{[^}]*border-radius:18px[^}]*background:#fff/);
  assert.equal((participant.match(/\/api\/participant\/home/g) || []).length, 2);
  assert.equal((participant.match(/\/api\/leaderboards\/net-skins/g) || []).length, 1);
  assert.doesNotMatch(participant, /Google Sheets|gviz|opensheet|spreadsheets\.google/i);
  assert.doesNotMatch(combined, /score_mutation|finalize_match|SUPABASE_SERVICE_ROLE_KEY|Round Scorecards|archive worker/i);
});
