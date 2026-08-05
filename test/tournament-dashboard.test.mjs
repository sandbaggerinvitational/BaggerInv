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

test("Tournament dashboard uses the exact shared Home identity header", async () => {
  const [source, styles, center, home, header] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8"), readFile(centerUrl, "utf8"), readFile(homeUrl, "utf8"), readFile(identityHeaderUrl, "utf8")]);
  assert.match(center, /<TournamentDashboard \{\.\.\.props\} \/>/);
  assert.match(source, /import TournamentIdentityHeader from "\.\.\/TournamentIdentityHeader"/);
  assert.match(home, /import TournamentIdentityHeader from "\.\/TournamentIdentityHeader"/);
  assert.match(source, /<TournamentIdentityHeader year=\{tournament\.year\}/);
  assert.match(home, /<TournamentIdentityHeader/);
  assert.match(header, /className=\{`\$\{styles\.homeHeader\} \$\{headerStyles\.tokens\}`\}/);
  assert.match(header, /tournament-identity-header\.module\.css/);
  assert.match(header, /className=\{styles\.tournamentLogo\}/);
  assert.match(header, /<StatusBadge status=\{status\} \/>/);
  assert.match(source, /tournamentLogo\(filename\)/);
  assert.doesNotMatch(styles, /\.pageHeader(?:\{| )|\.pageHeader h1/);
  assert.match(source, /<Snapshot tournament=/);
  assert.match(source, /Points to Clinch/);
  assert.match(source, /Momentum/);
  assert.match(styles, /\.scoreValue\{[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(source, />My Tournament<|>My Match<|Refresh live scores/);
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
  assert.match(source, /\[\["overall","Overall"\], \.\.\.rounds\.map/);
  assert.match(source, /aria-pressed=\{String\(selectedRound\) === String\(value\)\}/);
  for (const label of ["All", "Live", "Upcoming", "Final"]) assert.equal(source.includes(`"${label}"`), true);
  assert.match(source, /filterMatches\(round\.matches \|\| \[\], filter\)/);
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

test("Round score leaderboard sorts from headers and handles partial and empty states", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /aria-sort=/);
  assert.match(source, /current\.key === key && current\.direction === "asc" \? "desc" : "asc"/);
  assert.match(source, /Number\(a\[sort\.key\]\) - Number\(b\[sort\.key\]\)/);
  assert.match(source, /\|\| a\.name\.localeCompare\(b\.name\)/);
  assert.match(source, /Standings will appear after the first recorded score/);
  assert.match(source, /Partial standings publish as valid holes are confirmed/);
  assert.match(source, /aria-label=\{key === "netToPar" \? "Net score relative to par"/);
  assert.match(source, /Number\(value\) === 0 \? "E"/);
  assert.match(source, /className=\{styles\.leaderHeading\}>Rank/);
  assert.match(source, /className=\{styles\.leaderHeading\}>\{pairing \? "Pairing" : "Player"\}/);
  assert.match(source, /button className=\{styles\.leaderHeading\}/);
  assert.match(styles, /\.leaderHeading\{[^}]*text-transform:uppercase/);
  assert.match(source, /Individual Gross & Net/);
  assert.doesNotMatch(source, /Individual Gross &amp; Net/);
  assert.match(styles, /--round-leader-columns:/);
  assert.match(styles, /grid-template-columns:var\(--round-leader-columns\)/);
  assert.match(styles, /\.leaderRow button\{[^}]*text-align:center/);
  assert.match(styles, /\.leaderRow>i\{[^}]*text-align:center/);
  assert.match(styles, /\.leaderRow>strong\{[^}]*text-align:left/);
  for (const label of ["Gross", "Net", "Net +/-"]) assert.equal(source.includes(`"${label}"`), true);
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

test("Scramble leaderboard creates one shared pairing row while other formats remain individual", async () => {
  const [source, dataSource] = await Promise.all([readFile(componentUrl, "utf8"), readFile(dataUrl, "utf8")]);
  assert.match(dataSource, /if \(format === "SC"\) \{/);
  assert.match(dataSource, /entityId: `\$\{clean\(match\["Match ID"\]\)\}:team-\$\{side\}`/);
  assert.match(dataSource, /name: playerIds\.map\(\(id\) => playerMap\[id\]\?\.name \|\| id\)\.join\(" \/ "\)/);
  assert.match(dataSource, /entityType: format === "SC" \? "PAIRING" : "PLAYER"/);
  assert.match(source, /Scramble Pairing Leaderboard/);
  assert.match(source, /aria-label=\{pairing \? `Scramble pairing \$\{row\.name\}`/);
  assert.match(source, /const pairing = format === "Scramble" \|\| format === "SC"/);
});

test("Overall uses official points and record standings instead of cumulative strokes", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /function OverallLeaderboard/);
  assert.match(source, /Individual Points & Record/);
  for (const label of ["Rank", "Player", "Record", "Points"]) assert.match(source, new RegExp(`>${label}(?: <|<)`));
  assert.match(source, /<OverallLeaderboard rows=\{data\?\.leaderboard \|\| \[\]\} \/>/);
  assert.match(source, /<ScoreLeaderboard rows=\{data\?\.scoreLeaderboard \|\| \[\]\} round=\{activeRound\?\.number\} format=\{activeRound\?\.format\} \/>/);
  assert.doesNotMatch(source.slice(source.indexOf("function OverallLeaderboard"), source.indexOf("export default function")), /gross|netToPar|cumulative/i);
});

test("Snapshot counts use distinct live, remaining, and final labels", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /<small aria-label="Live matches">LIVE<\/small>/);
  assert.match(source, /<small aria-label="Matches remaining">REMAINING<\/small>/);
  assert.match(source, /<small aria-label="Final matches">FINAL<\/small>/);
  assert.match(source, /state\.totalMatches - state\.remainingMatches/);
  assert.doesNotMatch(source, /<small>Still On Course<\/small>/);
  assert.match(styles, /\.snapshotMeta\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.snapshotMeta span\{[^}]*min-height:52px/);
  assert.match(styles, /\.snapshotMeta small\{[^}]*white-space:nowrap/);
  assert.match(styles, /\.snapshotMeta strong\{[^}]*font-size:clamp/);
  assert.match(styles, /\.snapshotMeta strong\{[^}]*font-variant-numeric:tabular-nums/);
});

test("Round summaries center team names around an independent score", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /className=\{styles\.roundScore\}/);
  assert.match(source, /\{formatTeamPoints\(teamOneScore\)\} – \{formatTeamPoints\(teamTwoScore\)\}/);
  assert.match(styles, /\.roundScore\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(styles, /\.roundScore>span\{[^}]*text-align:center|\.roundScore\{[^}]*text-align:center/);
  assert.match(styles, /\.roundScore>span\{[^}]*min-height:2\.4em/);
  assert.match(styles, /\.roundScore>span\{[^}]*place-items:center/);
  assert.match(styles, /\.roundScore>b\{[^}]*white-space:nowrap/);
});

test("Overall leaderboard uses compact proportional columns with team under player", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(styles, /--overall-columns:10% minmax\(0,50%\) 20% 20%/);
  assert.match(styles, /grid-template-columns:var\(--overall-columns\)/);
  assert.match(styles, /\.overallRow>strong\{[^}]*text-align:center/);
  assert.match(styles, /\.overallRow>span:nth-child\(3\),\.overallRow>b\{[^}]*text-align:center/);
  assert.match(styles, /\.overallRow\[data-header=true\] button\{[^}]*text-align:center/);
  assert.match(source, /<small><Logo filename=\{row\.teamLogo\} name=\{row\.team\} size="mini" \/>\{row\.team\}<\/small>/);
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

test("Tournament polish preserves a clear round, matches, leaderboard rhythm", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.ok(source.indexOf("className={styles.roundGroups}") < source.indexOf("<OverallLeaderboard"));
  assert.match(styles, /--tournament-section-gap:14px/);
  assert.match(styles, /--tournament-card-radius:17px/);
  assert.match(styles, /--tournament-card-shadow:/);
  assert.match(styles, /\.roundGroups\{[^}]*gap:11px/);
  assert.match(styles, /\.leaderboard\{[^}]*box-shadow:var\(--tournament-card-shadow\)/);
  assert.match(styles, /\.leaderboard>header\{[^}]*background:#fffcf6/);
});

test("Tournament controls and collapsed or expanded rounds retain confident states", async () => {
  const [source, styles] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /<details className=\{styles\.roundGroup\} open=\{isOpen\}/);
  assert.match(source, /aria-pressed=\{String\(selectedRound\) === String\(value\)\}/);
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

test("Overall status filters render only rounds containing matching matches", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /const filteredRounds = selectedRounds\.map/);
  assert.match(source, /selectedRound === "overall" && filter !== "all"/);
  assert.match(source, /filteredRounds\.filter\(\(\{ matches \}\) => matches\.length\)/);
  assert.match(source, /visibleRounds\.map\(\(\{ round, matches \}\)/);
  assert.match(source, /!visibleRounds\.length/);
});

test("Tournament uses the shared lifecycle-aware empty-state component contract", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /import MatchFilterEmptyState/);
  assert.match(source, /<MatchFilterEmptyState filter=\{filter\} round=\{round\} className=\{styles\.empty\}/);
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
