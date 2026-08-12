import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPublishedOddsImport,
  comparePublishedOddsParity,
  publishedOddsSnapshotsFromView,
} from "../lib/published-odds-supabase.js";
import { publishedOddsReadEnvironment } from "../lib/published-odds-read-source.js";

const sheet = (rows) => ({ records: rows.map((record) => ({ record })) });
const snapshot = (phase, phaseOrder, publishedAt, clayProbability = 20) => ({
  year: 2026, phase, phaseOrder, publishedAt, iterations: 10_000, totalPointsAvailable: 72,
  teams: [
    { side: 1, name: "The Pickles", probability: 60, americanOdds: "-150", expectedPoints: 38.25 },
    { side: 2, name: "Lipp it and Rip it", probability: 40, americanOdds: "+150", expectedPoints: 33.75 },
  ],
  players: [
    { id: "CB01", name: "Clay Beltran", teamSide: 1, probability: clayProbability, americanOdds: "+400", expectedPoints: 5.25, expectedRecord: "2.0-1.0-0.0", averageFinish: 3.2 },
    { id: "HM01", name: "Holman Moores", teamSide: 2, probability: 10, americanOdds: "+900", expectedPoints: 4.5, expectedRecord: "1.0-1.0-1.0", averageFinish: 5.1 },
  ],
});

function sheets() {
  const first = snapshot("Pre-Tournament", 0, "2026-07-01T12:00:00.000Z", 15);
  const second = snapshot("After Round 1", 1, "2026-07-02T12:00:00.000Z", 20);
  const snapshots = [first, second];
  return {
    "Odds Control": sheet([{ Year: 2026, "Current Official Phase": "After Round 1", "Updated At": second.publishedAt }]),
    "Odds Snapshots": sheet(snapshots.map((row) => ({ Year: row.year, Phase: row.phase, "Published At": row.publishedAt, "Snapshot JSON": JSON.stringify(row) }))),
    "Odds Team Results": sheet(snapshots.flatMap((item) => item.teams.map((row) => ({ Year: 2026, Phase: item.phase, Team: row.name,
      "Win Probability": row.probability, "American Odds": Number(row.americanOdds), "Expected Points": row.expectedPoints })))),
    "Odds Player Results": sheet(snapshots.flatMap((item) => item.players.map((row) => ({ Year: 2026, Phase: item.phase,
      "Player ID": row.id, Player: row.name, "Top Player Probability": row.probability, "American Odds": Number(row.americanOdds),
      "Expected Points": row.expectedPoints, "Expected Record": row.expectedRecord, "Average Finish": row.averageFinish })))),
  };
}

test("published Odds import preserves exact Google payloads and milestone selection", () => {
  const imported = buildPublishedOddsImport({ sheets: sheets(), tournamentId: "2026", tournamentYear: 2026,
    sourceWorkbookId: "preview", requestedBy: "Director" });
  assert.equal(imported.current_official_milestone, "After Round 1");
  assert.equal(imported.snapshots.length, 2);
  assert.deepEqual(imported.snapshots.map((item) => item.published_payload.phase), ["Pre-Tournament", "After Round 1"]);
  assert.match(imported.import_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(imported.snapshots[1].published_payload.players[0].probability, 20);
});

test("published Odds import is deterministic and rejects reporting divergence", () => {
  const first = buildPublishedOddsImport({ sheets: sheets(), tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" });
  const second = buildPublishedOddsImport({ sheets: sheets(), tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" });
  assert.equal(first.import_fingerprint, second.import_fingerprint);
  const divergent = sheets();
  divergent["Odds Player Results"].records[2].record["Top Player Probability"] = 21;
  assert.throws(() => buildPublishedOddsImport({ sheets: divergent, tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" }),
    (error) => error.code === "PUBLISHED_ODDS_REPORTING_DIVERGENCE");
});

test("published Odds import rejects an incomplete or unsupported current milestone", () => {
  const missing = sheets();
  missing["Odds Control"].records[0].record["Current Official Phase"] = "After Round 2";
  assert.throws(() => buildPublishedOddsImport({ sheets: missing, tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" }),
    (error) => error.code === "CURRENT_PUBLISHED_ODDS_MILESTONE_INCOMPLETE");
});

test("published Odds import rejects an empty publication and duplicate milestones", () => {
  const empty = sheets();
  empty["Odds Snapshots"] = sheet([]);
  assert.throws(() => buildPublishedOddsImport({ sheets: empty, tournamentId: "2026", tournamentYear: 2026,
    sourceWorkbookId: "preview", requestedBy: "Director" }),
  (error) => error.code === "CURRENT_PUBLISHED_ODDS_MILESTONE_INCOMPLETE");
  const duplicate = sheets();
  duplicate["Odds Snapshots"].records.push(structuredClone(duplicate["Odds Snapshots"].records[1]));
  assert.throws(() => buildPublishedOddsImport({ sheets: duplicate, tournamentId: "2026", tournamentYear: 2026,
    sourceWorkbookId: "preview", requestedBy: "Director" }),
  (error) => error.code === "DUPLICATE_PUBLISHED_ODDS_MILESTONE");
});

test("published Odds import is milestone ordered even when Google rows arrive out of order", () => {
  const reversed = sheets();
  reversed["Odds Snapshots"].records.reverse();
  reversed["Odds Team Results"].records.reverse();
  reversed["Odds Player Results"].records.reverse();
  const imported = buildPublishedOddsImport({ sheets: reversed, tournamentId: "2026", tournamentYear: 2026,
    sourceWorkbookId: "preview", requestedBy: "Director" });
  assert.deepEqual(imported.snapshots.map((item) => item.milestone), ["Pre-Tournament", "After Round 1"]);
});

test("Supabase projection retains complete milestone history for movement", () => {
  const imported = buildPublishedOddsImport({ sheets: sheets(), tournamentId: "2026", tournamentYear: 2026, sourceWorkbookId: "preview", requestedBy: "Director" });
  const view = { snapshots: imported.snapshots.map((item) => ({ payload: item.published_payload })) };
  const actual = publishedOddsSnapshotsFromView(view);
  assert.equal(comparePublishedOddsParity(imported.snapshots.map((item) => item.published_payload), actual).pass, true);
  assert.equal(actual[1].players[0].probability - actual[0].players[0].probability, 5);
});

test("published Odds parity ignores JSONB object-key ordering but not value changes", () => {
  const imported = buildPublishedOddsImport({ sheets: sheets(), tournamentId: "2026", tournamentYear: 2026,
    sourceWorkbookId: "preview", requestedBy: "Director" });
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  const expected = imported.snapshots.map((item) => item.published_payload);
  const jsonbOrdered = reorder(expected);
  assert.equal(comparePublishedOddsParity(expected, jsonbOrdered).pass, true);
  jsonbOrdered[1].players[0].probability += 0.1;
  assert.equal(comparePublishedOddsParity(expected, jsonbOrdered).pass, false);
});

test("published Odds source is Preview-only and Production fail-closed", () => {
  const base = { PUBLISHED_ODDS_READ_SOURCE: "supabase", GOOGLE_SHEETS_ID: "preview", PREVIEW_SCORING_SHEET_ID: "preview",
    SUPABASE_SCORING_MIRROR_URL: "https://preview.supabase.co", SUPABASE_SCORING_MIRROR_SECRET_KEY: "server" };
  assert.equal(publishedOddsReadEnvironment({ ...base, VERCEL_ENV: "preview" }).resolved, "supabase");
  assert.equal(publishedOddsReadEnvironment({ ...base, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(publishedOddsReadEnvironment({ ...base, VERCEL_ENV: "production" }).reason, "production-hard-block");
});

test("published Odds migration and participant adapter are service-only and calculation-free", async () => {
  const [migration, route, publisher, oddsEngine] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608120033_preview_published_odds_snapshots.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/leaderboards/insights/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/odds/publish/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/tournament-odds.js", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /odds_published_snapshots enable row level security/);
  assert.match(migration, /revoke all on function public\.replace_preview_published_odds_snapshots\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /unique \(tournament_id, milestone, published_at, payload_hash\)/);
  assert.match(migration, /publication_revision/);
  assert.match(migration, /DUPLICATE_PUBLISHED_ODDS_MILESTONE/);
  assert.match(route, /X-Published-Odds-Google-Requests", "0"/);
  assert.match(route, /resolveSupabaseParticipantIdentity/);
  assert.match(publisher, /Supabase publication projection/);
  assert.doesNotMatch(`${migration}\n${route}`, /simulateTournamentOdds|rng\(|Monte Carlo/);
  assert.match(oddsEngine, /odds-v2-nassau/);
});
