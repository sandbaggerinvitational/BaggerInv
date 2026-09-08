import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductionGuideAuthoring } from "../lib/production-guide-authoring-contract.js";
import { OPTIONAL_GUIDE_DOMAINS } from "../lib/guide-publication-policy.js";
import { mobileGuideDataFromProjection, mobileGuideResult } from "../lib/mobile-v1-guide.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

// Synthetic authoring input crosses the actual Production publication and
// participant projection boundaries before reaching the committed mobile DTO.
const identity = { playerId: "P1", tournamentId: "2026", context: {
  membership: { active: true }, tournament: { id: "2026", year: 2026 },
} };
const contexts = ["BB", "SC", "SI"].map((format, index) => ({
  course_id: `COURSE0${index + 1}`, tee: "Gold", slope: 136, rating: 72,
  par: 72, configuration_consistent: true,
  rounds: [{ round_number: index + 1, format, status: "UPCOMING" }],
  holes: Array.from({ length: 18 }, (_, hole) => ({
    hole_number: hole + 1, yardage: 350 + hole, par: 4, stroke_index: hole + 1,
  })),
}));
const optionalRows = {
  overview: [{ "Section ID": "welcome", "Section Name": "Welcome", "Section Slug": "welcome",
    Description: "Published welcome", "Display Order": "1", Status: "Published" }],
  timelineRows: [{ Year: "2026", "Tournament Day": "Friday", "Event Date": "2026-09-25",
    "Start Time": "07:00", "Event Type": "Social", Title: "Welcome", "Sort Order": "1" }],
  ruleBook: [{ "Rule ID": "rule-1", Category: "Scoring", Title: "Scoring", Body: "Published rule",
    "Display Order": "1", Status: "Published", "Effective Year": "2026", Important: "FALSE" }],
  dining: [{ Year: "2026", Day: "Friday", Meal: "Dinner", Location: "Clubhouse", "Sort Order": "1" }],
  localGuide: [{ Year: "2026", Section: "Transportation", Title: "Shuttle", "Sort Order": "1" }],
  importantContacts: [{ Year: "2026", Category: "Tournament", Name: "Test liaison", "Sort Order": "1" }],
};
function content() {
  return {
    tournament: { "Tournament ID": "2026", Year: "2026", "Tournament Name": "Test Invitational",
      "Tournament Edition": "2026 Guide", "Tournament Dates": "September 25–26",
      Destination: "Test destination", "Time Zone": "America/New_York" },
    ...Object.fromEntries(OPTIONAL_GUIDE_DOMAINS.map(key => [key, []])),
    schedule: [{ "Event ID": "welcome", "Event Date": "2026-09-25", "Start Time": "07:00",
      "Day Label": "Friday", "Event Type": "Social", Title: "Welcome",
      "Display Order": "1", Status: "Published" }],
    courses: contexts.map((row, index) => ({ "Course ID": row.course_id, Round: String(index + 1),
      Format: row.rounds[0].format, Course: `Test course ${index + 1}` })),
    tournamentRules: contexts.map((row, index) => ({ Round: String(index + 1),
      Format: row.rounds[0].format, "Points Available": index === 2 ? "1" : "3" })),
    rounds: contexts.map(row => ({ "Format ID": row.rounds[0].format, Name: row.rounds[0].format,
      "Team Size": row.rounds[0].format === "SI" ? "1" : "2" })),
  };
}
function publishedRead(value = content()) {
  const publication = normalizeProductionGuideAuthoring({ content: value,
    targetTournamentId: "2026", canonicalCourseContext: contexts });
  return { payload: { ok: true, data: {
    tournament: { tournament_id: "2026", tournament_year: 2026 },
    projection_revision: 1, publication_sequence: 1, delivery_fingerprint: "a".repeat(64),
    published_at: "2026-09-08T12:00:00.000Z", content: publication.projectionPayload,
    course_context: contexts,
  } } };
}
async function result(read) {
  return mobileGuideResult(identity, { env: {}, now: new Date("2026-09-08T12:01:00Z"),
    dependencies: { readGuideProjection: async ({ tournamentId, surface }) => {
      assert.equal(tournamentId, "2026"); assert.equal(surface, "guide"); return read;
    } },
  });
}

test("PN-6B minimum published Production Guide remains published with empty optional mobile collections", async () => {
  const input = content(), before = structuredClone(input);
  const response = await result(publishedRead(input));
  assert.equal(response.status, 200);
  const data = response.body.data;
  assert.equal(data.publicationState, "PUBLISHED");
  for (const key of ["overview", "dining", "localGuide", "contacts"]) assert.deepEqual(data[key], []);
  assert.deepEqual(data.rules.items, []);
  assert.deepEqual(data.rules.roundFormats.map(row => row.format), ["BB", "SC", "SI"]);
  assert.equal(data.courses.length, 3);
  for (const course of data.courses) {
    assert.equal(course.assignments[0].holes.length, 18);
    assert.equal(course.assignments[0].par, 72);
  }
  assert.equal(data.tournament.heroAssetKey, null);
  assert.equal(data.tournament.mobileHeroAssetKey, null);
  assert.equal("schedule" in data, false); // Separate committed Schedule contract.
  assert.deepEqual(input, before);
  await assertMobileV1Schema("guide", response.body);
});

test("PN-6B each optional Production domain independently survives the existing mobile contract", async () => {
  const mobileKeys = { overview: "overview", ruleBook: "rules", dining: "dining",
    localGuide: "localGuide", importantContacts: "contacts" };
  for (const key of OPTIONAL_GUIDE_DOMAINS) {
    const input = content(); input[key] = structuredClone(optionalRows[key]);
    const response = await result(publishedRead(input));
    await assertMobileV1Schema("guide", response.body);
    assert.equal(response.body.data.publicationState, "PUBLISHED");
    if (key === "ruleBook") assert.equal(response.body.data.rules.items.length, 1);
    else if (mobileKeys[key]) assert.equal(response.body.data[mobileKeys[key]].length, 1);
    else assert.equal("timelineRows" in response.body.data, false);
  }
});

test("PN-6B unpublished Guide remains distinct from a valid published Guide without optional content", async () => {
  const response = await result({ payload: { ok: false, code: "GUIDE_PROJECTION_NOT_PUBLISHED" } });
  assert.equal(response.body.data.publicationState, "UNPUBLISHED");
  assert.equal(response.body.data.tournament, null);
  assert.deepEqual(response.body.data.courses, []);
  await assertMobileV1Schema("guide", response.body);
});

test("PN-6B real publication still rejects missing itinerary and malformed optional content", () => {
  const missing = content(); missing.schedule = [];
  assert.throws(() => publishedRead(missing));
  const invalid = content(); invalid.overview = [{ ...optionalRows.overview[0], Description: "" }];
  assert.throws(() => publishedRead(invalid));
});

test("PN-6B optional-content publication does not weaken canonical tournament or membership checks", () => {
  const read = publishedRead();
  assert.throws(() => mobileGuideDataFromProjection(read, { ...identity, tournamentId: "2027" }));
  assert.throws(() => mobileGuideDataFromProjection(read, { ...identity,
    context: { ...identity.context, membership: { active: false } } }));
  const wrongYear = structuredClone(read); wrongYear.payload.data.tournament.tournament_year = 2027;
  assert.throws(() => mobileGuideDataFromProjection(wrongYear, identity));
});
