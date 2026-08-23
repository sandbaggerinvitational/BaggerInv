import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDraftPresentation,
  buildDraftProjection,
  compareDraftProjection,
  DRAFT_CONTRACT_VERSION,
  DRAFT_SOURCE_TABS,
  draftFingerprint,
  hydrateDraftPresentation,
} from "../lib/draft-contract.js";
import {
  draftReadEnvironment,
  requireDraftReadSource,
} from "../lib/draft-read-source.js";
import { draftProjectionFreshness } from "../lib/draft-freshness.js";

const root = new URL("../", import.meta.url);
const previewWorkbook = "preview-draft-workbook-123456789";
const previewEnv = {
  VERCEL_ENV: "preview",
  DRAFT_READ_SOURCE: "supabase",
  GOOGLE_SHEETS_ID: previewWorkbook,
  PREVIEW_SCORING_SHEET_ID: previewWorkbook,
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "test-secret",
};

const players = [
  ["CP01", "Captain Pickles"], ["JP01", "Captain Crispy"],
  ["P1", "Player One"], ["P2", "Player Two"],
  ["P3", "Player Three"], ["P4", "Player Four"],
].map(([id, name]) => ({ "Player ID": id, "Display Name": name, Slug: name.toLowerCase().replaceAll(" ", "-"), "Photo Filename": `${id}.png` }));
const playerMap = Object.fromEntries(players.map((player) => [player["Player ID"], player]));

function tournament(year) {
  const team1 = {
    id: year === 2025 ? "BANDONBROS" : "PICKLES", side: "Team 1", name: "Team One", logo: "one.png",
    captainId: "CP01", primaryColor: "#111111", secondaryColor: "#aaaaaa", averageHandicap: 5,
    roster: [{ player: playerMap.P1 }, { player: playerMap.P4 }],
  };
  const team2 = {
    id: year === 2025 ? "CRISPYBOYS" : "LIPPIT", side: "Team 2", name: "Team Two", logo: "two.png",
    captainId: "JP01", primaryColor: "#222222", secondaryColor: "#bbbbbb", averageHandicap: 6,
    roster: [{ player: playerMap.P2 }, { player: playerMap.P3 }],
  };
  return { id: String(year), year, teams: [team1, team2], team1, team2 };
}

const history = {
  getTournament: (year) => [2025, 2026].includes(Number(year)) ? tournament(Number(year)) : null,
  getTournaments: () => [tournament(2026), tournament(2025)],
  getPlayerMap: () => playerMap,
  getTournamentHandicap: (playerId, year) => Number(year) - 2020 + Number(playerId.replace(/\D/g, "") || 0),
};

const settingsRows = [
  {
    Year: 2025, "Draft Name Override": "", "Draft Date": "6/7/2026", "Draft Time": "8:00 PM", "Time Zone": "CST",
    "Draft Location": "Online", "Draft Status Mode": "Complete", "Draft Format": "Snake", "Total Picks": 4,
    "Team 1 ID": "BANDONBROS", "Team 2 ID": "CRIPSYBOYS", "Team 1 Captain Player ID": "CP01",
    "Team 2 Captain Player ID": "JP01", "First Pick Team ID": "BANDONBROS", Notes: "",
  },
  {
    Year: 2026, "Draft Name Override": "", "Draft Date": "7/12/2026", "Draft Time": "7:00 PM", "Time Zone": "CST",
    "Draft Location": "Online", "Draft Status Mode": "Complete", "Draft Format": "Snake", "Total Picks": 4,
    "Team 1 ID": "PICKLES", "Team 2 ID": "LIPPIT", "Team 1 Captain Player ID": "CP01",
    "Team 2 Captain Player ID": "JP01", "First Pick Team ID": "PICKLES", Notes: "",
  },
];

function picksFor(year, teams) {
  return [
    [1, teams[0], "P1"], [2, teams[1], "P2"], [3, teams[1], "P3"], [4, teams[0], "P4"],
  ].map(([pick, team, player]) => ({ Year: year, "Pick Number": pick, "Team ID": team, "Player ID": player, "Selected At": "", "Selected By": "", Notes: "" }));
}

const pickRows = [
  ...picksFor(2025, ["BANDONBROS", "CRISPYBOYS"]),
  ...picksFor(2026, ["PICKLES", "LIPPIT"]),
];

test("Draft contract preserves the complete two-tab field contract and stable identities", () => {
  const projection = buildDraftProjection({ settingsRows, pickRows, history, sourceWorkbookId: previewWorkbook, requestedBy: "DIRECTOR" });
  assert.equal(projection.contract_version, DRAFT_CONTRACT_VERSION);
  assert.deepEqual(projection.source_tabs, DRAFT_SOURCE_TABS);
  assert.deepEqual(projection.drafts.map((draft) => draft.tournament_year), [2025, 2026]);
  assert.equal(projection.drafts.reduce((sum, draft) => sum + draft.picks.length, 0), 8);
  assert.equal(projection.drafts.every((draft) => draft.validation_status === "VALID"), true);
  const draft2025 = projection.drafts[0];
  assert.equal(draft2025.source_settings["Team 2 ID"], "CRIPSYBOYS");
  assert.equal(draft2025.configuration.team_2_id, "CRISPYBOYS");
  assert.equal(draft2025.validation_diagnostics.corrections.some((item) => item.category === "TEAM_ID_ALIAS"), true);
  assert.equal(draft2025.picks[0].round_number, 1);
  assert.equal(draft2025.picks[2].round_number, 2);
  assert.equal(draft2025.picks[2].pick_within_round, 1);
  assert.equal(draft2025.picks.every((pick) => pick.status === "SELECTED"), true);
  for (const key of ["source_fingerprint", "configuration_fingerprint", "picks_fingerprint", "payload_fingerprint"]) {
    assert.match(draft2025[key], /^[0-9a-f]{64}$/);
  }
});

test("projection is deterministic, source ordered, and omits years with no recorded Draft", () => {
  const first = buildDraftProjection({ settingsRows, pickRows, history, sourceWorkbookId: previewWorkbook, requestedBy: "DIRECTOR" });
  const second = buildDraftProjection({ settingsRows: [...settingsRows].reverse(), pickRows: [...pickRows].reverse(), history, sourceWorkbookId: previewWorkbook, requestedBy: "DIRECTOR" });
  assert.equal(first.synchronization_fingerprint, second.synchronization_fingerprint);
  assert.equal(compareDraftProjection(first.drafts, second.drafts).pass, true);
  assert.deepEqual(first.drafts.map((draft) => draft.tournament_year), [2025, 2026]);
  assert.equal(first.drafts.some((draft) => draft.tournament_year < 2025), false);
});

test("presentation hydration preserves existing Draft UI semantics without time in the fingerprint", () => {
  const projection = buildDraftProjection({ settingsRows, pickRows, history, sourceWorkbookId: previewWorkbook, requestedBy: "DIRECTOR" });
  const source = projection.drafts[1];
  const hydrated = hydrateDraftPresentation(source.presentation_seed);
  const legacy = buildDraftPresentation(settingsRows[1], pickRows, history);
  assert.deepEqual(hydrated, legacy);
  assert.equal(hydrated.state, "complete");
  assert.equal(hydrated.draftedCount, 4);
  assert.equal(hydrated.rosters.reduce((sum, roster) => sum + roster.picks.length, 0), 4);
  assert.equal(source.payload_fingerprint, draftFingerprint({ configuration: source.configuration, picks: source.picks, presentationSeed: source.presentation_seed }));
});

test("source order overrides are retained while invalid identity and orphan facts fail closed", () => {
  const sourceOrderOverride = buildDraftProjection({
    settingsRows: settingsRows.map((row) => row.Year === 2026 ? { ...row, "First Pick Team ID": "LIPPIT" } : row),
    pickRows,
    history,
    sourceWorkbookId: previewWorkbook,
  });
  const overriddenDraft = sourceOrderOverride.drafts.find((draft) => draft.tournament_year === 2026);
  assert.equal(overriddenDraft.picks[0].team_id, "PICKLES");
  assert.ok(overriddenDraft.validation_diagnostics.corrections.some((entry) => entry.category === "SOURCE_TEAM_ORDER_OVERRIDE" && entry.year === 2026 && entry.pickNumber === 1));
  assert.throws(() => buildDraftProjection({ settingsRows, pickRows: pickRows.map((row) => row.Year === 2026 && row["Pick Number"] === 2 ? { ...row, "Team ID": "PICKLES" } : row), history, sourceWorkbookId: previewWorkbook }), (error) => error.code === "DRAFT_PICK_ROSTER_TEAM_MISMATCH");
  assert.throws(() => buildDraftProjection({ settingsRows, pickRows: pickRows.map((row) => row.Year === 2026 && row["Pick Number"] === 2 ? { ...row, "Player ID": "P1" } : row), history, sourceWorkbookId: previewWorkbook }), (error) => error.code === "DRAFT_PLAYER_DUPLICATE");
  assert.throws(() => buildDraftProjection({ settingsRows, pickRows: pickRows.map((row) => row.Year === 2026 && row["Pick Number"] === 2 ? { ...row, "Player ID": "UNKNOWN" } : row), history, sourceWorkbookId: previewWorkbook }), (error) => error.code === "DRAFT_PLAYER_ID_UNRESOLVED");
  assert.throws(() => buildDraftProjection({ settingsRows: settingsRows.map((row) => row.Year === 2026 ? { ...row, "Team 1 ID": "TYPO" } : row), pickRows, history, sourceWorkbookId: previewWorkbook }), (error) => error.code === "DRAFT_CONFIGURATION_TEAM_UNRESOLVED");
  assert.throws(() => buildDraftProjection({ settingsRows: settingsRows.map((row) => row.Year === 2026 ? { ...row, "Team 1 Captain Player ID": "UNKNOWN" } : row), pickRows, history, sourceWorkbookId: previewWorkbook }), (error) => error.code === "DRAFT_CAPTAIN_ID_UNRESOLVED");
  assert.throws(() => buildDraftProjection({ settingsRows, pickRows: [...pickRows, { Year: 2024, "Pick Number": 1, "Team ID": "X", "Player ID": "P1" }], history, sourceWorkbookId: previewWorkbook }), (error) => error.code === "DRAFT_SETTINGS_REQUIRED_FOR_PICKS");
});

test("an in-progress Draft remains versionable with explicit pending selections", () => {
  const currentSettings = { ...settingsRows[1], "Draft Status Mode": "Live" };
  const partial = pickRows.filter((row) => row.Year === 2026 && row["Pick Number"] <= 2);
  const projection = buildDraftProjection({ settingsRows: [currentSettings], pickRows: partial, history, sourceWorkbookId: previewWorkbook });
  const hydrated = hydrateDraftPresentation(projection.drafts[0].presentation_seed);
  assert.equal(hydrated.state, "live");
  assert.equal(hydrated.draftedCount, 2);
  assert.deepEqual(hydrated.picks.filter((pick) => pick.status === "PENDING").map((pick) => pick.pickNumber), [3, 4]);
});

test("Draft source selection is reversible, Preview-only, isolated, and fail-closed", () => {
  const sequence = ["google", "supabase", "google", "supabase"].map((source) =>
    draftReadEnvironment({ ...previewEnv, DRAFT_READ_SOURCE: source }).resolved
  );
  assert.deepEqual(sequence, ["google", "supabase", "google", "supabase"]);
  const production = draftReadEnvironment({ ...previewEnv, VERCEL_ENV: "production" });
  assert.equal(production.productionBlocked, true);
  assert.equal(production.resolved, "google");
  const missing = { ...previewEnv, SUPABASE_SCORING_MIRROR_SECRET_KEY: "" };
  assert.equal(draftReadEnvironment(missing).blocked, true);
  assert.throws(() => requireDraftReadSource(missing), /supabase-credentials-required/);
  const wrongProject = { ...previewEnv, SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co.evil.example" };
  assert.equal(draftReadEnvironment(wrongProject).blocked, true);
  const productionWorkbook = { ...previewEnv, GOOGLE_SHEETS_ID: "1umqPxiQxN9_jwmsD7IcVTzqxPmMycYLlrY_gm31l5U4", PREVIEW_SCORING_SHEET_ID: "" };
  assert.equal(draftReadEnvironment(productionWorkbook).blocked, true);
});

test("freshness distinguishes current, stale, unknown, and unavailable projections", () => {
  const projection = buildDraftProjection({ settingsRows, pickRows, history, sourceWorkbookId: previewWorkbook });
  const stored = projection.drafts.map((draft) => ({ tournament_year: draft.tournament_year, source_fingerprint: draft.source_fingerprint }));
  assert.equal(draftProjectionFreshness({ storedDrafts: stored, sourceProjection: projection }).status, "CURRENT");
  const changed = buildDraftProjection({ settingsRows: settingsRows.map((row) => Number(row.Year) === 2026 ? { ...row, Notes: "changed" } : row), pickRows, history, sourceWorkbookId: previewWorkbook });
  assert.equal(draftProjectionFreshness({ storedDrafts: stored, sourceProjection: changed }).status, "STALE");
  assert.equal(draftProjectionFreshness({ storedDrafts: stored }).status, "UNKNOWN");
  assert.equal(draftProjectionFreshness({ storedDrafts: [] }).status, "UNAVAILABLE");
});

test("schema, synchronization, services, routes, analytics, and profiles share one protected contract", async () => {
  const [sql, orderCorrectionSql, sync, service, source, route, draft, runtime, draftPage, yearPage, analyticsPage, profile, cms, analysis] = await Promise.all([
    readFile(new URL("../supabase/migrations/202608220003_preview_versioned_draft_projection.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202608220005_preview_draft_authoritative_pick_order.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft-synchronization.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft-service.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft-read-source.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/draft-projection/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft-runtime.js", import.meta.url), "utf8"),
    readFile(new URL("../app/draft/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/draft/[year]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/draft/analytics/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/players/[slug]/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/cms/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/draft-analysis.js", import.meta.url), "utf8"),
  ]);
  assert.match(sql, /create table scoring_authority\.draft_revisions/);
  assert.match(sql, /create table scoring_authority\.draft_configuration_facts/);
  assert.match(sql, /create table scoring_authority\.draft_pick_facts/);
  assert.match(sql, /references scoring_authority\.players/);
  assert.match(sql, /references scoring_authority\.teams/);
  assert.match(sql, /DRAFT_HISTORICAL_CORRECTION_REASON_REQUIRED/);
  assert.match(sql, /import_preview_draft_projection/);
  assert.match(sql, /read_preview_draft_view/);
  assert.match(sql, /revoke all .*anon,authenticated/s);
  assert.match(sql, /grant execute .*service_role/s);
  assert.match(orderCorrectionSql, /Draft Picks\.Team ID is the authoritative historical selecting-team fact/);
  assert.doesNotMatch(orderCorrectionSql, /DRAFT_PICK_ORDER_INVALID/);
  assert.match(orderCorrectionSql, /DRAFT_PICK_NUMBER_SEQUENCE_INVALID/);
  assert.match(orderCorrectionSql, /DRAFT_PICK_ROSTER_TEAM_MISMATCH/);
  assert.match(sync, /readWorkbookSheetsByName/);
  assert.match(sync, /DRAFT_SOURCE_TABS/);
  assert.doesNotMatch(sync, /loadDraftSheets|loadPredictionSheets|refreshHistoricalData/);
  assert.match(route, /authorizePreviewDirector/);
  assert.match(service, /fallbackUsed: false/);
  assert.match(service, /googleDraftRequests: 0/);
  assert.match(source, /production-hard-block/);
  assert.match(draft, /scope: "YEARS"/);
  assert.match(draft, /scope: "YEAR"/);
  assert.match(draft, /scope: "CURRENT"/);
  assert.match(draft, /scope: "PLAYER"/);
  assert.match(runtime, /readPublishedOddsView/);
  assert.match(runtime, /sourceWorkbookId: env\.GOOGLE_SHEETS_ID/);
  assert.doesNotMatch(runtime, /loadDraftSheets/);
  for (const page of [draftPage, yearPage, analyticsPage]) {
    assert.match(page, /loadDraftRuntime/);
    assert.doesNotMatch(page, /refreshHistoricalData/);
  }
  assert.match(profile, /getPlayerDrafts/);
  assert.doesNotMatch(profile, /getDrafts/);
  assert.match(cms, /synchronizeDraftProjection/);
  assert.match(analysis, /options\.readOddsSnapshots/);
  assert.doesNotMatch(runtime, /from ["']\.\/odds-loader/);
});
