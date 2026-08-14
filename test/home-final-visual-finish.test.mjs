import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home uses the established primary-page identity language without changing its references", async () => {
  const [home, tournament, leaderboards, identityStyles, homeStyles] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/live/TournamentDashboard.js"),
    source("app/live/LeaderboardsDashboard.js"),
    source("app/tournament-identity-header.module.css"),
    source("app/tournament-command-center.module.css"),
  ]);
  assert.match(home, /<TournamentIdentityHeader[\s\S]*variant="hero"/);
  assert.match(tournament, /<TournamentIdentityHeader variant="hero"/);
  assert.match(leaderboards, /<TournamentIdentityHeader variant="hero"/);
  assert.match(identityStyles, /\.hero\.hero\s*\{[\s\S]*border-radius:\s*20px;[\s\S]*background:\s*#fffefa/);
  assert.match(identityStyles, /@media \(max-width: 640px\)[\s\S]*min-height:\s*68px;[\s\S]*border-radius:\s*18px/);
  assert.match(homeStyles, /\.page\{background:#f6f3eb\}/);
  assert.match(homeStyles, /@media\(max-width:640px\)\{\.page\{padding:14px 10px 74px\}/);
});

test("Home finishing structures preserve actionable hierarchy while improving scan paths", async () => {
  const [home, player, schedule, moments, playerStyles, commandStyles, momentStyles] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/TournamentSchedule.js"),
    source("app/TournamentMoments.js"),
    source("app/personalized-player-home.module.css"),
    source("app/tournament-command-center.module.css"),
    source("app/tournament-moments.module.css"),
  ]);
  const branch = home.slice(home.indexOf("if (supabaseCommandCenter)"), home.indexOf("return <div className={styles.page}>", home.indexOf("if (supabaseCommandCenter)") + 1));
  const order = ["<TournamentIdentityHeader", "<PersonalizedPlayerHome", "{pulse}", "<TournamentSchedule compact", "<TournamentMoments", "<PersonalizedPlayerHomeSecondary"].map((token) => branch.indexOf(token));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(playerStyles, /\.card\[data-variant="choices"\] h2\s*\{[^}]*clamp\(1\.18rem, 3\.3vw, 1\.35rem\)/);
  assert.match(playerStyles, /\.choices \.roundCourseLogo,[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
  assert.match(schedule, /data-layout=\{compact \? "event-first" : undefined\}/);
  assert.match(schedule, /scheduleEventMeta[\s\S]*item\.startTime[\s\S]*location/);
  assert.match(commandStyles, /li\[data-layout=event-first\]\{grid-template-columns:27px minmax\(0,1fr\) auto/);
  assert.match(moments, /What everyone is talking about[\s\S]*moment\.headline/);
  assert.match(momentStyles, /\.shell h2\s*\{[^}]*font:\s*700 \.84rem/);
  assert.match(momentStyles, /\.shell article strong\s*\{[^}]*clamp\(1\.08rem, 3\.2vw, 1\.22rem\)/);
});

test("Net Skins and My Rounds use aligned native-summary structures", async () => {
  const [player, styles] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/personalized-player-home.module.css"),
  ]);
  assert.match(player, /className=\{styles\.netSkinsLayout\}[\s\S]*styles\.skinCoin[\s\S]*styles\.netSkinsCopy[\s\S]*styles\.netSkinsSummary/);
  assert.match(styles, /\.netSkinsLayout\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto;[^}]*align-items:\s*center/);
  assert.match(player, /const roundContext = \[[\s\S]*match\.course[\s\S]*tee[\s\S]*matchTime/);
  assert.match(player, /styles\.roundSummary[\s\S]*styles\.roundIdentity[\s\S]*styles\.roundCourse[\s\S]*styles\.roundResult/);
  assert.match(styles, /\.roundCard\s*\{[\s\S]*grid-template-columns:\s*32px minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(player, /styles\.roundTop|styles\.roundMeta/);
});

test("Home finishing pass keeps facts, deduplication, schedule selection, and requests frozen", async () => {
  const [home, player, schedule, participant] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/TournamentSchedule.js"),
    source("app/ParticipantSupabaseHome.js"),
  ]);
  assert.match(player, /homeRoundSummaryMatches\(matches, promotedMatchIds\(selection\)\)/);
  assert.match(player, /`Round \$\{match\.round\}`/);
  assert.match(player, /homeFormatLabel\(match\.format\)/);
  assert.match(schedule, /homeSchedulePreview\(events, \{ now, timeZone \}\)/);
  assert.equal((participant.match(/\/api\/participant\/home/g) || []).length, 2);
  assert.equal((participant.match(/\/api\/leaderboards\/net-skins/g) || []).length, 1);
  assert.doesNotMatch([home, player, schedule, participant].join("\n"), /Google Sheets|gviz|opensheet|spreadsheets\.google|score_mutation|finalize_match/i);
});
