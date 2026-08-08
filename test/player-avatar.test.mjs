import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant player imagery uses one shared avatar and verified photo lookup", async () => {
  const [avatar, loader, leaderboards, calcutta, profile, directory, playerPage, governors, comparison, draft, sharedBoard] = await Promise.all([
    readFile(new URL("../app/PlayerAvatar.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/sheetData.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/LeaderboardsDashboard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/live/CalcuttaExperience.js", import.meta.url), "utf8"),
    readFile(new URL("../app/me/ParticipantProfile.js", import.meta.url), "utf8"),
    readFile(new URL("../app/players/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/players/[slug]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/board-of-governors/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/compare/CompareTool.js", import.meta.url), "utf8"),
    readFile(new URL("../app/draft/DraftPickCard.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TournamentLeaderboard.js", import.meta.url), "utf8"),
  ]);
  assert.match(avatar, /player\.photo \|\| player\["Photo Filename"\]/);
  assert.match(avatar, /fallback=\{playerAvatarInitials\(playerName\)\}/);
  assert.match(loader, /slug: player\.slug, photo: player\.photo/);
  for (const source of [leaderboards, calcutta, profile, directory, playerPage, governors, comparison, draft, sharedBoard]) {
    assert.match(source, /PlayerAvatar/);
  }
  assert.doesNotMatch(leaderboards, /playerPhoto\(player\.slug\)/);
});
