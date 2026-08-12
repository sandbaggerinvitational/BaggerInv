import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { homeReadEnvironment } from "../lib/home-read-source.js";
import { buildParticipantHomePresentationImport } from "../lib/participant-home-supabase.js";
import {
  participantHomeCacheVersion,
  readParticipantHomeCache,
  writeParticipantHomeCache,
} from "../lib/participant-home-cache.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const preview = {
  VERCEL_ENV: "preview",
  GOOGLE_SHEETS_ID: "preview-workbook",
  PREVIEW_SCORING_SHEET_ID: "preview-workbook",
  SUPABASE_SCORING_MIRROR_URL: "https://idgigvjjqkfbqjeredpb.supabase.co",
  SUPABASE_SCORING_MIRROR_SECRET_KEY: "server-secret",
  HOME_READ_SOURCE: "supabase",
};

test("Home Supabase source is Preview-only and Production fails closed to Google", () => {
  assert.equal(homeReadEnvironment(preview).resolved, "supabase");
  assert.equal(homeReadEnvironment({ ...preview, VERCEL_ENV: "production" }).resolved, "google");
  assert.equal(homeReadEnvironment({ ...preview, GOOGLE_SHEETS_ID: "production-workbook",
    PREVIEW_SCORING_SHEET_ID: "preview-workbook" }).blocked, true);
  assert.equal(homeReadEnvironment({ VERCEL_ENV: "preview" }).resolved, "google");
});

test("Home presentation imports schedule and participant-only Net Skins display summaries", () => {
  const imported = buildParticipantHomePresentationImport({ sourceWorkbookId: "preview-workbook", requestedBy: "Director", liveData: {
    tournament: { id: "2026", year: 2026, name: "Sandbagger Invitational", status: "Live", currentRound: 3, timeZone: "America/Chicago" },
    timeline: { available: true, events: [{ id: "breakfast", displayOnHome: true }, { id: "hidden", displayOnHome: false }] },
    players: [{ id: "CB01" }, { id: "HM01" }],
    netSkins: { rounds: [{ round: 3, format: "SI", leaderboard: [
      { playerIds: ["CB01"], skinsWon: 2, totalWinnings: 40 },
      { playerIds: ["HM01"], skinsWon: 1, totalWinnings: 20 },
    ] }] },
  } });
  assert.equal(imported.tournament_id, "2026");
  assert.deepEqual(imported.presentation.timeline.events.map((row) => row.id), ["breakfast"]);
  assert.deepEqual(imported.presentation.netSkinsByPlayer.CB01.rounds, [
    { round: 3, format: "SI", playerIds: ["CB01"], skinsWon: 2, totalWinnings: 40 },
  ]);
});

test("Home migration and request path are service-only, participant-scoped, and Google-free", async () => {
  const [migration, route, page, loader, adapter, commandCenter, menu] = await Promise.all([
    source("supabase/migrations/202608120024_preview_participant_home_reads.sql"),
    source("app/api/participant/home/route.js"), source("app/home/page.js"),
    source("app/ParticipantSupabaseHome.js"), source("lib/participant-home-supabase.js"),
    source("app/TournamentCommandCenter.js"), source("app/Menu.js"),
  ]);
  assert.match(migration, /create table scoring_authority\.participant_home_presentations/);
  assert.match(migration, /create or replace function public\.read_participant_home_view/);
  assert.match(migration, /alter table scoring_authority\.participant_home_presentations enable row level security/);
  assert.match(migration, /revoke all on function public\.read_participant_home_view\(text, text\) from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy|using\s*\(\s*true\s*\)/i);
  assert.match(route, /resolveSupabaseParticipantIdentity/);
  assert.match(route, /readParticipantHomeView/);
  assert.match(route, /X-Home-Google-Requests/);
  assert.doesNotMatch(route, /getTournamentData|google-sheets|\/api\/live/);
  assert.match(page, /source\.resolved === "supabase"/);
  assert.match(loader, /\/api\/participant\/home/);
  assert.match(loader, /router\.prefetch\("\/my-match"\)/);
  assert.match(adapter, /participantHomeDataFromSupabaseView/);
  assert.match(commandCenter, /initialParticipantData/);
  assert.match(menu, /window\.__sbiTournamentIdentity/);
});

test("Home display cache is identity-scoped, revisioned, and never used as scoring authorization", () => {
  const previousWindow = globalThis.window;
  const session = new Map();
  const local = new Map([["sbi-participant-shell", JSON.stringify({ id: "CB01", name: "Clay Beltran" })]]);
  const storage = (map) => ({ getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) });
  globalThis.window = { sessionStorage: storage(session), localStorage: storage(local) };
  try {
    const payload = { player: { id: "CB01" }, participant: { matches: [] }, liveData: { tournament: { id: "2026" } }, revision: "abc" };
    writeParticipantHomeCache(payload);
    assert.equal(JSON.parse(session.get("sbi-participant-home")).version, participantHomeCacheVersion);
    assert.deepEqual(readParticipantHomeCache(), payload);
    local.set("sbi-participant-shell", JSON.stringify({ id: "HM01" }));
    assert.equal(readParticipantHomeCache(), null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("secondary Home projections cannot block canonical identity and live-match assembly", async () => {
  const [migration, route, component] = await Promise.all([
    source("supabase/migrations/202608120024_preview_participant_home_reads.sql"),
    source("app/api/participant/home/route.js"),
    source("app/PersonalizedPlayerHome.js"),
  ]);
  assert.match(migration, /left join scoring_authority\.game_center_presentations/);
  assert.match(migration, /select to_jsonb\(hp\) into home_presentation_value/);
  assert.doesNotMatch(migration, /HOME_PRESENTATION_NOT_IMPORTED/);
  assert.match(route, /Home is temporarily unavailable/);
  assert.match(component, /secondaryReady \? <PlayerNetSkins/);
});
