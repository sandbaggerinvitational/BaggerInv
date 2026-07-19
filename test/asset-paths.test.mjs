import test from "node:test";
import assert from "node:assert/strict";
import { courseLogo, playerPhoto, teamLogo, tournamentHero } from "../lib/asset-paths.js";

test("asset helpers match the public directory layout", () => {
  assert.equal(courseLogo("bandon-dunes-logo.png"), "/images/courses/logos/bandon-dunes-logo.png");
  assert.equal(teamLogo("blue-team.webp"), "/images/teams/logos/blue-team.webp");
  assert.equal(playerPhoto("ada.jpg"), "/images/players/ada.webp");
  assert.equal(tournamentHero("pinehurst-no4.webp"), "/images/tournaments/hero/pinehurst-no4.webp");
});

test("empty filenames do not create broken URLs", () => {
  assert.equal(courseLogo(""), null);
  assert.equal(teamLogo(null), null);
});
