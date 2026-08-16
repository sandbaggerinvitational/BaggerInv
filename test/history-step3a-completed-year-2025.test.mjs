import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [page, css, participantCss, archive, packageJson] = await Promise.all([
  source("app/history/[year]/page.js"),
  source("app/history/[year]/completed-year-2025.module.css"),
  source("app/history/history-participant.module.css"),
  source("lib/historical-data.json").then(JSON.parse),
  source("package.json").then(JSON.parse),
]);

test("Step 3A intentionally gates the completed-year prototype to 2025", () => {
  assert.match(page, /const useCompleted2025 = !useSupabase2026 && Number\(tournament\.year\) === 2025/);
  assert.match(page, /useCompleted2025 \? <CompletedYearOverview/);
  assert.match(page, /useSupabase2026 \? <CurrentHistoryOverview/);
  assert.match(page, /useCompleted2025 \? null : <div className=\{styles\.finalScoreCard\}>/);
  assert.doesNotMatch(page, /\[2017,\s*2018|year\s*>=\s*2017|year\s*<=\s*2025/);
});

test("the collapsed 2025 final state follows the shared History hierarchy", () => {
  const markers = [
    "data-completed-champion",
    "data-completed-rounds",
    "data-completed-teams",
    "data-completed-standings",
    "data-completed-records",
    "data-completed-scorecards",
    "data-completed-honors",
  ];
  const positions = markers.map((marker) => page.indexOf(marker));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("2025 uses the 2026 History visual contracts without changing the 2026 branch", () => {
  assert.match(page, /useSupabase2026 \|\| useCompleted2025 \? pwaStyles\.currentTournamentHero/);
  assert.match(page, /useSupabase2026 \|\| useCompleted2025 \? pwaStyles\.currentTournamentHeroContent/);
  assert.match(page, /className=\{pwaStyles\.overviewSection\}/);
  assert.match(page, /className=\{pwaStyles\.overviewRoundList\}/);
  assert.match(page, /className=\{pwaStyles\.overviewTeamList\}/);
  assert.match(page, /pwaStyles\.standingsSummary/);
  assert.match(page, /pwaStyles\.recordsDetails/);
  assert.match(css, /background:\s*linear-gradient\(135deg, #fffaf0, #f3ead4\)/);
  assert.match(css, /border-radius:\s*var\(--tsi-radius-md\)/);
});

test("direct product labels replace every Step 3A editorial subtitle", () => {
  for (const label of [
    "How They Won",
    "Three rounds at",
    "The sides that decided",
    "The leaders",
    "by the numbers",
    "The closing accolade",
  ]) {
    assert.doesNotMatch(page, new RegExp(label, "i"));
  }
  for (const label of [
    "Tournament Final",
    "Tournament Rounds",
    "The Teams",
    "Final Player Standings",
    "Tournament Records",
    "Historical Scorecards",
    "Tournament Honors",
  ]) {
    assert.match(page, new RegExp(`>${label}<`, "i"));
  }
});

test("year identity keeps the canonical hero, edition, destination, and dates model-driven", async () => {
  const tournament = archive.tournaments.find((row) => Number(row.Year) === 2025);
  assert.equal(tournament.Destination, "Bandon Dunes");
  assert.equal(tournament.Dates, "August 15 - 16, 2025");
  assert.match(page, /historyHeroPath\(tournament\)/);
  assert.match(page, /historyEditionLabel\(tournament\.year\)/);
  assert.match(page, /tournament\.Destination/);
  assert.match(page, /tournament\.Dates/);
  await access(new URL("../public/images/tournaments/hero/pacific-dunes.webp", import.meta.url));
});

test("Champion result is a single semantic, model-backed surface", () => {
  assert.match(page, /data-completed-champion/);
  assert.match(page, /tournament\.championTeam\?\.name/);
  assert.match(page, /tournament\.runnerUpTeam\?\.name/);
  assert.match(page, /tournament\["Final Score"\]/);
  assert.match(page, /aria-label=\{`\$\{tournament\.championTeam/);
  assert.match(page, /teamLogo\(tournament\.championTeam\?\.logo\)/);
  assert.match(page, /teamLogo\(tournament\.runnerUpTeam\?\.logo\)/);
  assert.doesNotMatch(page, /Bandon Brothers|The Crispy Boys|Caleb Lewis|22 matches/);
});

test("all three round summaries reuse canonical course facts and existing routes", () => {
  assert.match(page, /tournament\.courses\.map\(\(course\)/);
  assert.match(page, /getFormatName\(course\.Format\)/);
  assert.match(page, /course\.Course/);
  assert.match(page, /href=\{`\/history\/\$\{tournament\.year\}\/round\/\$\{round\}`\}/);
  assert.match(page, /href=\{`\/courses\/\$\{course\["Course ID"\]\}`\}/);
  assert.match(page, /Points Available/);
  assert.doesNotMatch(page, /dramatic|comeback|dominant|clutch/i);
});

test("both compact team summaries preserve captain, handicap, asset, and route fields", () => {
  assert.match(page, /tournament\.teams\.map\(\(team\)/);
  assert.match(page, /team\.captain\?\.\["Display Name"\]/);
  assert.match(page, /formatHandicap\(team\.averageHandicap\)/);
  assert.match(page, /teamLogo\(team\.logo\)/);
  assert.match(page, /View Full Roster/);
  assert.match(page, /encodeURIComponent\(team\.side\)/);
});

test("final standings use the rank-five cutoff and preserve all rows in a native disclosure", () => {
  assert.match(page, /historyStandingsSummary\(leaderboard, 5\)/);
  assert.match(page, /standings\.map\(\(row\) => renderStanding\(row, "summary"\)\)/);
  assert.match(page, /leaderboard\.map\(\(row\) => renderStanding\(row, "full"\)\)/);
  assert.match(page, /View Full Standings/);
  assert.match(page, /Hide Full Standings/);
  assert.match(page, /aria-label=\{`\$\{rankAccessibleLabel\(rank\)/);
  assert.match(page, /standingsCountLabel\(row\.wins, "win"\)/);
  assert.match(page, /standingsCountLabel\(row\.losses, "loss", "losses"\)/);
  assert.match(page, /standingsCountLabel\(row\.halves, "tie"\)/);
  assert.match(page, /row\.wins/);
  assert.match(page, /row\.losses/);
  assert.match(page, /row\.halves/);
  assert.match(page, /formatPlayerPoints\(row\.points\)/);
});

test("Tournament Records shows four intentional defaults and keeps every remaining record accessible", () => {
  for (const label of ["Best Individual Round", "Best Team Round", "Birdie Leader", "Average Score"]) {
    assert.match(page, new RegExp(`"${label}"`));
  }
  assert.match(page, /defaultRecordLabels[\s\S]*defaultRecords[\s\S]*remainingRecords/);
  assert.match(page, /View All Tournament Records/);
  assert.match(page, /remainingRecords\.map/);
  assert.match(page, /build2025TournamentRecords\(\{/);
  assert.match(page, /matches,\s*teams: tournament\.teams/);
  assert.match(page, /aria-label=\{item\.accessibleLabel\}/);
  assert.match(page, /item\.context/);
  assert.doesNotMatch(page, /completedRecordDetail/);
  assert.doesNotMatch(page, /CRISPYBOYS|BANDONBROTHERS/);
});

test("accepted scorecard and Honors semantics remain separate and model-backed", () => {
  assert.match(page, /scorecardCoverage\.completeMatchScorecards/);
  assert.match(page, /Scorecard detail available/);
  assert.doesNotMatch(page, />57 of 78</);
  assert.match(page, /tournament\.awards\.map\(\(award\)/);
  assert.match(page, /award\.winnerPlayer\?\.\["Display Name"\] \|\| award\.Winner/);
});

test("2025 removes only the duplicate top archive navigator and preserves canonical destinations", () => {
  assert.match(page, /useSupabase2026 \? <HistoryArchiveNav[\s\S]*useCompleted2025 \? null : <nav/);
  assert.match(page, /href=\{`\/history\/\$\{previousYear\}`\}/);
  assert.match(page, /href="\/history"/);
  assert.match(page, /href=\{`\/history\/\$\{nextYear\}`\}/);
});

test("the 2025 presentation introduces no request, endpoint, data source, or dependency", () => {
  assert.doesNotMatch(page, /fetch\(|\/api\/live|gviz|createClient|supabase\.from/i);
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr",
    "@supabase/supabase-js",
    "@vercel/analytics",
    "next",
    "openai",
    "qrcode",
    "react",
    "react-dom",
    "web-push",
  ]);
});

test("mobile presentation has bounded disclosures, touch targets, focus, and reduced-motion rules", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 350px\)/);
  assert.match(css, /\.disclosure:not\(\[open\]\) > \.disclosureBody/);
  assert.match(participantCss, /min-height:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /white-space:\s*nowrap/);
});
