import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { courseLogo, playerPhoto, teamLogo, tournamentHero, tournamentLogo } from "../lib/asset-paths.js";

test("asset helpers match the public directory layout", () => {
  assert.equal(courseLogo("bandon-dunes-logo.png"), "/images/courses/logos/bandon-dunes-logo.png");
  assert.equal(teamLogo("blue-team.webp"), "/images/teams/logos/blue-team.webp");
  assert.equal(playerPhoto("ada.jpg"), "/images/players/ada.webp");
  assert.equal(playerPhoto("connor-o'reilly-pic"), "/images/players/connor-oreilly-pic.webp");
  assert.equal(playerPhoto("connor-o’reilly-pic"), "/images/players/connor-oreilly-pic.webp");
  assert.equal(tournamentHero("pinehurst-no4.webp"), "/images/tournaments/hero/pinehurst-no4.webp");
  assert.equal(tournamentLogo("sandbagger-2017"), "/images/tournaments/logos/sandbagger-2017.png");
});

test("empty filenames do not create broken URLs", () => {
  assert.equal(courseLogo(""), null);
  assert.equal(teamLogo(null), null);
});

test("historical Player photo filenames resolve through the shared static portrait authority", async () => {
  const historical = JSON.parse(await readFile(new URL("../lib/historical-data.json", import.meta.url), "utf8"));
  const expectedPortraitState = new Map([
    ["WO01", true],
    ["CO01", true],
    ["MS01", true],
    ["CO02", false],
  ]);

  for (const [playerId, expectedPortrait] of expectedPortraitState) {
    const player = historical.players.find((row) => row["Player ID"] === playerId);
    assert.ok(player, `Missing canonical historical Player ${playerId}`);

    const resolved = playerPhoto(player["Photo Filename"]);
    const staticAsset = new URL(`../public${resolved}`, import.meta.url);
    const assetExists = await access(staticAsset).then(() => true, () => false);

    assert.equal(assetExists, expectedPortrait, `${player["Display Name"]} portrait state`);
  }
});
