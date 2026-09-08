import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MOBILE_GUIDE_CONTRACT_VERSION,
  MOBILE_GUIDE_LIMITS,
  MOBILE_GUIDE_PUBLICATION_STATES,
  mobileGuideDataFromProjection,
  mobileGuideRepresentationRevision,
  mobileGuideResult,
} from "../lib/mobile-v1-guide.js";
import { assertMobileV1Schema } from "./support/mobile-v1-schema-validator.mjs";

const identity = {
  playerId: "P1",
  tournamentId: "2026",
  context: {
    membership: { active: true },
    tournament: { id: "2026", year: 2026 },
  },
};
const now = new Date("2026-09-20T18:00:00.000Z");

function holes(overrides = {}) {
  return Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    par: 4,
    yardage: 350 + index,
    stroke_index: index + 1,
    ...overrides,
  }));
}

function publishedRead(overrides = {}) {
  const data = {
    tournament: { tournament_id: "2026", tournament_year: 2026, name: "Bagger Invitational" },
    projection_revision: 9,
    publication_sequence: 12,
    delivery_fingerprint: "a".repeat(64),
    published_at: "2026-09-19T15:00:00.000Z",
    course_context: [{
      course_id: "TPGC01",
      tee: "Gold",
      rating: 72.4,
      slope: 138,
      par: 72,
      rounds: [{ round_number: 1, format: "BB" }],
      holes: holes(),
    }],
    content: {
      schemaVersion: "guide-projection-v1",
      content: {
        tournamentIdentity: {
          id: "2026",
          year: 2026,
          name: "Bagger Invitational",
          editionTitle: "The 2026 Bagger",
          dates: "September 24–27",
          location: "Kiawah Island",
          timeZone: "America/New_York",
          logoFileName: "tournaments/bagger-2026.png",
          heroImageFileName: "https://unapproved.example/hero.webp",
          mobileHeroImageFileName: "../private/mobile.webp",
        },
        overview: [{
          "Section ID": "rules-overview",
          "Section Slug": "rules",
          "Section Name": "Rules",
          Description: "Official competition rules.",
          "Display Order": "2",
        }, {
          "Section ID": "welcome",
          "Section Slug": "overview",
          "Section Name": "Welcome",
          Description: "Everything you need for tournament week.",
          "Display Order": "1",
        }],
        schedule: [{ Title: "Must remain owned by /schedule" }],
        ruleBook: [{
          "Rule ID": "RULE-1",
          Category: "Competition",
          Subcategory: "Scoring",
          Title: "Nassau",
          Body: "Front, back, and overall are each worth one point.",
          "Display Order": "1",
          "Effective Year": "2026",
          Important: "TRUE",
          "Director Notes": "must-not-appear",
        }],
        tournamentRules: [{
          Year: "2026",
          Round: "Round 1",
          Format: "BB",
          "Team Size": "2",
          "Points Available": "3",
          "Front 9 Used": "TRUE",
          "Back 9 Used": "TRUE",
          "Overall Used": "TRUE",
          "Front 9 Points": "1",
          "Back 9 Points": "1",
          "Overall Points": "1",
          Description: "Best Ball round.",
          Rules: "Use the better net score.",
          "Handicap Allocation": "100%",
          "Scoring Format": "Nassau",
        }],
        rounds: [{
          "Format ID": "BB",
          Name: "Best Ball",
          "Team Size": "2",
          Description: "Catalog description.",
        }],
        courses: [{
          "Course ID": "TPGC01",
          Round: "1",
          Format: "BB",
          Course: "Turtle Point",
          City: "Kiawah Island",
          State: "SC",
          Destination: "Kiawah Island, SC",
          "Year Opened": "1981",
          Designer: "Jack Nicklaus",
          Website: "turtle.example",
          "GPS Link": "http://legacy.example/directions",
          "Course Logo": "courses/logos/turtle-point.png",
          "Course Profile Image": "data:image/png;base64,unsafe",
          "Course Overview": "A canonical course overview.",
          "Playing Tips": "Respect the wind.",
          "Signature Holes": "Fourteenth hole.",
          History: "Opened in 1981.",
        }],
        dining: [{
          Year: "2026",
          Day: "Friday",
          Meal: "Dinner",
          Cuisine: "Steakhouse",
          "Start Time": "7:00 PM",
          "End Time": "9:00 PM",
          Location: "Clubhouse",
          "Dress Code": "Resort casual",
          "Reservations Required": "TRUE",
          Notes: "Meet in the lobby.",
          "Sort Order": "1",
        }],
        localGuide: [{
          Year: "2026",
          Section: "Transportation",
          Title: "Tournament Shuttle",
          Description: "Runs throughout the weekend.",
          Address: "1 Main Street",
          Phone: "+1 (843) 555-0100",
          Website: "javascript:alert(1)",
          "Sort Order": "1",
        }],
        importantContacts: [{
          Year: "2026",
          Category: "Tournament",
          Name: "Tournament Concierge",
          Role: "Participant support",
          Phone: "+1 (843) 555-0101",
          "Text Enabled": "TRUE",
          Email: "support@example.com",
          Website: "https://example.com/help",
          "Sort Order": "1",
          "Private Notes": "must-not-appear",
        }],
      },
    },
  };
  Object.assign(data, overrides);
  return { payload: { ok: true, data } };
}

test("published Guide maps the canonical structured products without duplicating Schedule", async () => {
  const result = await mobileGuideResult(identity, {
    now,
    dependencies: { readGuideProjection: async () => publishedRead() },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.contractVersion, MOBILE_GUIDE_CONTRACT_VERSION);
  assert.equal(result.body.data.publicationState, "PUBLISHED");
  assert.ok(Buffer.byteLength(JSON.stringify(result.body.data), "utf8") <=
    MOBILE_GUIDE_LIMITS.responseBytes);
  assert.equal(result.body.data.publishedAt, "2026-09-19T15:00:00.000Z");
  assert.equal(result.body.data.tournament.tournamentId, "2026");
  assert.deepEqual(result.body.data.overview.map((row) => row.sectionId), ["welcome", "rules-overview"]);
  assert.equal(result.body.data.rules.roundFormats[0].format, "BB");
  assert.equal(result.body.data.rules.roundFormats[0].pointsAvailable, 3);
  assert.equal(result.body.data.rules.items[0].important, true);
  assert.equal(result.body.data.dining[0].reservationRequired, true);
  assert.equal(Object.hasOwn(result.body.data, "schedule"), false);
  assert.equal(JSON.stringify(result.body).includes("Must remain owned by /schedule"), false);
  assert.equal(JSON.stringify(result.body).includes("Director Notes"), false);
  assert.equal(JSON.stringify(result.body).includes("Private Notes"), false);
  assert.match(result.revision, /^[0-9a-f]{64}$/);
  assert.equal(result.revision, result.body.meta.revision);
  await assertMobileV1Schema("guide", result.body);
});

test("Guide accepts canonical Round labels while malformed labels fail closed", () => {
  const canonical = mobileGuideDataFromProjection(publishedRead(), identity);
  assert.equal(canonical.rules.roundFormats[0].roundNumber, 1);

  const numericCompatibility = publishedRead();
  numericCompatibility.payload.data.content.content.tournamentRules[0].Round = "1";
  assert.equal(mobileGuideDataFromProjection(numericCompatibility, identity)
    .rules.roundFormats[0].roundNumber, 1);

  for (const label of ["Round 0", "Round 100", "Round 1.5", "Round One", "Round 1 Final"]) {
    const malformed = publishedRead();
    malformed.payload.data.content.content.tournamentRules[0].Round = label;
    assert.throws(() => mobileGuideDataFromProjection(malformed, identity),
      (error) => error.code === "MOBILE_API_UNAVAILABLE", label);
  }
});

test("Guide preserves canonical order keys for equally ordered curated rows", () => {
  const read = publishedRead();
  const content = read.payload.data.content.content;
  content.dining.push({ ...content.dining[0], Day: "Thursday", Meal: "Lunch" });
  content.localGuide.push({ ...content.localGuide[0], Section: "Activities", Title: "Beach Walk" });
  content.importantContacts.push({ ...content.importantContacts[0], Category: "Emergency", Name: "Security" });
  const data = mobileGuideDataFromProjection(read, identity);
  assert.deepEqual(data.dining.map((row) => `${row.day}:${row.meal}`), ["Friday:Dinner", "Thursday:Lunch"]);
  assert.deepEqual(data.localGuide.map((row) => `${row.category}:${row.title}`),
    ["Activities:Beach Walk", "Transportation:Tournament Shuttle"]);
  assert.deepEqual(data.contacts.map((row) => `${row.category}:${row.name}`),
    ["Emergency:Security", "Tournament:Tournament Concierge"]);
});

test("course DTO uses fresh canonical scoring context and requires exact ordered hole authority", () => {
  const data = mobileGuideDataFromProjection(publishedRead(), identity);
  const course = data.courses[0];
  assert.equal(course.courseId, "TPGC01");
  assert.equal(course.assignments[0].tee, "Gold");
  assert.equal(course.assignments[0].rating, 72.4);
  assert.equal(course.assignments[0].slope, 138);
  assert.equal(course.assignments[0].par, 72);
  assert.equal(course.assignments[0].yardage, holes().reduce((sum, hole) => sum + hole.yardage, 0));
  assert.deepEqual(course.assignments[0].holes.map((hole) => hole.holeNumber), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.deepEqual(course.assignments[0].holes.map((hole) => hole.strokeIndex), Array.from({ length: 18 }, (_, index) => index + 1));

  const missingOptionalYardage = publishedRead();
  missingOptionalYardage.payload.data.course_context[0].holes[0].yardage = null;
  const optionalYardageData = mobileGuideDataFromProjection(missingOptionalYardage, identity);
  assert.equal(optionalYardageData.courses[0].assignments[0].yardage, null);
  assert.equal(optionalYardageData.courses[0].assignments[0].holes[0].yardage, null);

  const invalid = publishedRead();
  invalid.payload.data.course_context[0].holes.pop();
  assert.throws(() => mobileGuideDataFromProjection(invalid, identity),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const invalidAggregate = publishedRead();
  invalidAggregate.payload.data.course_context[0].par = 71;
  assert.throws(() => mobileGuideDataFromProjection(invalidAggregate, identity),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const orphanContext = publishedRead();
  orphanContext.payload.data.course_context.push({
    ...orphanContext.payload.data.course_context[0],
    course_id: "ORPHAN",
  });
  assert.throws(() => mobileGuideDataFromProjection(orphanContext, identity),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("Guide supports a published empty course catalog and keeps long assignment IDs schema-safe", () => {
  const noCourses = publishedRead();
  noCourses.payload.data.content.content.courses = [];
  noCourses.payload.data.course_context = [];
  assert.deepEqual(mobileGuideDataFromProjection(noCourses, identity).courses, []);

  const longCourse = publishedRead();
  const courseId = `C${"A".repeat(159)}`;
  longCourse.payload.data.content.content.courses[0]["Course ID"] = courseId;
  longCourse.payload.data.course_context[0].course_id = courseId;
  const assignmentId = mobileGuideDataFromProjection(longCourse, identity)
    .courses[0].assignments[0].assignmentId;
  assert.ok(assignmentId.length <= 160);
  assert.match(assignmentId, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
});

test("Guide exposes only safe HTTPS actions and traversal-free asset keys", () => {
  const data = mobileGuideDataFromProjection(publishedRead(), identity);
  assert.equal(data.tournament.logoAssetKey, "tournaments/bagger-2026.png");
  assert.equal(data.tournament.heroAssetKey, null);
  assert.equal(data.tournament.mobileHeroAssetKey, null);
  assert.equal(data.courses[0].website, "https://turtle.example/");
  assert.equal(data.courses[0].directionsUrl, null);
  assert.equal(data.courses[0].logoAssetKey, "courses/logos/turtle-point.png");
  assert.equal(data.courses[0].profileAssetKey, null);
  assert.equal(data.localGuide[0].phone, "+1 (843) 555-0100");
  assert.equal(data.localGuide[0].website, null);
  assert.equal(data.contacts[0].email, "support@example.com");
  assert.equal(data.contacts[0].website, "https://example.com/help");
});

test("invalid optional action values are omitted while malformed structured content fails closed", () => {
  const invalidActions = publishedRead();
  const contact = invalidActions.payload.data.content.content.importantContacts[0];
  contact.Phone = "not a phone";
  contact.Email = "not-an-email";
  contact.Website = "https://user:secret@example.com/";
  const data = mobileGuideDataFromProjection(invalidActions, identity);
  assert.equal(data.contacts[0].phone, null);
  assert.equal(data.contacts[0].email, null);
  assert.equal(data.contacts[0].website, null);

  const actionInjection = publishedRead();
  const injected = actionInjection.payload.data.content.content.importantContacts[0];
  injected.Phone = "+1 (843) 555-0101\n+1 (843) 555-0102";
  injected.Website = "https://example.com/participant help";
  const injectionData = mobileGuideDataFromProjection(actionInjection, identity);
  assert.equal(injectionData.contacts[0].phone, null);
  assert.equal(injectionData.contacts[0].website, null);

  const validExtension = publishedRead();
  validExtension.payload.data.content.content.importantContacts[0].Phone = "+1 (843) 555-0101 ext. 12345678";
  assert.equal(mobileGuideDataFromProjection(validExtension, identity).contacts[0].phone,
    "+1 (843) 555-0101 ext. 12345678");

  const html = publishedRead();
  html.payload.data.content.content.overview[0].Description = "<script>bad()</script>Visible";
  assert.throws(() => mobileGuideDataFromProjection(html, identity),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("explicit no-publication is a successful empty state and all other authority failures remain unavailable", async () => {
  const unpublished = await mobileGuideResult(identity, {
    now,
    dependencies: {
      readGuideProjection: async () => ({ payload: { ok: false, code: "GUIDE_PROJECTION_NOT_PUBLISHED" } }),
    },
  });
  assert.equal(unpublished.status, 200);
  assert.equal(unpublished.body.data.publicationState, "UNPUBLISHED");
  assert.equal(unpublished.body.data.publishedAt, null);
  assert.equal(unpublished.body.data.tournament, null);
  for (const field of ["overview", "courses", "dining", "localGuide", "contacts"]) {
    assert.deepEqual(unpublished.body.data[field], []);
  }
  assert.deepEqual(unpublished.body.data.rules, { roundFormats: [], items: [] });

  await assert.rejects(() => mobileGuideResult(identity, {
    dependencies: {
      readGuideProjection: async () => ({ payload: { ok: false, code: "GUIDE_CURRENT_REVISION_INVALID" } }),
    },
  }), (error) => error.code === "MOBILE_API_UNAVAILABLE" && !error.message.includes("REVISION"));
  await assert.rejects(() => mobileGuideResult(identity, {
    dependencies: { readGuideProjection: async () => { throw new Error("database detail"); } },
  }), (error) => error.code === "MOBILE_API_UNAVAILABLE" && !error.message.includes("database"));
});

test("publication withdrawal gets a new representation ETag and hides the prior published body", async () => {
  const published = await mobileGuideResult(identity, {
    now,
    dependencies: { readGuideProjection: async () => publishedRead() },
  });
  const withdrawn = await mobileGuideResult(identity, {
    now,
    dependencies: {
      readGuideProjection: async () => ({ payload: { ok: false, code: "GUIDE_PROJECTION_NOT_PUBLISHED" } }),
    },
  });
  assert.notEqual(published.revision, withdrawn.revision);
  assert.equal(JSON.stringify(withdrawn.body).includes("Official competition rules"), false);
  assert.equal(JSON.stringify(withdrawn.body).includes("Turtle Point"), false);
  assert.equal(withdrawn.body.data.publicationState, "UNPUBLISHED");
});

test("Guide representation ETag is deterministic, excludes response time, and changes with visible content", async () => {
  const first = await mobileGuideResult(identity, {
    now,
    dependencies: { readGuideProjection: async () => publishedRead() },
  });
  const later = await mobileGuideResult(identity, {
    now: new Date("2026-09-20T19:00:00.000Z"),
    dependencies: { readGuideProjection: async () => publishedRead() },
  });
  assert.equal(first.revision, later.revision);
  assert.notEqual(first.body.meta.generatedAt, later.body.meta.generatedAt);
  assert.equal(first.revision, mobileGuideRepresentationRevision(first.body.data));

  const changedRead = publishedRead();
  changedRead.payload.data.content.content.overview[1].Description = "Updated participant-visible copy.";
  const changed = await mobileGuideResult(identity, {
    now,
    dependencies: { readGuideProjection: async () => changedRead },
  });
  assert.notEqual(first.revision, changed.revision);

  const invisibleSourceChange = publishedRead();
  invisibleSourceChange.payload.data.delivery_fingerprint = "b".repeat(64);
  invisibleSourceChange.payload.data.content.content.schedule[0].Title = "A changed /schedule-owned event";
  const sameRepresentation = await mobileGuideResult(identity, {
    now,
    dependencies: { readGuideProjection: async () => invisibleSourceChange },
  });
  assert.equal(first.revision, sameRepresentation.revision);
});

test("malformed or incomplete published authority envelopes fail closed", () => {
  for (const mutate of [
    (read) => { delete read.payload.data.tournament; },
    (read) => { delete read.payload.data.content.schemaVersion; },
    (read) => { read.payload.data.projection_revision = 0; },
    (read) => { read.payload.data.publication_sequence = 0; },
    (read) => { read.payload.data.delivery_fingerprint = "not-a-fingerprint"; },
    (read) => { read.payload.data.content.content.tournamentIdentity.year = 2025; },
  ]) {
    const malformed = publishedRead();
    mutate(malformed);
    assert.throws(() => mobileGuideDataFromProjection(malformed, identity),
      (error) => error.code === "MOBILE_API_UNAVAILABLE");
  }
});

test("Guide remains exact-tournament and participant-bound at the adapter boundary", () => {
  const wrongAuthority = publishedRead({
    tournament: { tournament_id: "OTHER", tournament_year: 2026, name: "Other" },
  });
  assert.throws(() => mobileGuideDataFromProjection(wrongAuthority, identity),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  const wrongProjection = publishedRead();
  wrongProjection.payload.data.content.content.tournamentIdentity.id = "OTHER";
  assert.throws(() => mobileGuideDataFromProjection(wrongProjection, identity),
    (error) => error.code === "MOBILE_API_UNAVAILABLE");

  assert.throws(() => mobileGuideDataFromProjection(publishedRead(), {
    ...identity,
    playerId: "",
  }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
  assert.throws(() => mobileGuideDataFromProjection(publishedRead(), {
    ...identity,
    context: { ...identity.context, membership: { active: false } },
  }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
  assert.throws(() => mobileGuideDataFromProjection(publishedRead(), {
    ...identity,
    context: { ...identity.context, membership: {} },
  }), (error) => error.code === "MOBILE_API_UNAVAILABLE");
});

test("schema pins structured sections, publication withdrawal, canonical holes, and no Schedule field", async () => {
  const schema = JSON.parse(await readFile(new URL("../contracts/mobile/v1/guide.schema.json", import.meta.url), "utf8"));
  assert.equal(schema.$id, "urn:bagger:mobile:v1:guide");
  assert.deepEqual(schema.required, ["ok", "apiVersion", "data", "meta"]);
  assert.equal(schema.properties.data.properties.contractVersion.const, MOBILE_GUIDE_CONTRACT_VERSION);
  assert.deepEqual(schema.$defs.publicationState.enum, MOBILE_GUIDE_PUBLICATION_STATES);
  assert.equal(Object.hasOwn(schema.properties.data.properties, "schedule"), false);
  assert.deepEqual(schema.$defs.courseAssignment.properties.holes.minItems, 18);
  assert.deepEqual(schema.$defs.courseAssignment.properties.holes.maxItems, 18);
  assert.equal(schema.$defs.course.additionalProperties, false);
  assert.equal(schema.$defs.contact.additionalProperties, false);
  assert.match(schema.$defs.nullableHttpsUrl.pattern, /^\^https/);
  const withdrawal = JSON.stringify(schema.properties.data.allOf[0]);
  for (const term of ["UNPUBLISHED", "publishedAt", "tournament", "overview", "courses", "dining", "localGuide", "contacts"]) {
    assert.match(withdrawal, new RegExp(term));
  }
});

test("mobile Guide route reuses the authenticated read helper without client-selected authority", async () => {
  const [route, implementation] = await Promise.all([
    readFile(new URL("../app/api/mobile/v1/guide/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/mobile-v1-guide.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /mobileV1ReadResponse/);
  assert.match(route, /mobileGuideResult/);
  assert.doesNotMatch(route, /request\.json|searchParams|playerId|tournamentId|cookies|Director/i);
  assert.match(implementation, /readGuideProjection/);
  assert.match(implementation, /guideParticipantProjection/);
  for (const forbidden of ["getTournamentData", "readWorkbookSheetsByName", "SUPABASE_SCORING_MIRROR_SECRET_KEY", "console.", "service_role"]) {
    assert.equal(implementation.includes(forbidden), false);
  }
});
