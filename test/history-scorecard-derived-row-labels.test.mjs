import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [scorecard, scorecardCss, pairingCss, matchRow, publicMatchCard, packageJson] = await Promise.all([
  source("app/ScorecardTable.js"),
  source("app/scorecard.module.css"),
  source("app/scorecard-pairing.module.css"),
  source("app/history/HistoricalMatchRow.js"),
  source("app/PublicMatchCard.js"),
  source("package.json").then(JSON.parse),
]);

const netParticipant = scorecard.slice(
  scorecard.indexOf("function NetParticipant"),
  scorecard.indexOf("function ScoreGrid")
);

test("2026 Best Ball, Scramble, and Singles share one visible derived-row label", () => {
  assert.match(netParticipant, /if \(!stackPairingIdentities\) return/);
  assert.match(netParticipant, /className=\{pairingStyles\.derivedRowLabel\}>\{netRow\.label\}<\/span>/);
  assert.doesNotMatch(netParticipant, /net best ball|net scramble/i);
  assert.doesNotMatch(netParticipant, /players\.map\(\(player\) => <strong/);
});

test("the derived row keeps the complete golfer or pairing identity for assistive technology", () => {
  assert.match(netParticipant, /participantIdentity = players\.map\(\(player\) => player\.name\)\.join\(" and "\) \|\| netRow\.name/);
  assert.match(netParticipant, /<span className=\{pairingStyles\.visuallyHidden\}>\{participantIdentity\}\. \{netRow\.label\}<\/span>/);
  assert.match(netParticipant, /<span aria-hidden="true" className=\{pairingStyles\.derivedRowLabel\}>/);
  assert.match(pairingCss, /\.visuallyHidden\s*\{[\s\S]*clip:\s*rect\(0, 0, 0, 0\)/);
});

test("the shared derived label is compact uppercase muted sans-serif", () => {
  const derivedCss = pairingCss.slice(
    pairingCss.indexOf(".derivedRowLabel"),
    pairingCss.indexOf(".visuallyHidden")
  );
  assert.match(derivedCss, /color:\s*#60736b/);
  assert.match(derivedCss, /font-family:\s*Arial, Helvetica, sans-serif/);
  assert.match(derivedCss, /font-size:\s*9px/);
  assert.match(derivedCss, /font-weight:\s*800/);
  assert.match(derivedCss, /letter-spacing:\s*\.08em/);
  assert.match(derivedCss, /text-transform:\s*uppercase/);
});

test("gross identities and every Front 9, Back 9, and full-grid value stay on the existing path", () => {
  assert.match(scorecard, /<th><Participant scorecard=\{scorecard\} stackPairingIdentities=\{stackPairingIdentities\} \/><\/th>/);
  assert.equal([...scorecard.matchAll(/<ScoreGrid\b[^>]*stackPairingIdentities=\{stackPairingIdentities\} \/>/g)].length, 3);
  assert.match(scorecard, /<NetCell hole=\{netRow\.holes\.find/);
  assert.match(scorecard, /scorecard\.frontNine \?\? "—"/);
  assert.match(scorecard, /scorecard\.backNine \?\? "—"/);
  assert.match(scorecard, /scorecard\.netTotals\?\.total \?\? "—"/);
  assert.match(scorecard, /winnerForHole\(holeNumber\)/);
});

test("the shared label stays compact and bounded at 320, 375, 390, and 430 pixels", () => {
  assert.match(scorecardCss, /\.scroller\{[^}]*overflow-x:auto/);
  assert.match(scorecardCss, /@media\(max-width:700px\)[\s\S]*width:clamp\(120px,34vw,150px\)/);
  const boundedIdentityWidths = [320, 375, 390, 430]
    .map((width) => Math.min(150, Math.max(120, width * 0.34)));
  assert.ok(boundedIdentityWidths.every((width) => width >= 120 && width <= 150));
  const derivedCss = pairingCss.slice(
    pairingCss.indexOf(".derivedRowLabel"),
    pairingCss.indexOf(".visuallyHidden")
  );
  assert.doesNotMatch(derivedCss, /white-space:\s*nowrap|width:\s*max-content/);
});

test("the shared label-only treatment preserves 2026 and opts in eligible 2023–2025 History scorecards", () => {
  assert.match(matchRow, /use2026Presentation = Number\(tournament\?\.year\) === 2026/);
  assert.match(matchRow, /stackPairingIdentities=\{use2026Presentation\}/);
  assert.match(publicMatchCard, /historyYear >= 2023 && historyYear <= 2025/);
  assert.match(publicMatchCard, /scorecards\.length > 0/);
  assert.match(publicMatchCard, /stackPairingIdentities=\{historyScorecardParity\}/);
  assert.match(netParticipant, /if \(!stackPairingIdentities\) return <><strong>\{netRow\.name\}<\/strong><small>\{netRow\.label\}<\/small><\/>/);
});

test("the presentation cleanup adds no request or dependency", () => {
  for (const value of [scorecard, matchRow]) {
    assert.doesNotMatch(value, /fetch\(|axios|createClient|supabase\.from|\/api\//i);
  }
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@supabase/ssr", "@supabase/supabase-js", "@vercel/analytics", "next", "openai", "qrcode", "react", "react-dom", "web-push",
  ]);
});
