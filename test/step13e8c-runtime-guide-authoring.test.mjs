import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeProductionGuideAuthoring,
  PRODUCTION_GUIDE_AUTHORING_CONTRACT,
  PRODUCTION_GUIDE_AUTHORING_DOMAINS,
  PRODUCTION_GUIDE_ITEM_STATUSES,
} from "../lib/production-guide-authoring-contract.js";

function canonicalCourseContext() {
  return [{
    course_id: "COURSE01",
    tee: "Gold",
    slope: 136,
    rating: 71.9,
    par: 72,
    configuration_consistent: true,
    rounds: [{ round_number: 1, format: "BB", name: "Best Ball", status: "SCHEDULED" }],
    holes: Array.from({ length: 18 }, (_, index) => ({
      hole_number: index + 1,
      yardage: 350 + index,
      par: index % 4 === 0 ? 5 : 4,
      stroke_index: index + 1,
    })),
  }];
}

function content(year = 2026) {
  const scope = String(year);
  return {
    tournament: {
      "Tournament ID": scope,
      Year: scope,
      "Tournament Name": "Sandbagger Invitational",
      "Tournament Edition": `${year} Tournament Guide`,
      "Tournament Dates": "September 24–27",
      "Start Date": `${year}-09-24`,
      "End Date": `${year}-09-27`,
      Destination: "Kiawah Island",
      "Time Zone": "America/New_York",
      "Annual Image": "images/tournaments/logos/sandbagger.png",
      "Hero Image": "images/tournaments/hero/kiawah.webp",
      "Mobile Hero Image": "images/tournaments/hero/kiawah-mobile.webp",
    },
    overview: [{
      "Section ID": "overview",
      "Tournament ID": scope,
      "Section Name": "Overview",
      "Section Slug": "overview",
      Description: "Welcome to the tournament.",
      "Display Order": "1",
      Status: "Published",
    }],
    schedule: [{
      "Event ID": "round-1",
      "Tournament ID": scope,
      "Event Date": `${year}-09-25`,
      "Day Label": "Friday",
      "Start Time": "7:20 AM",
      "End Time": "12:00 PM",
      "Event Type": "Golf",
      Title: "Round 1",
      Subtitle: "Best Ball",
      Location: "Turtle Point",
      Details: "Morning golf",
      "Round ID": "1",
      "Course ID": "COURSE01",
      "Display Order": "1",
      Status: "Published",
      Featured: "TRUE",
    }],
    timelineRows: [{
      Year: scope,
      "Tournament Day": "Friday",
      "Event Date": `${year}-09-25`,
      "Start Time": "7:20 AM",
      "End Time": "12:00 PM",
      "Event Type": "Golf",
      Title: "Round 1",
      Subtitle: "Best Ball",
      Location: "Turtle Point",
      "Display on Home": "TRUE",
      "Notification Minutes": "30",
      "Sort Order": "1",
      "Status Override": "",
    }],
    ruleBook: [{
      "Rule ID": "rule-1",
      "Tournament ID": scope,
      Category: "Scoring",
      Subcategory: "",
      Title: "Nassau",
      Body: "Front, back, and overall points are available.",
      "Display Order": "1",
      Status: "Published",
      "Effective Year": scope,
      Important: "TRUE",
    }],
    tournamentRules: [{
      Year: scope,
      Round: "1",
      Format: "BB",
      "Team Size": "2",
      "Points Available": "3",
      "Front 9 Used": "TRUE",
      "Back 9 Used": "TRUE",
      "Overall Used": "TRUE",
      "Front 9 Points": "1",
      "Back 9 Points": "1",
      "Overall Points": "1",
      Description: "Best Ball presentation",
    }],
    rounds: [{
      "Format ID": "BB",
      Name: "Best Ball",
      "Team Size": "2",
      Description: "Two-player best ball.",
    }],
    dining: [{
      Year: scope,
      Day: "Friday",
      Meal: "Dinner",
      Cuisine: "Lowcountry",
      "Start Time": "7:00 PM",
      "End Time": "9:00 PM",
      Location: "Clubhouse",
      "Dress Code": "Resort casual",
      "Reservations Required": "TRUE",
      Notes: "Meet in the lobby.",
      "Sort Order": "1",
    }],
    localGuide: [{
      Year: scope,
      Section: "Transportation",
      Title: "Tournament Shuttle",
      Description: "Shuttle service to the course.",
      Address: "1 Main Street",
      Phone: "555-0100",
      Website: "kiawah.example/shuttle",
      "Sort Order": "1",
    }],
    importantContacts: [{
      Year: scope,
      Category: "Tournament",
      Name: "Katie",
      Role: "Participant liaison",
      Phone: "+1 (555) 010-1000",
      "Text Enabled": "TRUE",
      Email: "katie@example.com",
      Website: "https://example.com/guide",
      "Sort Order": "1",
    }],
    courses: [{
      "Course ID": "COURSE01",
      Year: scope,
      Round: "1",
      Format: "BB",
      Course: "Turtle Point",
      City: "Kiawah Island",
      State: "SC",
      Destination: "Kiawah Island",
      "Year Opened": "1981",
      Designer: "Jack Nicklaus",
      Website: "https://turtle.example",
      "Course Logo": "images/courses/logos/turtle.png",
      "Course Profile Image": "images/courses/profile/turtle.webp",
      "GPS Link": "https://maps.example/turtle",
      Overview: "Oceanfront championship course.",
      "Playing Tips": "Use the wind.",
      "Signature Holes": "14",
      History: "Opened in 1981.",
    }],
  };
}

function normalize(value = content()) {
  return normalizeProductionGuideAuthoring({
    content: value,
    targetTournamentId: "2026",
    targetTournamentYear: 2026,
    canonicalCourseContext: canonicalCourseContext(),
  });
}

test("Guide authoring preserves the certified projection DTO while retaining hidden stable draft IDs", () => {
  const result = normalize();
  assert.equal(result.contractVersion, PRODUCTION_GUIDE_AUTHORING_CONTRACT);
  assert.deepEqual(PRODUCTION_GUIDE_ITEM_STATUSES, ["Draft", "Published", "Archived", "Cancelled"]);
  assert.equal(PRODUCTION_GUIDE_AUTHORING_DOMAINS.length, 11);
  assert.match(result.authoringContent.overview[0].itemId, /^overview:/);
  assert.match(result.authoringContent.timelineRows[0].itemId, /^timelineRows:/);
  for (const collection of [
    "overview", "schedule", "timelineRows", "ruleBook", "tournamentRules", "rounds",
    "dining", "localGuide", "importantContacts", "courses",
  ]) {
    for (const row of result.projectionPayload.content[collection]) {
      assert.equal(Object.hasOwn(row, "itemId"), false, `${collection} must not change the Guide DTO`);
    }
  }
  for (const field of ["Tee Played", "Slope", "Rating", "Yardage", "Par"]) {
    assert.equal(Object.hasOwn(result.projectionPayload.content.courses[0], field), false);
  }
  assert.equal(result.projectionPayload.schemaVersion, "guide-projection-v1");
  assert.match(result.authoringContentFingerprint, /^[0-9a-f]{64}$/);
  assert.match(result.contentFingerprint, /^[0-9a-f]{64}$/);
  assert.match(result.projectionPayloadHash, /^[0-9a-f]{64}$/);
  assert.equal(normalize().projectionPayloadHash, result.projectionPayloadHash);
});

test("Guide authoring rejects unsafe/private/operational fields and invalid participant links", () => {
  const unsafe = content();
  unsafe.ruleBook[0].Body = "<script>alert(1)</script>";
  assert.throws(() => normalize(unsafe), (error) => error.code === "GUIDE_UNSAFE_CONTENT");

  const badUrl = content();
  badUrl.localGuide[0].Website = "javascript:alert(1)";
  assert.throws(() => normalize(badUrl), (error) => error.code === "GUIDE_URL_INVALID");

  const badEmail = content();
  badEmail.importantContacts[0].Email = "not-an-email";
  assert.throws(() => normalize(badEmail), (error) => error.code === "GUIDE_EMAIL_INVALID");

  const privateIdentity = content();
  privateIdentity.importantContacts[0].authUserId = "private-auth-identity";
  assert.throws(() => normalize(privateIdentity), (error) => error.code === "GUIDE_FIELD_NOT_ALLOWED");

  const scoring = content();
  scoring.courses[0].Slope = "999";
  assert.throws(() => normalize(scoring), (error) => error.code === "GUIDE_FIELD_NOT_ALLOWED");

  for (const asset of ["images/../private.png", "/etc/passwd", "images\\private.png", "data:image/png;base64,bad"]) {
    const traversal = content();
    traversal.tournament["Hero Image"] = asset;
    assert.throws(() => normalize(traversal), (error) => error.code === "GUIDE_ASSET_INVALID");
  }
});

test("Guide authoring enforces bounded scalar, collection, and aggregate payload sizes", () => {
  const scalar = content();
  scalar.ruleBook[0].Body = "x".repeat(20_001);
  assert.throws(() => normalize(scalar), (error) => error.code === "GUIDE_CONTENT_TOO_LARGE");

  const collection = content();
  collection.overview = Array.from({ length: 101 }, (_, index) => ({
    ...collection.overview[0],
    "Section ID": `section-${index}`,
    "Section Slug": `section-${index}`,
  }));
  assert.throws(() => normalize(collection), (error) => error.code === "GUIDE_COLLECTION_TOO_LARGE");

  const aggregate = content();
  aggregate.headers = { ignoredDerivedReadField: "x".repeat(1_500_001) };
  assert.throws(() => normalize(aggregate), (error) => error.code === "GUIDE_CONTENT_TOO_LARGE");
});

test("Guide authoring validates all draft identities, slugs, and canonical Round/Course references", () => {
  const slug = content();
  slug.overview.push({
    ...slug.overview[0],
    "Section ID": "rules",
    "Section Slug": "overview",
    "Display Order": "2",
    Status: "Draft",
  });
  assert.throws(() => normalize(slug), (error) => error.code === "GUIDE_SECTION_SLUG_DUPLICATE");

  const duplicateDraft = content();
  duplicateDraft.schedule.push({ ...duplicateDraft.schedule[0], Status: "Draft" });
  assert.throws(() => normalize(duplicateDraft), (error) => error.code === "GUIDE_LOGICAL_ID_DUPLICATE");

  const round = content();
  round.schedule[0]["Round ID"] = "99";
  assert.throws(() => normalize(round), (error) => error.code === "GUIDE_ROUND_REFERENCE_INVALID");

  const course = content();
  course.schedule[0]["Course ID"] = "UNKNOWN";
  assert.throws(() => normalize(course), (error) => error.code === "GUIDE_COURSE_REFERENCE_INVALID");

  const scoringConflict = content();
  scoringConflict.tournamentRules[0].Format = "SC";
  assert.throws(() => normalize(scoringConflict), (error) => error.code === "GUIDE_RULE_SCORING_CONFLICT");
});

test("Guide authoring enforces exact annual scope without touching canonical scoring context", () => {
  const wrongYear = content();
  wrongYear.dining[0].Year = "2027";
  assert.throws(() => normalize(wrongYear), (error) => error.code === "GUIDE_TOURNAMENT_SCOPE_MISMATCH");
  assert.equal(canonicalCourseContext()[0].slope, 136);
});

test("Guide server operations bind the fixed RPC allowlist, optimistic versions, hashes, and Preview isolation", () => {
  const script = `
    import {
      copyPreviousProductionGuideAsDraft,
      discardProductionGuideDraft,
      previewProductionGuideDraft,
      publishProductionGuideDraft,
      stageProductionGuideDraft,
      validateProductionGuideDraft,
    } from "./lib/production-guide-authoring-server.js";
    import {
      normalizeProductionGuideAuthoring,
      productionGuideCanonicalReferenceFingerprint,
    } from "./lib/production-guide-authoring-contract.js";
    const content = ${JSON.stringify(content())};
    const courses = ${JSON.stringify(canonicalCourseContext())};
    const normalized = normalizeProductionGuideAuthoring({
      content, targetTournamentId: "2026", targetTournamentYear: 2026,
      canonicalCourseContext: courses,
    });
    const canonicalReferenceFingerprint = productionGuideCanonicalReferenceFingerprint({
      canonicalRounds: [], canonicalCourseContext: courses,
    });
    const calls = [];
    const options = {
      env: {},
      canonicalContext: { courses },
      getActivation: () => ({ phase: "OBSERVATION", resources: {} }),
      rpc: async (name, input) => {
        calls.push({ name, input });
        if (name === "read_production_guide_authoring_v1") return { payload: { ok: true, data: {
          target_tournament_id: "2026", tournament_year: 2026,
          canonical_course_context: courses, canonical_rounds: [],
          open_draft: {
            draft_id: "30000000-0000-4000-8000-000000000003",
            draft_version: 2, state: "VALIDATED",
            authoring_content: normalized.authoringContent,
            authoring_content_fingerprint: normalized.authoringContentFingerprint,
            content_fingerprint: normalized.contentFingerprint,
            projection_payload_hash: normalized.projectionPayloadHash,
            canonical_reference_fingerprint: canonicalReferenceFingerprint,
            validated_content_fingerprint: normalized.contentFingerprint,
            validated_canonical_reference_fingerprint: canonicalReferenceFingerprint,
          },
        } } };
        return { payload: { ok: true, name } };
      },
    };
    const actor = {
      actorAuthUserId: "10000000-0000-4000-8000-000000000001",
      actorPlayerId: "CB01", actorTournamentId: "2026",
    };
    const created = await stageProductionGuideDraft({ ...actor,
      targetTournamentId: "2026", expectedRevision: 2, expectedDraftVersion: 0,
      operationRequestId: "20000000-0000-4000-8000-000000000002", content,
    }, options);
    await stageProductionGuideDraft({ ...actor,
      targetTournamentId: "2026", expectedRevision: 2, expectedDraftVersion: 1,
      draftId: "30000000-0000-4000-8000-000000000003",
      operationRequestId: "40000000-0000-4000-8000-000000000004", content,
    }, options);
    await validateProductionGuideDraft({ ...actor,
      targetTournamentId: "2026", expectedDraftVersion: 2,
      draftId: "30000000-0000-4000-8000-000000000003",
      operationRequestId: "50000000-0000-4000-8000-000000000005",
    }, options);
    const preview = await previewProductionGuideDraft({ ...actor,
      targetTournamentId: "2026", expectedDraftVersion: 2,
      draftId: "30000000-0000-4000-8000-000000000003",
    }, options);
    await publishProductionGuideDraft({ ...actor,
      targetTournamentId: "2026", expectedRevision: 2, expectedDraftVersion: 2,
      draftId: "30000000-0000-4000-8000-000000000003",
      contentFingerprint: "${normalize().contentFingerprint}",
      confirmation: "PUBLISH TOURNAMENT GUIDE",
      operationRequestId: "60000000-0000-4000-8000-000000000006",
    }, options);
    await discardProductionGuideDraft({ ...actor,
      targetTournamentId: "2026", expectedDraftVersion: 2,
      draftId: "30000000-0000-4000-8000-000000000003",
      operationRequestId: "70000000-0000-4000-8000-000000000007",
    }, options);
    await copyPreviousProductionGuideAsDraft({ ...actor,
      targetTournamentId: "2027", sourceTournamentId: "2026", expectedRevision: 0,
      operationRequestId: "80000000-0000-4000-8000-000000000008",
    }, options);
    process.stdout.write(JSON.stringify({ calls, created, preview }));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.deepEqual(result.calls.map((value) => value.name), [
    "create_production_guide_draft_v1",
    "update_production_guide_draft_v1",
    "read_production_guide_authoring_v1",
    "validate_production_guide_draft_v1",
    "read_production_guide_authoring_v1",
    "preview_production_guide_draft_v1",
    "read_production_guide_authoring_v1",
    "publish_production_guide_draft_v1",
    "discard_production_guide_draft_v1",
    "copy_previous_production_guide_as_draft_v1",
  ]);
  for (const { input } of result.calls) {
    assert.equal(input.environment, "PRODUCTION");
    assert.equal(input.tournament_id, "2026");
    assert.equal(input.authorization.player_id, "CB01");
    if (input.operation !== "READ_PRODUCTION_GUIDE_AUTHORING_V1") {
      assert.match(input.request_payload_hash, /^[0-9a-f]{64}$/);
    }
  }
  assert.equal(result.calls[0].input.provenance, "SUPABASE_DIRECTOR");
  assert.equal(result.calls[0].input.projection_payload.schemaVersion, "guide-projection-v1");
  assert.equal(result.calls[0].input.projection_payload.content.overview[0].itemId, undefined);
  assert.match(result.calls[0].input.authoring_content.overview[0].itemId, /^overview:/);
  assert.equal(result.calls[1].input.expected_draft_version, 1);
  assert.equal(result.calls[7].input.expected_content_fingerprint, normalize().contentFingerprint);
  assert.equal(result.calls[7].input.content_fingerprint, normalize().contentFingerprint);
  assert.equal(result.calls[7].input.canonical_reference_fingerprint,
    result.calls[0].input.canonical_reference_fingerprint);
  assert.equal(result.preview.previewLabel, "DRAFT PREVIEW");
  assert.equal(result.preview.public, false);
  assert.equal(result.preview.participantVisible, false);
  assert.equal(result.preview.currentPointerChanged, false);
  assert.equal(result.preview.projectionPayload.schemaVersion, "guide-projection-v1");
});

test("Guide read exposes bounded references but not canonical scoring holes", () => {
  const script = `
    import { readProductionGuideAuthoring } from "./lib/production-guide-authoring-server.js";
    const result = await readProductionGuideAuthoring({
      actorAuthUserId: "10000000-0000-4000-8000-000000000001",
      actorPlayerId: "CB01", actorTournamentId: "2026", targetTournamentId: "2026",
    }, {
      env: {}, getActivation: () => ({ phase: "OBSERVATION", resources: {} }),
      rpc: async () => ({ payload: { ok: true, data: {
        target_tournament_id: "2026", tournament_year: 2026,
        current: { revision_id: "20000000-0000-4000-8000-000000000002", revision_number: 2 },
        open_draft: { draft_id: "30000000-0000-4000-8000-000000000003", draft_version: 1,
          authoring_content: { overview: [] } },
        canonical_course_context: ${JSON.stringify(canonicalCourseContext())},
      } } }),
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.current.revisionNumber, 2);
  assert.equal(result.openDraft.draftVersion, 1);
  assert.equal(result.references.courses[0].courseId, "COURSE01");
  assert.equal(JSON.stringify(result).includes("hole_number"), false);
  assert.equal(result.specifications.previewLabel, "DRAFT PREVIEW");
});

test("validate, Preview, and publish fail closed on stored-content or canonical setup drift", () => {
  const script = `
    import {
      previewProductionGuideDraft,
      publishProductionGuideDraft,
      validateProductionGuideDraft,
    } from "./lib/production-guide-authoring-server.js";
    import {
      normalizeProductionGuideAuthoring,
      productionGuideCanonicalReferenceFingerprint,
    } from "./lib/production-guide-authoring-contract.js";
    const content = ${JSON.stringify(content())};
    const courses = ${JSON.stringify(canonicalCourseContext())};
    const normalized = normalizeProductionGuideAuthoring({
      content, targetTournamentId: "2026", targetTournamentYear: 2026,
      canonicalCourseContext: courses,
    });
    const reference = productionGuideCanonicalReferenceFingerprint({
      canonicalRounds: [], canonicalCourseContext: courses,
    });
    const actor = {
      actorAuthUserId: "10000000-0000-4000-8000-000000000001",
      actorPlayerId: "CB01", actorTournamentId: "2026",
      targetTournamentId: "2026", expectedDraftVersion: 2,
      draftId: "30000000-0000-4000-8000-000000000003",
    };
    const activation = () => ({ phase: "OBSERVATION", resources: {} });
    const snapshot = (overrides = {}) => ({ payload: { ok: true, data: {
      targetTournamentId: "2026", canonicalCourseContext: courses, canonicalRounds: [],
      openDraft: {
        draftId: actor.draftId, draftVersion: 2, state: "VALIDATED",
        authoringContent: normalized.authoringContent,
        authoringContentFingerprint: normalized.authoringContentFingerprint,
        contentFingerprint: normalized.contentFingerprint,
        validatedContentFingerprint: normalized.contentFingerprint,
        canonicalReferenceFingerprint: reference,
        validatedCanonicalReferenceFingerprint: reference,
        ...overrides,
      },
    } } });
    const failures = {};
    try {
      await validateProductionGuideDraft({ ...actor,
        operationRequestId: "40000000-0000-4000-8000-000000000004",
      }, { env: {}, getActivation: activation,
        rpc: async () => snapshot({ authoringContentFingerprint: "0".repeat(64) }) });
    } catch (error) { failures.validate = error.code; }
    try {
      await previewProductionGuideDraft(actor, { env: {}, getActivation: activation,
        rpc: async () => snapshot({ state: "DRAFT" }) });
    } catch (error) { failures.preview = error.code; }
    try {
      await publishProductionGuideDraft({ ...actor,
        expectedRevision: 2, contentFingerprint: normalized.contentFingerprint,
        confirmation: "PUBLISH TOURNAMENT GUIDE",
        operationRequestId: "50000000-0000-4000-8000-000000000005",
      }, { env: {}, getActivation: activation,
        rpc: async () => snapshot({ validatedCanonicalReferenceFingerprint: "f".repeat(64) }) });
    } catch (error) { failures.publish = error.code; }
    process.stdout.write(JSON.stringify(failures));
  `;
  const child = spawnSync(process.execPath,
    ["--conditions=react-server", "--input-type=module", "-e", script], {
      cwd: new URL("..", import.meta.url), encoding: "utf8",
    });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    validate: "GUIDE_DRAFT_FINGERPRINT_MISMATCH",
    preview: "GUIDE_DRAFT_NOT_VALIDATED",
    publish: "GUIDE_VALIDATION_STALE",
  });
});

test("Guide API is Production Director-only, exact-origin, no-store, and exposes only the bounded lifecycle", async () => {
  const [route, server] = await Promise.all([
    readFile(new URL("../app/api/director/guide/route.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/production-guide-authoring-server.js", import.meta.url), "utf8"),
  ]);
  assert.match(route, /new Set\(\["stage", "validate", "preview", "publish", "discard", "copy-previous"\]\)/);
  assert.match(route, /assertProductionCutoverRequest\(request, process\.env, \{ requireOrigin: true \}\)/);
  assert.match(route, /result\.source !== "production-director-entitlement"/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /googleRequests: 0/);
  assert.doesNotMatch(route, /google-sheets|GoogleSpreadsheet|table\.(?:insert|update|delete)/i);
  for (const rpc of [
    "read_production_guide_authoring_v1",
    "create_production_guide_draft_v1",
    "update_production_guide_draft_v1",
    "validate_production_guide_draft_v1",
    "preview_production_guide_draft_v1",
    "publish_production_guide_draft_v1",
    "discard_production_guide_draft_v1",
    "copy_previous_production_guide_as_draft_v1",
  ]) assert.match(server, new RegExp(`"${rpc}"`));
  assert.match(server, /import "server-only"/);
  assert.match(server, /PRODUCTION_SUPABASE_SECRET_KEY/);
  assert.match(server, /SUPABASE_DIRECTOR/);
});
