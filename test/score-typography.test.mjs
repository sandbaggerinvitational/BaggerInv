import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatTeamPoints } from "../lib/formatters.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("shared score typography preserves the font and enables tabular lining figures", async () => {
  const css = await source("app/score-typography.module.css");

  assert.match(css, /font-variant-numeric:\s*tabular-nums lining-nums/);
  assert.match(css, /font-feature-settings:\s*"tnum" 1, "lnum" 1/);
  assert.match(css, /padding-inline:\s*0\.24em/);
  assert.match(css, /align-items:\s*center/);
});

test("prominent tournament, match, and leaderboard scores share the typography treatment", async () => {
  const [pulse, statusHero, matchCenter, matchCard, dashboard] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/TournamentStatusHero.js"),
    source("app/live/MatchCenter.js"),
    source("app/PublicMatchCard.js"),
    source("app/live/TournamentDashboard.js"),
  ]);

  for (const component of [pulse, statusHero, matchCenter, matchCard, dashboard]) {
    assert.match(component, /score-typography\.module\.css/);
  }
  assert.match(pulse, /scoreStyles\.centeredScore/);
  assert.match(pulse, /scoreStyles\.separator/);
  assert.match(statusHero, /scoreStyles\.centeredScore/);
  assert.match(matchCenter, /scoreStyles\.separator/);
  assert.match(matchCard, /scoreStyles\.centeredScore/);
  assert.match(dashboard, /scoreStyles\.score/);
});

test("decimal team-score formatting remains unchanged", () => {
  assert.equal(formatTeamPoints(8.5), "8.5");
  assert.equal(formatTeamPoints(3.5), "3.5");
});
