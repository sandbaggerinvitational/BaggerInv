import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../app/live/LeaderboardsDashboard.js", import.meta.url);
const stylesUrl = new URL("../app/live/net-skins.module.css", import.meta.url);
const engineUrl = new URL("../lib/net-skins.js", import.meta.url);

test("Net Skins uses a grouped native ranking hierarchy without changing rank order", async () => {
  const [source, css] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /className=\{skinsStyles\.rankedEntries\}/);
  assert.match(source, /data-ranked=\{ranked \|\| undefined\}/);
  assert.match(source, /data-leader=\{ranked && placement === 1 \|\| undefined\}/);
  assert.match(source, /row\.displayRank \|\| ""/);
  assert.doesNotMatch(source.slice(source.indexOf("function NetSkinsBoard"), source.indexOf("export default function")), /🥇|🥈|🥉/);
  assert.match(css, /\.rankedEntries,.waitingEntries\{display:grid\}/);
  assert.match(css, /grid-template-columns:38px minmax\(0,1fr\) 92px/);
  assert.match(css, /data-leader="true"/);
});

test("winner outcomes emphasize singular/plural skins and aligned winnings", async () => {
  const [source, css] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /row\.skinsWon === 1 \? "Skin" : "Skins"/);
  assert.match(source, /currency\(row\.totalWinnings\)/);
  assert.match(source, /netSkinsCountLabel\(row\.skinsWon\)/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
  assert.match(css, /\.outcomes\{display:grid/);
});

test("No Skins Yet is a compact accessible disclosure and keeps the current golfer discoverable", async () => {
  const [source, css] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(stylesUrl, "utf8")]);
  assert.match(source, /const currentInWaiting/);
  assert.match(source, /setWaitingExpanded\(false\)/);
  assert.match(source, /aria-expanded=\{waitingExpanded\}/);
  assert.match(source, /aria-controls=\{`net-skins-waiting-round-/);
  assert.match(source, /currentWaitingEntry/);
  assert.match(source, /data-featured-current=\{!waitingExpanded && currentWaitingEntry \? "true" : undefined\}/);
  assert.match(source, /" · Your row shown"/);
  assert.match(source, /className=\{skinsStyles\.currentBadge\} aria-label="Current player">YOU/);
  assert.match(source, /className=\{skinsStyles\.currentBadge\} aria-label="Pairing containing current player">YOU/);
  assert.match(css, /\.entry\[data-zero="true"\] \.row\{[^}]*min-height:58px/);
  assert.match(css, /\.noSkinsToggle\{[^}]*min-height:52px/);
});

test("the detail sheet maps only presentation copy and preserves all three engine outcomes", async () => {
  const [source, engine] = await Promise.all([readFile(dashboardUrl, "utf8"), readFile(engineUrl, "utf8")]);
  assert.match(source, /netSkinsResultPresentation\(result\)/);
  assert.match(source, /presentation\.label/);
  assert.match(source, /presentation\.accessibleLabel/);
  assert.doesNotMatch(source.slice(source.indexOf("function NetSkinsBoard"), source.indexOf("export default function")), /Lost Skin \(Tie\)/);
  assert.match(engine, /const tiedLow = field\.filter\(\(value\) => value === low\)\.length > 1 && entrant\.scores\.get\(hole\) === low/);
  assert.match(engine, /const wonSkin = wins\.some\(\(skin\) => skin\.hole === hole\)/);
  assert.match(engine, /tiedLow/);
});

test("the polish adds no request or Google foreground dependency", async () => {
  const source = await readFile(dashboardUrl, "utf8");
  assert.equal((source.match(/fetchWithTransientRetry\(secondaryReadUrl/g) || []).length, 1);
  assert.equal((source.match(/fetch\(`\/api\/leaderboards\/insights/g) || []).length, 1);
  assert.doesNotMatch(source, /googleapis|script\.google|sheets\.google|\/api\/google/);
});

test("Net Skins responsive rows retain readable mobile outcomes through the 320px stress width", async () => {
  const css = await readFile(stylesUrl, "utf8");
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /@media\(max-width:350px\)/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.doesNotMatch(css, /overflow-x:\s*(?:auto|scroll)/);
});
