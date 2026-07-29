import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../app/live/TournamentDashboard.js", import.meta.url);
const stylesUrl = new URL("../app/live/tournament-dashboard.module.css", import.meta.url);
const centerUrl = new URL("../app/live/MatchCenter.js", import.meta.url);
const dataUrl = new URL("../app/live/sheetData.js", import.meta.url);
const pageUrl = new URL("../app/live/page.js", import.meta.url);

test("Tournament dashboard uses the approved compact branded hierarchy", async () => {
  const [source, styles, center] = await Promise.all([readFile(componentUrl, "utf8"), readFile(stylesUrl, "utf8"), readFile(centerUrl, "utf8")]);
  assert.match(center, /<TournamentDashboard \{\.\.\.props\} \/>/);
  assert.match(source, /tournamentLogo\(filename\)/);
  assert.match(source, /tournament\.logo \|\| `sandbagger-\$\{tournament\.year\}`/);
  assert.match(source, /<Snapshot tournament=/);
  assert.match(source, /Points to Clinch/);
  assert.match(source, /Momentum/);
  assert.match(styles, /\.score b\{[^}]*font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(source, />My Tournament<|>My Match<|Refresh live scores/);
});

test("Tournament data refreshes on open, focus, visibility, and a guarded interval", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /if \(pending\.current\) return pending\.current/);
  assert.match(source, /fetch\("\/api\/live", \{ cache: "no-store" \}\)/);
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
  assert.match(source, /playerMeta\(player\)/);
  assert.match(source, /HCP \$\{formatHandicap\(player\.playingHcp\)\}/);
  assert.match(source, /\+\$\{player\.stroke\} stroke/);
  assert.match(source, /matchResult\(match, tournament\)/);
  assert.match(source, /Through \{match\.currentHole\}/);
  assert.match(source, /href=\{href\}/);
  assert.match(source, /View Match <i aria-hidden="true">›/);
  assert.match(styles, /\.viewMatch\{[^}]*padding:3px 1px/);
  assert.doesNotMatch(styles, /\.viewMatch\{[^}]*(border|border-radius|background):/);
  assert.match(dataSource, /const matchRow = scoringMatchMap\.get\(matchId\) \|\| liveRow/);
  assert.match(dataSource, /playerEntry\(matchRow, 1, 1, playerMap\)/);
  assert.match(dataSource, /playerEntry\(matchRow, 2, 2, playerMap\)/);
  assert.match(styles, /\.matchCard\{[^}]*padding:10px/);
  assert.match(styles, /\.versus\{[^}]*grid-template-columns:minmax\(0,1fr\) 20px minmax\(0,1fr\)/);
  assert.doesNotMatch(styles, /overflow-x:\s*(auto|scroll).*\\.page/);
});

test("Round score leaderboard sorts from headers and handles partial and empty states", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /aria-sort=/);
  assert.match(source, /current\.key === key && current\.direction === "asc" \? "desc" : "asc"/);
  assert.match(source, /Number\(a\[sort\.key\]\) - Number\(b\[sort\.key\]\)/);
  assert.match(source, /\|\| a\.name\.localeCompare\(b\.name\)/);
  assert.match(source, /Standings will appear after the first recorded score/);
  assert.match(source, /Partial standings publish as valid holes are confirmed/);
  assert.match(source, /aria-label=\{key === "netToPar" \? "Net score relative to par"/);
  assert.match(source, /Number\(value\) === 0 \? "E"/);
  for (const label of ["Gross", "Net", "Net +/-"]) assert.equal(source.includes(`"${label}"`), true);
});

test("Overall uses official points and record standings instead of cumulative strokes", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /function OverallLeaderboard/);
  assert.match(source, /Individual Points &amp; Record/);
  for (const label of ["Rank", "Player", "Record", "Points"]) assert.match(source, new RegExp(`>${label}(?: <|<)`));
  assert.match(source, /<OverallLeaderboard rows=\{data\?\.leaderboard \|\| \[\]\} \/>/);
  assert.match(source, /<ScoreLeaderboard rows=\{data\?\.scoreLeaderboard \|\| \[\]\} round=\{activeRound\?\.number\} \/>/);
  assert.doesNotMatch(source.slice(source.indexOf("function OverallLeaderboard"), source.indexOf("export default function")), /gross|netToPar|cumulative/i);
});

test("Snapshot counts use distinct live, remaining, and final labels", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /<small>Live Matches<\/small>/);
  assert.match(source, /<small>Matches Remaining<\/small>/);
  assert.match(source, /<small>Final Matches<\/small>/);
  assert.match(source, /state\.totalMatches - state\.remainingMatches/);
  assert.doesNotMatch(source, /<small>Still On Course<\/small>/);
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
  assert.match(source, /if \(match\.liveStatusText\) return match\.liveStatusText\.toUpperCase\(\)/);
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
