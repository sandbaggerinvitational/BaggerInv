import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { teamLogo } from "../lib/asset-paths.js";
import { canonicalTeamPresentationFromLeaderboardsView } from "../lib/leaderboards-core-supabase.js";
import { mergeCanonicalDraftPresentation } from "../lib/player-presentation.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function draftFixture() {
  const teams = [
    { id: "PICKLES", name: "The Pickles", logo: "" },
    { id: "LIPPIT", name: "Lipp it and Rip it", logo: "" },
  ];
  const picks = Array.from({ length: 22 }, (_, index) => ({
    pickNumber: index + 1,
    teamId: index % 2 ? "LIPPIT" : "PICKLES",
    team: teams[index % 2],
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
    teams,
    rosters: [
      { team: teams[0], picks: picks.filter((pick) => pick.teamId === "PICKLES") },
      { team: teams[1], picks: picks.filter((pick) => pick.teamId === "LIPPIT") },
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

test("Draft Team IDs resolve through the canonical Supabase tournament presentation", () => {
  const canonicalTeams = canonicalTeamPresentationFromLeaderboardsView({
    teams: [
      { team_id: "PICKLES", team_side: 1, name: "The Pickles", source_payload: {} },
      { team_id: "LIPPIT", team_side: 2, name: "Lipp it and Rip it", source_payload: {} },
    ],
    matches: [{ presentation: {
      team_1_logo: "pickles-logo",
      team_1_primary_color: "#174f3d",
      team_2_logo: "lippit-logo",
      team_2_primary_color: "#8b1f2d",
    } }],
  });
  const enriched = mergeCanonicalDraftPresentation(draftFixture(), [], canonicalTeams);

  assert.equal(enriched.teams[0].logo, "pickles-logo");
  assert.equal(enriched.teams[1].logo, "lippit-logo");
  assert.equal(enriched.rosters[0].team, enriched.teams[0]);
  assert.equal(enriched.rosters[1].team, enriched.teams[1]);
  assert.equal(teamLogo(enriched.teams[0].logo), "/images/teams/logos/pickles-logo.webp");
  assert.equal(teamLogo(enriched.teams[1].logo), "/images/teams/logos/lippit-logo.webp");
  assert.equal(enriched.picks.length, 22);
  assert.equal(enriched.state, "complete");
});

test("a canonical Team without a logo retains the initials fallback contract", async () => {
  const canonicalTeams = canonicalTeamPresentationFromLeaderboardsView({
    teams: [{ team_id: "PICKLES", team_side: 1, name: "Synthetic Team", source_payload: {} }],
    matches: [],
  });
  const draft = draftFixture();
  draft.teams[0] = { id: "PICKLES", name: "Synthetic Team", logo: "" };
  const enriched = mergeCanonicalDraftPresentation(draft, [], canonicalTeams);
  const logoPlate = await source("app/TeamLogoPlate.js");

  assert.equal(enriched.teams[0].logo, "");
  assert.equal(teamLogo(enriched.teams[0].logo), null);
  assert.match(logoPlate, /fallback=\{teamInitials\(teamName\)\}/);
  assert.match(logoPlate, /inferFallback=\{false\}/);
});

test("the public Draft performs one canonical Supabase presentation read and no per-pick lookup", async () => {
  const [page, presentation] = await Promise.all([
    source("app/draft/page.js"),
    source("lib/player-presentation.js"),
  ]);
  assert.equal((page.match(/loadCanonicalPlayerPresentation\(/g) || []).length, 1);
  assert.match(page, /playerPresentationPromise[\s\S]*Promise\.all/);
  assert.match(page, /canonicalTeamPresentationFromLeaderboardsView\(rosterRead\.payload\.data\)/);
  assert.match(page, /mergeCanonicalDraftPresentation\(canonicalDraft, playerPresentation\.players, canonicalTeams\)/);
  const merge = presentation.slice(
    presentation.indexOf("export function mergeCanonicalDraftPresentation"),
    presentation.indexOf("export function playerProfileFromLeaderboardsCore"),
  );
  assert.match(merge, /const presentationById = new Map/);
  assert.match(merge, /const teamPresentationById = new Map/);
  assert.doesNotMatch(merge, /canonicalPlayers\.find/);
  assert.equal((page.match(/readLeaderboardsCoreView\(/g) || []).length, 1);
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
