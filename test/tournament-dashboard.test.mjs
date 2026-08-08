import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeOriginalAssignmentWithLiveResult } from "../lib/live-match-source.js";

const componentUrl = new URL("../app/live/TournamentDashboard.js", import.meta.url);
const stylesUrl = new URL("../app/live/tournament-dashboard.module.css", import.meta.url);
const centerUrl = new URL("../app/live/MatchCenter.js", import.meta.url);
const dataUrl = new URL("../app/live/sheetData.js", import.meta.url);
const pageUrl = new URL("../app/live/page.js", import.meta.url);
const homeUrl = new URL("../app/TournamentCommandCenter.js", import.meta.url);
const identityHeaderUrl = new URL("../app/TournamentIdentityHeader.js", import.meta.url);
const identityStylesUrl = new URL("../app/tournament-identity-header.module.css", import.meta.url);

test("Tournament dashboard uses the shared tournament identity header", async () => {
  const [source, styles, center, home, header] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8"), readFile(centerUrl, "utf8"), readFile(homeUrl, "utf8"), readFile(identityHeaderUrl, "utf8")]);
  assert.match(center, /<TournamentDashboard \{\.\.\.props\} \/>/);
  assert.match(source, /import TournamentIdentityHeader from "\.\.\/TournamentIdentityHeader"/);
  assert.match(home, /import TournamentIdentityHeader from "\.\/TournamentIdentityHeader"/);
  assert.match(source, /<TournamentIdentityHeader variant="hero" year=\{tournament\.year\}/);
  assert.match(home, /<TournamentIdentityHeader/);
  assert.match(header, /hero \? headerStyles\.hero/);
  assert.match(header, /tournament-identity-header\.module\.css/);
  assert.match(header, /hero \? headerStyles\.heroLogo/);
  assert.match(header, /<StatusBadge status=\{status\} \/>/);
  assert.match(source, /tournamentLogo\(filename\)/);
  assert.doesNotMatch(styles, /\.pageHeader(?:\{| )|\.pageHeader h1/);
  assert.match(source, /<Snapshot tournament=/);
  assert.match(source, /Points to Clinch/);
  assert.match(source, /Momentum/);
  assert.match(styles, /\.scoreValue\{[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(source, />My Tournament<|>My Match<|Refresh live scores/);
});

test("Tournament and Leaderboards share one self-contained rounded hero geometry", async () => {
  const [tournament, leaderboards, header, heroStyles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(identityHeaderUrl, "utf8"),
    readFile(identityStylesUrl, "utf8"),
  ]);
  assert.match(tournament, /<TournamentIdentityHeader variant="hero"/);
  assert.match(leaderboards, /<TournamentIdentityHeader variant="hero"/);
  assert.match(header, /<StatusBadge status=\{status\} \/>/);
  assert.match(heroStyles, /\.hero\.hero \{[^}]*width: min\(100%, 732px\);[^}]*min-height: 78px;[^}]*border: 1px solid #ded4c1;[^}]*border-radius: 20px;[^}]*background: #fffefa;[^}]*box-shadow:/s);
  assert.match(heroStyles, /@media \(max-width: 640px\) \{[\s\S]*min-height: 68px;[\s\S]*border-radius: 18px;/);
});

test("Collapsed round summaries are compact and include both team logos", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /size="summary"/);
  assert.equal((source.match(/size="summary"/g) || []).length, 2);
  assert.match(styles, /\.logo\[data-size=summary\]\{width:20px;height:20px/);
  assert.match(styles, /\.roundGroup>summary\{gap:8px;min-height:51px;padding-block:7px/);
  assert.match(styles, /\.roundScore>span\{grid-template-columns:20px minmax\(0,1fr\)/);
  assert.match(styles, /\.roundScore>span:last-child>\.logo\{grid-column:2\}/);
});

test("Snapshot score receives final emphasis without losing protected responsive sizing", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.match(styles, /\.scoreValue\{font-size:clamp\(1\.92rem,9\.1vw,3\.2rem\)\}/);
  assert.match(styles, /@media\(max-width:420px\)\{\.scoreValue\{font-size:clamp\(1\.7rem,8\.7vw,2\.35rem\)\}\}/);
  assert.match(styles, /\.scoreValue\{[^}]*white-space:nowrap/);
  assert.match(styles, /\.scoreValue\{[^}]*font-variant-numeric:tabular-nums/);
});

test("Tournament data refreshes on open, focus, visibility, and a guarded interval", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /if \(pending\.current\) return pending\.current/);
  assert.match(source, /fetchWithTransientRetry\("\/api\/live", \{ cache: "no-store" \}\)/);
  assert.match(source, /refresh\(\);\s*const poll/);
  assert.match(source, /window\.setInterval\(poll, 45_000\)/);
  assert.match(source, /window\.addEventListener\("focus", poll\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", poll\)/);
  assert.match(source, /relativeUpdatedLabel\(lastRefresh, clock\)/);
  assert.doesNotMatch(source, />Refresh</);
});

test("Tournament controls are dynamic, accessible, and client-side", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /aria-label="Select tournament destination"/);
  assert.match(source, /rounds\.map\(\(round\) => <button/);
  assert.match(source, /aria-pressed=\{String\(selectedRound\) === String\(round\.number\)\}/);
  for (const label of ["All", "Live", "Upcoming", "Final"]) assert.equal(source.includes(`"${label}"`), true);
  assert.match(source, /filterMatches\(round\.matches \|\| \[\], activeFilter\)/);
  assert.match(source, /const \[openRounds, setOpenRounds\] = useState\(\(\) => new Set\(\)\)/);
  assert.match(source, /const isOpen = !isOverall \|\| openRounds\.has\(round\.number\)/);
  assert.match(source, /open=\{isOpen\}/);
  assert.match(source, /setOpenRounds\(\(current\) =>/);
});

test("Tournament match cards remain compact and preserve official match data", async () => {
  const [source, styles, dataSource] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8"), readFile(dataUrl, "utf8")]);
  assert.match(source, /Round \{round\.number\}\{match\.match \? ` • Match/);
  assert.match(source, /playerMeta\(player, format\)/);
  assert.match(source, /HCP \$\{formatHandicap\(player\.playingHcp\)\}/);
  assert.match(source, /\+\$\{player\.stroke\} stroke/);
  assert.match(source, /matchResult\(match, tournament\)/);
  assert.match(source, /`Through \$\{match\.currentHole\}`/);
  assert.match(source, /href=\{href\}/);
  assert.match(source, /View Match <i aria-hidden="true">›/);
  assert.match(styles, /\.viewMatch\{[^}]*padding:3px 1px/);
  assert.doesNotMatch(styles, /\.viewMatch\{[^}]*(border|border-radius|background):/);
  assert.match(dataSource, /const matchRow = scoringMatchMap\.get\(matchId\) \|\| liveRow/);
  assert.match(dataSource, /mergeRowsByStableMatchId\(liveRows, sourceIds\)/);
  assert.match(dataSource, /mergeRowsByStableMatchId\(permanentRows, sourceIds\)/);
  assert.match(dataSource, /playerEntry\(matchRow, 1, 1, playerMap\)/);
  assert.match(dataSource, /playerEntry\(matchRow, 2, 2, playerMap\)/);
  assert.match(dataSource, /`Team \$\{side\} Player \$\{slot\} Playing Handicap`/);
  assert.match(dataSource, /`T\$\{side\} P\$\{slot\} Stroke`/);
  assert.match(styles, /\.matchCard\{[^}]*padding:10px/);
  assert.match(styles, /\.versus\{[^}]*grid-template-columns:minmax\(0,1fr\) 20px minmax\(0,1fr\)/);
  assert.doesNotMatch(styles, /overflow-x:\s*(auto|scroll).*\\.page/);
});

test("Round 1 Match 1 joins its incomplete final result to the original stable-ID assignment", () => {
  const match = mergeOriginalAssignmentWithLiveResult({
    matchId: "2026-R1-1",
    permanentRows: [{
      "Match ID": "2026-R1-1",
      "Team 1 Player 1": "MB01",
      "Team 1 Player 1 Playing HCP": "2",
      "Team 1 Player 1 Stroke": "0",
      "Team 2 Player 1": "TL01",
      "Team 2 Player 1 Playing HCP": "19",
      "Team 2 Player 1 Stroke": "17",
    }],
    liveRows: [{
      "Match ID": "2026-R1-1",
      Year: "2026",
      "Match Status": "Final",
      "Team 1 Player 1": "MB01",
      "Team 2 Player 1": "TL01",
      "Team 1 Points": "3",
      "Team 2 Points": "0",
    }],
  });
  assert.equal(match["Team 1 Player 1"], "MB01");
  assert.equal(match["Team 1 Player 1 Playing HCP"], "2");
  assert.equal(match["Team 1 Player 1 Stroke"], "0");
  assert.equal(match["Team 2 Player 1"], "TL01");
  assert.equal(match["Team 2 Player 1 Playing HCP"], "19");
  assert.equal(match["Team 2 Player 1 Stroke"], "17");
  assert.equal(match["Match Status"], "Final");
});

test("Final match results separate the official team name from the result line", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /function finalResultParts/);
  assert.match(source, /\[tournament\.teamOne\.name, tournament\.teamTwo\.name\]/);
  assert.match(source, /result\.slice\(winner\.length\)\.trim\(\)/);
  assert.match(source, /\/\^halved\$\/i\.test\(result\)/);
  assert.match(source, /<MatchStatusBlock/);
  assert.match(source, /detail=\{state === "final" \? finalResult\.team : ""\}/);
  assert.match(source, /result=\{state === "final" \? finalResult\.result : result\}/);
});

test("Scramble cards use golfer handicaps and one team-level stroke treatment", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /format !== "SC" && hasValue\(player\.stroke\)/);
  assert.match(source, /format === "SC" && hasValue\(playingHcp\)/);
  assert.match(source, /Team Playing Handicap: \{formatHandicap\(playingHcp\)\}/);
  assert.match(source, /teamStroke > 0/);
  assert.match(source, /team stroke\{teamStroke === 1 \? "" : "s"\}/);
});

test("dedicated Leaderboards retains Scramble pairing rows after Tournament removes duplicate standings", async () => {
  const [source, dataSource, scrambleSource] = await Promise.all([readFile(componentUrl, "utf8"), readFile(dataUrl, "utf8"), readFile(new URL("../app/live/ScrambleLeaderboard.js", import.meta.url), "utf8")]);
  assert.match(dataSource, /if \(format === "SC"\) \{/);
  assert.match(dataSource, /entityId: `\$\{clean\(match\["Match ID"\]\)\}:team-\$\{side\}`/);
  assert.match(dataSource, /name: playerIds\.map\(\(id\) => playerMap\[id\]\?\.name \|\| id\)\.join\(" \/ "\)/);
  assert.match(dataSource, /entityType: format === "SC" \? "PAIRING" : "PLAYER"/);
  assert.match(scrambleSource, /Scramble Pairing Leaderboard/);
  assert.match(scrambleSource, /<ScrambleTeamIdentity/);
  assert.match(scrambleSource, /<RoundLeaderboardSheet/);
  assert.doesNotMatch(scrambleSource, /Hole-by-Hole Scoring/);
  assert.doesNotMatch(source, /ScrambleLeaderboard|ScoreLeaderboard/);
});

test("Tournament delegates all full standings to the dedicated Leaderboards destination", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.doesNotMatch(source, /function OverallLeaderboard|function ScoreLeaderboard|Round Leaderboard|Individual Gross & Net/);
  assert.match(source, /href="\/live\?view=leaderboards">View Leaderboards/);
});

test("Snapshot counts use distinct live, remaining, and final labels", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /<small aria-label="Live matches">LIVE<\/small>/);
  assert.match(source, /<small aria-label="Matches remaining">REMAINING<\/small>/);
  assert.match(source, /<small aria-label="Final matches">FINAL<\/small>/);
  assert.match(source, /\{progress\.liveMatches\}/);
  assert.match(source, /\{progress\.scheduledMatches\}/);
  assert.match(source, /\{progress\.completedMatches\}/);
  assert.doesNotMatch(source, /state\.liveMatches|state\.remainingMatches|state\.totalMatches - state\.remainingMatches/);
  assert.doesNotMatch(source, /<small>Still On Course<\/small>/);
  assert.match(styles, /\.snapshotMeta\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.snapshotMeta span\{[^}]*min-height:52px/);
  assert.match(styles, /\.snapshotMeta small\{[^}]*white-space:nowrap/);
  assert.match(styles, /\.snapshotMeta strong\{[^}]*font-size:clamp/);
  assert.match(styles, /\.snapshotMeta strong\{[^}]*font-variant-numeric:tabular-nums/);
});

test("selected-round counters do not alter the canonical tournament clinch calculation", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /state\.teamOne\.pointsToClinch <= state\.teamTwo\.pointsToClinch/);
  assert.match(source, /\$\{leading\[0\]\.name\} need \$\{formatTeamPoints\(leading\[1\]\.pointsToClinch\)\} more points/);
  assert.match(source, /<small>Points to Clinch<\/small><strong>\{clinchText\}<\/strong>/);
});

test("Round summaries center team names around an independent score", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /className=\{styles\.roundScore\}/);
  assert.match(source, /\{formatTeamPoints\(teamOneScore\)\}<i className=\{scoreStyles\.separator\}[^>]*>–<\/i>\{formatTeamPoints\(teamTwoScore\)\}/);
  assert.match(styles, /\.roundScore\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(styles, /\.roundScore>span\{[^}]*text-align:center|\.roundScore\{[^}]*text-align:center/);
  assert.match(styles, /\.roundScore>span\{[^}]*min-height:2\.4em/);
  assert.match(styles, /\.roundScore>span\{[^}]*place-items:center/);
  assert.match(styles, /\.roundScore>b\{[^}]*white-space:nowrap/);
});

test("Snapshot protects whole and half-point scores in an independent center column", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /className=\{`\$\{styles\.scoreValue\} \$\{scoreStyles\.score\}`\}/);
  assert.match(source, /formatTeamPoints\(tournament\.teamOne\.score\).*formatTeamPoints\(tournament\.teamTwo\.score\)/s);
  assert.match(styles, /\.score\{[^}]*grid-template-columns:minmax\(72px,1fr\) minmax\(116px,auto\) minmax\(72px,1fr\)/);
  assert.match(styles, /\.scoreValue\{[^}]*font:700 clamp/);
  assert.match(styles, /\.scoreValue\{[^}]*white-space:nowrap/);
  assert.match(styles, /\.scoreValue\{[^}]*font-variant-numeric:tabular-nums/);
});

test("Tournament tee times reuse the approved formatter and never construct Invalid Date", async () => {
  const source = await readFile(dataUrl, "utf8");
  assert.match(source, /import \{ formatHomeTime \} from "\.\.\/\.\.\/lib\/home-dashboard"/);
  assert.match(source, /return formatHomeTime\(raw\)/);
  assert.doesNotMatch(source, /raw\.split\(":"\)\.map\(Number\)/);
  assert.doesNotMatch(source, /Invalid Date/);
});

test("Official final result text is retained from the finalized row", async () => {
  const [source, dataSource] = await Promise.all([readFile(componentUrl, "utf8"), readFile(dataUrl, "utf8")]);
  assert.match(dataSource, /"Match Status Text"/);
  assert.match(source, /formatStoredMatchResult\(match/);
});

test("Tournament-only footer is compact in mobile browser and absent in standalone mode", async () => {
  const [styles, page] = await Promise.all([readFile(stylesUrl, "utf8"), readFile(pageUrl, "utf8")]);
  assert.match(page, /className=\{styles\.tournamentFooter\}/);
  assert.match(styles, /@media\(display-mode:standalone\)\{\.tournamentFooter\{display:none\}\}/);
  assert.match(styles, /@media\(max-width:699px\)\{\.tournamentFooter/);
});

test("Frozen Home and My Match implementations remain untouched by Tournament styling", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  assert.doesNotMatch(styles, /PersonalizedPlayerHome|MyMatchDashboard|my-match-dashboard/);
});

test("Tournament polish preserves a clear round and match rhythm with one Leaderboards CTA", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.ok(source.indexOf("className={styles.roundGroups}") < source.indexOf("className={styles.leaderboardsCta}"));
  assert.match(styles, /--tournament-section-gap:14px/);
  assert.match(styles, /--tournament-card-radius:17px/);
  assert.match(styles, /--tournament-card-shadow:/);
  assert.match(styles, /\.roundGroups\{[^}]*gap:11px/);
  assert.match(styles, /\.leaderboardsCta\{[^}]*min-height:48px/);
});

test("Tournament controls and collapsed or expanded rounds retain confident states", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /<details className=\{styles\.roundGroup\} open=\{isOpen\}/);
  assert.match(source, /aria-pressed=\{String\(selectedRound\) === String\(round\.number\)\}/);
  assert.match(source, /aria-pressed=\{filter === value\}/);
  assert.match(styles, /\.rounds button,\s*\.filters button\{[^}]*min-height:42px/s);
  assert.match(styles, /\.roundGroup\[open\]\{[^}]*border-color:#ccb87f/);
  assert.match(styles, /\.roundGroup\[open\]>summary\{[^}]*background:#fffcf6/);
  assert.match(styles, /focus-visible/);
});

test("Tournament match cards expose state-aware scanning without changing destinations", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /className=\{styles\.matchCard\} data-state=\{state\}/);
  assert.match(source, /href=\{href\}/);
  assert.match(styles, /\.matchCard\[data-state="live"\]/);
  assert.match(styles, /\.course\{[^}]*padding:4px 0 7px/);
  assert.match(styles, /\.versus\{[^}]*padding-block:1px/);
  assert.match(styles, /\.viewMatch\{[^}]*min-height:30px/);
});

test("Tournament destination exposes round selections and status filters", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /const filteredRounds = selectedRounds\.map/);
  assert.match(source, /const activeFilter = selectedRound === "overall" \? "all" : filter/);
  assert.match(source, /aria-label="Select tournament destination"/);
  assert.match(source, /aria-label="Select tournament round"/);
  assert.match(source, /aria-label="Filter tournament matches"/);
  assert.match(source, /filteredRounds\.filter\(\(\{ matches \}\) => matches\.length\)/);
  assert.match(source, /visibleRounds\.map\(\(\{ round, matches \}\)/);
  assert.match(source, /!visibleRounds\.length/);
});

test("Tournament uses the shared lifecycle-aware empty-state component contract", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /import MatchFilterEmptyState/);
  assert.match(source, /<MatchFilterEmptyState filter=\{activeFilter\} round=\{round\} className=\{styles\.empty\}/);
  assert.doesNotMatch(source, /filterEmptyMessage/);
});

test("preview Player Passport invitations remain origin-specific and Admin-authenticated", async () => {
  const [admin, route] = await Promise.all([
    readFile(new URL("../app/admin/PlayerPassportAdmin.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/player-passport/admin/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /location\.origin}\/activate\?player=\$\{reference\}/);
  assert.match(admin, /Activation code: \$\{item\.code\}/);
  assert.match(route, /request\.headers\.get\("x-live-admin-secret"\)/);
  assert.match(route, /process\.env\.ADMIN_SECRET/);
  assert.match(route, /process\.env\.LIVE_ADMIN_SECRET/);
  assert.doesNotMatch(admin, /ADMIN_SECRET|LIVE_ADMIN_SECRET/);
});
