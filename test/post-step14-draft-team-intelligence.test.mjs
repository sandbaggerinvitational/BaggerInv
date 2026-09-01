import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeCanonicalDraftPresentation } from "../lib/player-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function draftFixture() {
  const picks = Array.from({ length: 22 }, (_, index) => ({
    pickNumber: index + 1,
    teamId: index % 2 ? "T2" : "T1",
    playerId: `P${index + 1}`,
    player: {
      id: `P${index + 1}`,
      name: `Player ${index + 1}`,
      image: null,
      handicap: index - 4.5,
    },
  }));
  return {
    year: 2026,
    state: "complete",
    draftedCount: 22,
    totalDraftPicks: 22,
    picks,
    rosters: [
      { team: { id: "T1" }, picks: picks.filter((pick) => pick.teamId === "T1") },
      { team: { id: "T2" }, picks: picks.filter((pick) => pick.teamId === "T2") },
    ],
  };
}

test("Draft portraits enrich once by stable Player ID without changing the completed Draft", () => {
  const draft = draftFixture();
  const enriched = mergeCanonicalDraftPresentation(draft, [
    { id: "P1", photo: "player-one-pic.webp" },
    { id: "P2", photo: "" },
  ]);

  assert.equal(enriched.picks[0].player.image, "/images/players/player-one-pic.webp");
  assert.equal(enriched.picks[1].player.image, null, "a Player without a portrait keeps the initials fallback");
  assert.equal(enriched.picks.length, 22);
  assert.equal(enriched.draftedCount, 22);
  assert.equal(enriched.totalDraftPicks, 22);
  assert.equal(enriched.state, "complete");
  assert.deepEqual(
    enriched.picks.map(({ player, ...pick }) => ({ ...pick, player: { ...player, image: undefined } })),
    draft.picks.map(({ player, ...pick }) => ({ ...pick, player: { ...player, image: undefined } })),
  );
  assert.equal(enriched.rosters[0].picks[0], enriched.picks[0]);
});

test("the public Draft performs one canonical Supabase presentation read and no per-pick lookup", async () => {
  const [page, presentation] = await Promise.all([
    source("app/draft/page.js"),
    source("lib/player-presentation.js"),
  ]);
  assert.equal((page.match(/loadCanonicalPlayerPresentation\(/g) || []).length, 1);
  assert.match(page, /playerPresentationPromise[\s\S]*Promise\.all/);
  assert.match(page, /mergeCanonicalDraftPresentation\(canonicalDraft, playerPresentation\.players\)/);
  const merge = presentation.slice(
    presentation.indexOf("export function mergeCanonicalDraftPresentation"),
    presentation.indexOf("export function playerProfileFromLeaderboardsCore"),
  );
  assert.match(merge, /const presentationById = new Map/);
  assert.doesNotMatch(merge, /canonicalPlayers\.find/);
  assert.doesNotMatch(page, /googleapis|sheets\.google|fetch\(/i);
});

test("Team Intelligence restores the existing field selector without changing optimizer dispatch", async () => {
  const [component, page, runtime] = await Promise.all([
    source("app/war-room/team-intelligence/TeamIntelligence.js"),
    source("app/war-room/team-intelligence/page.js"),
    source("lib/team-intelligence-lineup-runtime.js"),
  ]);
  assert.match(component, /import \{ formatCode, pick \} from "\.\.\/\.\.\/\.\.\/lib\/prediction-engine"/);
  assert.match(component, /Number\(pick\(row, "Year"\)\)/);
  assert.match(component, /buildTeamIntelligenceLineupRuntime/);
  assert.doesNotMatch(component, /optimizeLineups\(\{/);
  assert.match(runtime, /const optimizersByFormat = Object\.fromEntries\(LINEUP_FORMATS\.map/);
  assert.match(page, /prepareWarRoomInput\(\{ scope: "team-intelligence", env \}\)/);
  assert.match(page, /catch \(caught\)[\s\S]*error = caught\?\.message/);
  assert.match(component, /if \(!initialData\)[\s\S]*Team Intelligence unavailable[\s\S]*loadError/);
});
