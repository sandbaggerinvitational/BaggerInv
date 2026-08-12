import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("isolated Director Game Center readiness page exposes only explicit refresh and parity actions", () => {
  const page = fs.readFileSync(new URL("../app/admin/director/game-center-readiness/page.js", import.meta.url), "utf8");
  const client = fs.readFileSync(new URL("../app/admin/director/game-center-readiness/GameCenterReadinessClient.js", import.meta.url), "utf8");
  assert.match(page, /inspectTournamentDirectorToken/);
  assert.match(page, /result\.status !== "active"/);
  assert.match(client, /refresh-game-center-presentations/);
  assert.match(client, /game-center-parity/);
  assert.doesNotMatch(client, /getTournamentData|readWorkbookSheetsByName/);
});
