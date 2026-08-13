import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import manifest from "../app/manifest.js";
import { applyParticipantFinalizationResult } from "../lib/scoring-finalization-state.js";
import { readParticipantScoringMatch } from "../lib/scoring-read-service.js";
import { requireScoringReadSource, scoringReadEnvironment } from "../lib/scoring-read-source.js";
import { scoringMatchDataFromSupabaseView } from "../lib/scoring-read-supabase.js";
import { PRODUCTION_SPREADSHEET_ID } from "../lib/spreadsheet-environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const previewEnv = {
  VERCEL_ENV: "preview",
  SCORING_READ_SOURCE: "supabase",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-only-secret",
};

function view(format = "BB", status = "LIVE", scoreCount = 2) {
  const matchId = `2026-R${format === "BB" ? 1 : format === "SC" ? 2 : 3}-1`;
  const participantCount = format === "SI" ? 2 : 4;
  const participants = Array.from({ length: participantCount }, (_, index) => {
    const side = participantCount === 2 ? index + 1 : index < 2 ? 1 : 2;
    const slot = participantCount === 2 ? 1 : (index % 2) + 1;
    return {
      player_id: `P${index + 1}`,
      display_name: `Player ${index + 1}`,
      team_side: side,
      player_slot: slot,
      handicap_index: index + 0.4,
      course_handicap: index + 1,
      playing_handicap: index + 2,
      final_strokes: index + 3,
    };
  });
  const holes = Array.from({ length: 18 }, (_, index) => ({
    match_id: matchId,
    hole_number: index + 1,
    stroke_index: 18 - index,
    par: index % 3 === 0 ? 5 : 4,
    yardage: 350 + index,
  }));
  const scoreSlots = format === "BB" ? 2 : 1;
  const scores = Array.from({ length: scoreCount }, (_, index) => ({
    match_id: matchId,
    hole_number: index + 1,
    hole_revision: index + 2,
    team_1_gross_scores: Array(scoreSlots).fill(4 + (index % 2)),
    team_2_gross_scores: Array(scoreSlots).fill(5),
    team_1_strokes: Array(scoreSlots).fill(0),
    team_2_strokes: Array(scoreSlots).fill(index === 0 ? 1 : 0),
    team_1_net_score: 4,
    team_2_net_score: index === 0 ? 4 : 5,
    hole_winner: index === 0 ? "Halved" : "Team 1",
    mutation_key: `mutation-${index + 1}`,
    actor_id: "P1",
    updated_at: `2026-08-13T00:00:${String(index).padStart(2, "0")}Z`,
  }));
  const final = status === "FINAL";
  return {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "2026 Sandbagger Invitational" },
    round: { tournament_id: "2026", round_number: Number(matchId.split("-R")[1][0]), format,
      name: format === "BB" ? "Best Ball" : format === "SC" ? "Scramble" : "Singles" },
    match: {
      match_id: matchId,
      tournament_id: "2026",
      round_number: Number(matchId.split("-R")[1][0]),
      format,
      scoring_snapshot_id: `${matchId}:S3`,
      status,
      scoring_locked: final,
      scorecard_complete: scoreCount === 18,
      unresolved_mutations: 0,
      scored_holes: scoreCount,
      current_hole: scoreCount,
      holes_remaining: 18 - scoreCount,
      team_1_holes_won: Math.max(0, scoreCount - 1),
      team_2_holes_won: 0,
      running_result: scoreCount ? `Team 1 ${Math.max(0, scoreCount - 1)} UP through ${scoreCount}` : "Scheduled",
      result_winner: scoreCount === 18 ? "Team 1" : "",
      permission_revision: final ? 4 : 3,
      match_revision: scoreCount + 10,
      authority_updated_at: "2026-08-13T00:01:00Z",
      finalized_at: final ? "2026-08-13T00:02:00Z" : null,
    },
    snapshot: {
      snapshot_id: `${matchId}:S3`,
      snapshot_revision: 3,
      canonical_hash: "a".repeat(64),
      course_id: "OCEAN",
      tee: "Gold",
      rating: 73.2,
      slope: 141,
      par: 72,
      team_configuration: { team_1_playing_handicap: 2, team_2_playing_handicap: 4,
        team_1_strokes: 0, team_2_strokes: 2 },
    },
    teams: [
      { tournament_id: "2026", team_id: "PICKLES", team_side: 1, name: "The Pickles" },
      { tournament_id: "2026", team_id: "LIPPIT", team_side: 2, name: "Lipp it and Rip it" },
    ],
    participants,
    permissions: participants.map((participant) => ({
      match_id: matchId,
      player_id: participant.player_id,
      can_score: !final,
      permission_revision: final ? 4 : 3,
    })),
    holes,
    scores,
    presentation: {
      match_id: matchId,
      display_match_number: "1",
      course_name: "The Ocean Course",
      course_logo: "ocean.png",
      course_yardage: "6543",
      tee_time: "10:10 AM",
      starting_hole: "1",
      tournament_location: "Kiawah Island",
      tournament_status: "Live",
      tournament_time_zone: "America/New_York",
    },
    navigation: { previous: null, next: null, position: { round: 3, index: 1, total: 12 } },
    query_ms: 4.25,
  };
}

test("scoring read source is Preview-only, server-controlled, and has no browser override", () => {
  assert.equal(scoringReadEnvironment(previewEnv).resolved, "supabase");
  const production = scoringReadEnvironment({ ...previewEnv, VERCEL_ENV: "production", GOOGLE_SHEETS_ID: PRODUCTION_SPREADSHEET_ID });
  assert.equal(production.resolved, "google");
  assert.equal(production.productionBlocked, true);
  assert.equal(scoringReadEnvironment({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }).blocked, true);
  assert.throws(() => requireScoringReadSource({ ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" }), /unavailable/);
});

for (const [format, expectedPlayers, expectedGross] of [["BB", 4, "4/4"], ["SC", 4, "4"], ["SI", 2, "4"]]) {
  test(`Supabase scoring adapter preserves the ${format} participant contract`, () => {
    const data = scoringMatchDataFromSupabaseView(view(format, "LIVE", 2), {
      currentPlayerId: "P1", authorizationVerified: true, writable: true,
    });
    assert.equal(data.match["Match ID"], `2026-R${format === "BB" ? 1 : format === "SC" ? 2 : 3}-1`);
    assert.equal(data.match.Format, format);
    assert.equal(data.match["Team 1 Team ID"], "PICKLES");
    assert.equal(data.match["Team 2 Team ID"], "LIPPIT");
    assert.equal([1, 2].flatMap((side) => [1, 2].map((slot) => data.match[`Team ${side} Player ${slot}`]).filter(Boolean)).length, expectedPlayers);
    assert.equal(data.holeScores[0]["Team 1 Gross Scores"], expectedGross);
    assert.deepEqual(data.holeScores[0]["Team 2 Strokes"], Array(format === "BB" ? 2 : 1).fill(1));
    assert.equal(data.courseHoles.length, 18);
    assert.equal(data.courseHoles[0]["Course ID"], "OCEAN");
    assert.equal(data.courseHoles[0]["Stroke Index"], 18);
    assert.equal(data.display.playerNames.P1, "Player 1");
    assert.equal(data.authority.source, "supabase");
    assert.equal(data.authority.writable, true);
  });
}

test("zero-hole, partial, complete, and FINAL scoring states fail closed correctly", () => {
  const zero = scoringMatchDataFromSupabaseView(view("SI", "UPCOMING", 0), { authorizationVerified: true, writable: true });
  const partial = scoringMatchDataFromSupabaseView(view("SI", "LIVE", 7), { authorizationVerified: true, writable: true });
  const complete = scoringMatchDataFromSupabaseView(view("SI", "LIVE", 18), { authorizationVerified: true, writable: true });
  const final = scoringMatchDataFromSupabaseView(view("SI", "FINAL", 18), { authorizationVerified: true, writable: false });
  assert.equal(zero.holeScores.length, 0);
  assert.equal(partial.canConfirm, false);
  assert.equal(complete.canConfirm, true);
  assert.equal(final.match["Match Status"], "Final");
  assert.equal(final.canConfirm, false);
  assert.equal(final.authority.writable, false);
});

test("parity normalization does not treat a workbook FALSE string as a scoring lock", async () => {
  const { scoringReadParityProjection } = await import("../lib/scoring-read-supabase.js");
  assert.equal(scoringReadParityProjection({ match: { "Scoring Locked": "FALSE" } }).match.scoringLocked, false);
  assert.equal(scoringReadParityProjection({ match: { "Scoring Locked": "TRUE" } }).match.scoringLocked, true);
});

test("active Supabase scoring service never calls the Google reader and has no fallback", async () => {
  let googleCalls = 0;
  const expected = scoringMatchDataFromSupabaseView(view("SI", "LIVE", 3), {
    currentPlayerId: "P1", authorizationVerified: true, writable: true,
  });
  const result = await readParticipantScoringMatch({
    matchId: expected.match["Match ID"],
    currentPlayerId: "P1",
    authorization: { verified: true, writable: true },
    env: previewEnv,
    dependencies: {
      readGoogle: async () => { googleCalls += 1; throw new Error("Google unavailable"); },
      readSupabase: async () => ({ data: expected, diagnostics: { source: "supabase", googleRequests: 0 } }),
    },
  });
  assert.equal(googleCalls, 0);
  assert.equal(result.data.match["Match ID"], expected.match["Match ID"]);
  assert.equal(result.diagnostics.googleRequests, 0);
  await assert.rejects(() => readParticipantScoringMatch({
    matchId: expected.match["Match ID"], authorization: { verified: true, writable: true }, env: previewEnv,
    dependencies: { readGoogle: async () => { googleCalls += 1; }, readSupabase: async () => { throw new Error("Supabase unavailable"); } },
  }), /Supabase unavailable/);
  assert.equal(googleCalls, 0);
});

test("authoritative Finalization success remains visible if post-confirmation refresh fails", () => {
  const current = scoringMatchDataFromSupabaseView(view("SI", "LIVE", 18), {
    currentPlayerId: "P1", authorizationVerified: true, writable: true,
  });
  const finalized = applyParticipantFinalizationResult(current, {
    matchRevision: 44,
    updatedAt: "2026-08-13T12:00:00Z",
    resultWinner: "Team 1",
  });
  assert.equal(finalized.match["Match Status"], "Final");
  assert.equal(finalized.match["Scoring Locked"], true);
  assert.equal(finalized.match.Revision, 44);
  assert.equal(finalized.authority.writable, false);
  assert.equal(finalized.canConfirm, false);
});

test("participant scoring routes use the Supabase adapter without a direct Google read", async () => {
  const [current, match, service] = await Promise.all([
    source("app/api/scoring/current/route.js"),
    source("app/api/scoring/matches/[matchId]/route.js"),
    source("lib/scoring-read-service.js"),
  ]);
  for (const route of [current, match]) {
    assert.match(route, /readParticipantScoringMatch/);
    assert.match(route, /X-Scoring-Read-Source|scoringReadResponseHeaders/);
    assert.doesNotMatch(route, /readLiveScoringMatch|mergeParticipantScoringAuthorityState/);
  }
  assert.match(current, /readScoringMatchView\(current\.matchId/);
  assert.match(current, /authoritativeData/);
  assert.match(current, /Finalization transaction already committed/);
  assert.match(service, /source\.resolved === "google"/);
  assert.match(service, /await import\("\.\/google-sheets-write\.js"\)/);
  assert.match(service, /mergeParticipantScoringAuthorityState/);
  assert.doesNotMatch(service, /catch[\s\S]{0,300}readGoogle/);
});

test("Director diagnostics expose a read-only 24-match scoring contract parity action", async () => {
  const [route, client] = await Promise.all([
    source("app/api/director/scoring-authority/route.js"),
    source("app/admin/director/game-center-readiness/GameCenterReadinessClient.js"),
  ]);
  assert.match(route, /action === "scoring-read-parity"/);
  assert.match(route, /matchesCompared:\s*matchIds\.length/);
  assert.match(route, /matchIds\.length === 24/);
  assert.match(route, /correctedBestBall2026R16/);
  assert.match(route, /finalizedSingles2026R34/);
  const branch = route.split('action === "scoring-read-parity"')[1].split('action === "my-match-parity"')[0];
  assert.doesNotMatch(branch, /replace|submit|persist|finalize|reopen/i);
  assert.match(client, /run\("scoring-read-parity", \{ samples: 3 \}\)/);
});

test("installed PWA and Tournament Hub avoid the public root and legacy /api/live", async () => {
  const [menu, home, session, participantAuth] = await Promise.all([
    source("app/Menu.js"), source("app/ParticipantSupabaseHome.js"), source("app/api/player-passport/session/route.js"),
    source("app/participant-auth/ParticipantAuthRehearsal.js"),
  ]);
  assert.equal(manifest().start_url, "/home");
  assert.match(menu, /fetch\("\/api\/player-passport\/session"/);
  assert.match(menu, /applyTournament\(payload\?\.tournament\)/);
  assert.doesNotMatch(menu, /fetch\("\/api\/live"/);
  assert.doesNotMatch(menu, /api\/tournament\/live/);
  assert.match(session, /tournament:\s*resolved\.context\.tournament/);
  assert.match(home, /router\.replace\("\/participant-auth\?next=\/home"\)/);
  assert.match(participantAuth, /searchParams\.get\("next"\)/);
  assert.match(participantAuth, /router\.replace\(next\)/);
  assert.doesNotMatch(participantAuth, /Player Passport remains authoritative/);
});

test("local queue hydration begins from IndexedDB before the canonical scorecard read", async () => {
  const component = await source("app/score/ScoreEntry.js");
  const sessionBranch = component.match(/if \(session\?\.ok\)[\s\S]*?return;\n\s*}/)?.[0] || "";
  assert.match(component, /restoreLocalEntries/);
  assert.match(component, /durableScoringStore\(\)\.list\(\)/);
  assert.ok(sessionBranch.indexOf("restoreLocalEntries") < sessionBranch.indexOf("loadMatch"));
  assert.match(component, /applyParticipantFinalizationResult/);
  assert.match(component, /finalized\.authoritativeData/);
  assert.match(component, /expectedMatchRevision:\s*Number\(match\.Revision/);
  assert.match(component, /clientMutationId:\s*`finalize:/);
});
