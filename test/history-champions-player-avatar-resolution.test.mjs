import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeCanonicalLeaderboardPresentation } from "../lib/player-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const serviceModule = new URL("../lib/canonical-player-presentation-service.js", import.meta.url).href;

test("completed leaderboards enrich portraits by stable Player ID without changing historical facts", () => {
  const historical = [
    {
      id: "CL01",
      name: "Caleb Lewis",
      rank: 1,
      wins: 4,
      losses: 1,
      halves: 2,
      points: 5,
      player: { "Player ID": "CL01", "Display Name": "Caleb Lewis" },
    },
    {
      id: "WD01",
      name: "William Dace",
      rank: 2,
      wins: 3,
      losses: 2,
      halves: 1,
      points: 3.5,
      player: { "Player ID": "WD01", "Display Name": "William Dace" },
    },
  ];
  const enriched = mergeCanonicalLeaderboardPresentation(historical, [
    { id: "CL01", slug: "caleb-lewis", photo: "caleb-lewis-pic.webp" },
    { id: "WD01", slug: "william-dace", photo: "" },
  ]);

  assert.equal(enriched[0].photo, "caleb-lewis-pic.webp");
  assert.equal(enriched[0].player["Photo Filename"], "caleb-lewis-pic.webp");
  assert.equal(enriched[0].slug, "caleb-lewis");
  assert.equal(enriched[1].photo, "");
  assert.equal(enriched[1].player["Photo Filename"], undefined);
  for (const [index, row] of enriched.entries()) {
    assert.equal(row.id, historical[index].id);
    assert.equal(row.name, historical[index].name);
    assert.equal(row.rank, historical[index].rank);
    assert.equal(row.wins, historical[index].wins);
    assert.equal(row.losses, historical[index].losses);
    assert.equal(row.halves, historical[index].halves);
    assert.equal(row.points, historical[index].points);
  }
});

test("portrait enrichment never guesses from names, slugs, or ambiguous identities", () => {
  const row = {
    id: "HISTORICAL-ID",
    name: "Shared Name",
    slug: "shared-name",
    player: { "Player ID": "HISTORICAL-ID", "Display Name": "Shared Name" },
  };
  const [result] = mergeCanonicalLeaderboardPresentation([row], [
    { id: "OTHER-ID", name: "Shared Name", slug: "shared-name", photo: "other.webp" },
  ]);

  assert.equal(result, row);
  assert.equal(result.photo, undefined);
});

test("the canonical service performs exactly one bounded Supabase projection read", () => {
  const script = `
    import assert from "node:assert/strict";
    import { loadCanonicalPlayerPresentation } from ${JSON.stringify(serviceModule)};
    let reads = 0;
    const result = await loadCanonicalPlayerPresentation({
      env: {},
      dependencies: {
        readPlayerPresentation: async () => {
          reads += 1;
          return {
            durationMs: 7,
            payload: {
              ok: true,
              data: {
                players: [
                  { player_id: "CL01", public_profile: { "Display Name": "Caleb Lewis", Slug: "caleb-lewis", "Photo Filename": "caleb-lewis-pic.webp" } },
                  { player_id: "WD01", public_profile: { "Display Name": "William Dace", Slug: "william-dace", "Photo Filename": "" } },
                ],
              },
            },
          };
        },
      },
    });
    assert.equal(reads, 1);
    assert.equal(result.source, "supabase");
    assert.equal(result.players.length, 2);
    assert.equal(result.players[0].photo, "caleb-lewis-pic.webp");
    assert.equal(result.diagnostics.googleForegroundRequests, 0);
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("History and Champions share one Supabase presentation service and keep participant History unchanged", async () => {
  const [history, champions, service, playerPresentation] = await Promise.all([
    source("app/history/[year]/page.js"),
    source("app/champions/[year]/page.js"),
    source("lib/canonical-player-presentation-service.js"),
    source("lib/player-presentation.js"),
  ]);

  for (const page of [history, champions]) {
    assert.match(page, /loadCanonicalPlayerPresentation/);
    assert.match(page, /mergeCanonicalLeaderboardPresentation/);
    assert.doesNotMatch(page, /googleapis|sheets\.google|fetch\(/i);
  }
  assert.match(history, /participantPresentation[\s\S]*\? Promise\.resolve\(\{ players: \[\] \}\)[\s\S]*: loadCanonicalPlayerPresentation/);
  assert.match(history, /if \(!participantPresentation\) \{[\s\S]*mergeCanonicalLeaderboardPresentation/);
  assert.match(service, /readPreviewSecondaryHistoryPlayers/);
  assert.match(service, /One cached Supabase profile-projection read; never a per-row lookup/);
  assert.match(service, /googleForegroundRequests: 0/);
  const leaderboardMerge = playerPresentation.slice(
    playerPresentation.indexOf("export function mergeCanonicalLeaderboardPresentation"),
    playerPresentation.indexOf("export function playerProfileFromLeaderboardsCore"),
  );
  assert.match(leaderboardMerge, /const presentationById = new Map/);
  assert.doesNotMatch(leaderboardMerge, /canonicalPlayers\.find/);
});

test("the shared avatar remains the only portrait/fallback renderer", async () => {
  const [leaderboard, avatar, assetImage] = await Promise.all([
    source("app/TournamentLeaderboard.js"),
    source("app/PlayerAvatar.js"),
    source("app/AssetImage.js"),
  ]);
  assert.match(leaderboard, /<PlayerAvatar/);
  assert.match(leaderboard, /photo: row\.photo \|\| playerValue\(row, "Photo Filename"\)/);
  assert.match(avatar, /playerPhoto/);
  assert.match(avatar, /fallback=\{playerAvatarInitials\(playerName\)\}/);
  assert.match(assetImage, /role="img"/);
  assert.match(assetImage, /image unavailable/);
});
