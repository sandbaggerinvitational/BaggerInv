import test from "node:test";
import assert from "node:assert/strict";

import {
  GUIDE_PARTICIPANT_CONTENT_POLICIES,
  GUIDE_PROJECTION_SCHEMA_VERSION,
  GuideProjectionValidationError,
  buildGuideProjection,
  canonicalGuideJson,
  guideContentWithCanonicalCourses,
  guideProjectionHash,
  timelineFromGuideProjection,
} from "../lib/tournament-guide-projection.js";

function canonicalCourses() {
  return [
    {
      courseId: "TPGC01", round: 1, format: "BB", tee: "Gold", slope: 136, rating: 71.9, yardage: 6620, par: 72,
      holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, yardage: 340 + index, par: index % 3 === 0 ? 5 : 4, strokeIndex: 18 - index })),
    },
    {
      courseId: "CPGC01", round: 2, format: "SC", tee: "Purple", slope: 139, rating: 72.8, yardage: 6750, par: 72,
      holes: Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, yardage: 350 + index, par: 4, strokeIndex: index + 1 })),
    },
  ];
}

function officialSheets() {
  return {
    Tournaments: [{
      "Tournament ID": "2026", Year: "2026", "Tournament Name": "Sandbagger Invitational",
      "Tournament Dates": "September 24–27", Destination: "Kiawah Island", "Time Zone": "America/New_York",
      "Tournament Logo Filename": "sandbagger-2026",
    }],
    "Guide Sections": [
      { "Section ID": "rules", "Tournament ID": "2026", "Section Slug": "rules", Description: "<b>Official</b> rules", "Display Order": "2", Status: "Published" },
      { "Section ID": "overview", "Tournament ID": "2026", "Section Slug": "overview", Description: "Welcome", "Display Order": "1", Status: "Published" },
      { "Section ID": "draft", "Tournament ID": "2026", "Section Slug": "hidden", Description: "Hidden", "Display Order": "3", Status: "Draft" },
    ],
    "Tournament Itinerary": [
      { "Event ID": "round-2", "Tournament ID": "2026", "Event Date": "Date(2026,8,25)", "Day Label": "Friday", "Start Time": "2:00 PM", "End Time": "6:00 PM", "Event Type": "Golf", Title: "Round 2", Subtitle: "Scramble", Location: "Cougar Point", Details: "Afternoon golf", "Round ID": "2", "Course ID": "CPGC01", "Display Order": "2", Status: "Published", Featured: "TRUE" },
      { "Event ID": "round-1", "Tournament ID": "2026", "Event Date": "2026-09-25", "Day Label": "Friday", "Start Time": "7:20 AM", "End Time": "12:00 PM", "Event Type": "Golf", Title: "Round 1", Subtitle: "Best Ball", Location: "Turtle Point", Details: "Morning golf", "Round ID": "1", "Course ID": "TPGC01", "Display Order": "1", Status: "Published", Featured: "TRUE" },
    ],
    "Tournament Timeline": [
      { Year: "2026", "Tournament Day": "Friday", "Event Date": "2026-09-25", "Start Time": "7:20 AM", "End Time": "12:00 PM", "Event Type": "Golf", Title: "Round 1", Subtitle: "Best Ball", Location: "Turtle Point", "Display on Home": "TRUE", "Notification Minutes": "30", "Sort Order": "1", "Status Override": "" },
      { Year: "2025", "Tournament Day": "Friday", "Event Date": "2025-09-25", "Start Time": "7:20 AM", "End Time": "12:00 PM", "Event Type": "Golf", Title: "Old Round", Subtitle: "", Location: "Old", "Display on Home": "TRUE", "Notification Minutes": "30", "Sort Order": "1", "Status Override": "" },
    ],
    "Rule Book": [{ "Rule ID": "r-1", "Tournament ID": "2026", Category: "Scoring", Subcategory: "", Title: "Nassau", Body: "Three points are available.", "Display Order": "1", Status: "Published", "Effective Year": "2026", Important: "TRUE" }],
    "Tournament Rules": [
      { Year: "2026", Round: "1", Format: "BB", "Team Size": "2", "Points Available": "3", "Front 9 Used": "TRUE", "Back 9 Used": "TRUE", "Overall Used": "TRUE", "Front 9 Points": "1", "Back 9 Points": "1", "Overall Points": "1" },
      { Year: "2026", Round: "2", Format: "SC", "Team Size": "2", "Points Available": "3", "Front 9 Used": "TRUE", "Back 9 Used": "TRUE", "Overall Used": "TRUE", "Front 9 Points": "1", "Back 9 Points": "1", "Overall Points": "1" },
    ],
    Rounds: [
      { "Format ID": "SC", Name: "Scramble", "Team Size": "2" },
      { "Format ID": "BB", Name: "Best Ball", "Team Size": "2" },
    ],
    Dining: [{ Year: "2026", Day: "Friday", Meal: "Dinner", Cuisine: "Steakhouse", "Start Time": "7:00 PM", "End Time": "9:00 PM", Location: "Clubhouse", "Dress Code": "Resort casual", "Reservations Required": "TRUE", Notes: "Meet in lobby", "Sort Order": "1" }],
    "Local Guide": [
      { Year: "2026", Section: "Transportation", Title: "Shuttle", Description: "Tournament shuttle", Address: "1 Main St", Phone: "555-0100", Website: "kiawah.example/shuttle", "Sort Order": "1" },
      { Year: "2026", Section: "Dining", Title: "Unsafe", Description: "<script>steal()</script><b>Safe words</b>", Address: "", Phone: "", Website: "javascript:alert(1)", "Sort Order": "2" },
    ],
    "Important Contacts": [
      { Year: "2026", Category: "Tournament", Name: "Katie", Role: "Director", Phone: "555-0101", "Text Enabled": "TRUE", Email: "katie@example.com", Website: "https://example.com", "Sort Order": "1", "Private Notes": "must not leak" },
      { Year: "2026", Category: "Internal", Name: "Private", Role: "Director only", Phone: "555-0199", "Text Enabled": "FALSE", Email: "private@example.com", Website: "", "Sort Order": "2", Sensitive: "TRUE" },
    ],
    Courses: [
      { "Course ID": "CPGC01", Year: "2026", Round: "2", Format: "SC", Course: "Cougar Point", City: "Kiawah Island", State: "SC", Destination: "Kiawah", "Tee Played": "Purple", Slope: "139", Rating: "72.8", Yardage: "6750", Par: "72", "Year Opened": "1976", Designer: "Gary Player", Website: "https://cougar.example", "Course Logo": "cougar-logo", "Course Profile Image": "cougar-profile", "GPS Link": "https://maps.example/cougar", Overview: "Course overview", "Playing Tips": "Stay patient", "Signature Holes": "17", History: "Resort history" },
      { "Course ID": "TPGC01", Year: "2026", Round: "1", Format: "BB", Course: "Turtle Point", City: "Kiawah Island", State: "SC", Destination: "Kiawah", "Tee Played": "Gold", Slope: "136", Rating: "71.9", Yardage: "6620", Par: "72", "Year Opened": "1981", Designer: "Jack Nicklaus", Website: "turtle.example", "Course Logo": "turtle-logo", "Course Profile Image": "turtle-profile", "GPS Link": "javascript:bad", Overview: "Course overview", "Playing Tips": "Use the wind", "Signature Holes": "14", History: "Resort history" },
    ],
  };
}

const build = (overrides = {}) => buildGuideProjection({
  sheets: officialSheets(),
  tournament: { id: "2026", year: 2026, name: "Sandbagger Invitational", timeZone: "America/New_York" },
  canonicalCourseContext: canonicalCourses(),
  ...overrides,
});

test("persisted Guide presentation excludes scoring-critical course data and a fresh canonical read restores it", () => {
  const result = build();
  assert.equal(result.schemaVersion, GUIDE_PROJECTION_SCHEMA_VERSION);
  assert.equal(result.validation.valid, true);
  assert.deepEqual(result.content.overview.map((row) => row["Section ID"]), ["overview", "rules"]);
  assert.deepEqual(result.content.schedule.map((row) => row["Event ID"]), ["round-1", "round-2"]);
  assert.equal(result.content.schedule[1]["Event Date"], "2026-09-25");
  assert.deepEqual(result.content.rounds.map((row) => row["Format ID"]), ["BB", "SC"]);
  assert.deepEqual(result.content.courses.map((row) => row["Course ID"]), ["TPGC01", "CPGC01"]);
  assert.equal(result.content.courses[0].Round, "1");
  assert.equal(result.content.courses[0].Format, "BB");
  for (const field of ["Tee Played", "Slope", "Rating", "Yardage", "Par"]) {
    assert.equal(Object.hasOwn(result.content.courses[0], field), false);
  }
  assert.equal(Object.hasOwn(result.content, "courseHoles"), false);

  const delivered = guideContentWithCanonicalCourses(result.content, canonicalCourses());
  assert.equal(delivered.courses[0]["Tee Played"], "Gold");
  assert.equal(delivered.courses[0].Slope, 136);
  assert.equal(delivered.courses[0].Rating, 71.9);
  assert.equal(delivered.courses[0].Yardage, canonicalCourses()[0].holes.reduce((sum, hole) => sum + hole.yardage, 0));
  assert.equal(delivered.courseHoles.length, 36);
});

test("projection allowlists participant contact fields and strips unsafe optional content", () => {
  const content = build().content;
  assert.equal(content.importantContacts.length, 1);
  assert.equal("Private Notes" in content.importantContacts[0], false);
  assert.equal("Sensitive" in content.importantContacts[0], false);
  assert.equal(content.localGuide[1].Description, "Safe words");
  assert.equal(content.localGuide[1].Website, "");
  assert.equal(content.courses[0]["GPS Link"], "");
  assert.equal(content.courses[0].Website, "turtle.example");
  assert.equal(content.overview[1].Description, "Official rules");
});

test("projection carries annual tournament logo and responsive destination imagery without a Guide-only dataset", () => {
  const sheets = officialSheets();
  Object.assign(sheets.Tournaments[0], {
    "Annual Image": "sandbagger-future",
    "Hero Image": "future-destination",
    "Mobile Hero Image": "future-destination-mobile",
  });
  const projection = build({ sheets }).content;
  assert.equal(projection.tournamentIdentity.logoFileName, "sandbagger-future");
  assert.equal(projection.tournamentIdentity.heroImageFileName, "future-destination");
  assert.equal(projection.tournamentIdentity.mobileHeroImageFileName, "future-destination-mobile");
  assert.equal(projection.tournament["Annual Image"], "sandbagger-future");
  assert.equal(projection.tournament["Hero Image"], "future-destination");
  assert.equal(projection.tournament["Mobile Hero Image"], "future-destination-mobile");
});

test("projection normalizes the official singular Dining reservation header", () => {
  const sheets = officialSheets();
  const value = sheets.Dining[0]["Reservations Required"];
  delete sheets.Dining[0]["Reservations Required"];
  sheets.Dining[0]["Reservation Required"] = value;
  const dining = build({ sheets }).content.dining;
  assert.equal(dining.length, 1);
  assert.equal(dining[0]["Reservations Required"], "TRUE");
  assert.equal(Object.hasOwn(dining[0], "Reservation Required"), false);
});

test("projection preserves current CMS source order when optional ordering, status, or time fields are blank", () => {
  const sheets = officialSheets();
  for (const row of sheets["Tournament Timeline"]) delete row["Status Override"];
  const dining = { ...sheets.Dining[0], Meal: "Arrival Hospitality", "Start Time": "", "End Time": "", "Sort Order": "" };
  sheets.Dining.push(dining);
  for (const row of sheets["Local Guide"]) delete row["Sort Order"];
  const content = build({ sheets }).content;
  assert.equal(content.dining.find((row) => row.Meal === "Arrival Hospitality")["Start Time"], "");
  assert.deepEqual(content.localGuide.map((row) => row["Sort Order"]), ["1", "2"]);
  assert.equal(content.timelineRows[0]["Status Override"], "");
});

test("Production pre-tournament projection accepts only an entirely empty participant Guide with valid structure", () => {
  const source = officialSheets();
  const headers = Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, Object.keys(rows[0] || {})]));
  for (const row of source["Guide Sections"]) row.Status = "Draft";
  for (const row of source["Tournament Itinerary"]) row.Status = "Draft";
  for (const row of source["Rule Book"]) row.Status = "Draft";
  for (const name of ["Tournament Timeline", "Dining", "Local Guide", "Important Contacts"]) source[name] = [];
  const structured = Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, { headers: headers[name], records: rows }]));

  assert.throws(() => build({ sheets: structured }), (error) =>
    error.issues.some((issue) => /Guide Sections has no published participant content/.test(issue))
  );

  const projection = build({
    sheets: structured,
    participantContentPolicy: GUIDE_PARTICIPANT_CONTENT_POLICIES.ALLOW_VALID_EMPTY_PRE_TOURNAMENT,
  });
  assert.equal(projection.validation.valid, true);
  assert.equal(projection.validation.participantContentState, "VALID_EMPTY");
  assert.equal(projection.validation.emptyParticipantContentAccepted, true);
  assert.equal(projection.validation.activeAuthoringCounts["Guide Sections"], 3);
  for (const field of ["overview", "schedule", "timelineRows", "ruleBook", "dining", "localGuide", "importantContacts"]) {
    assert.deepEqual(projection.content[field], []);
  }
  assert.equal(projection.content.courses.length, 2);
  assert.equal(projection.content.tournamentRules.length, 2);
  assert.equal(projection.content.rounds.length, 2);
  assert.doesNotMatch(projection.payloadCanonicalJson, /Hidden|Official rules|Afternoon golf|Three points are available/);
});

test("valid-empty Guide policy still fails closed for corrupt structure or partially published content", () => {
  const makeSource = () => {
    const source = officialSheets();
    const headers = Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, Object.keys(rows[0] || {})]));
    for (const row of source["Guide Sections"]) row.Status = "Draft";
    for (const row of source["Tournament Itinerary"]) row.Status = "Draft";
    for (const row of source["Rule Book"]) row.Status = "Draft";
    for (const name of ["Tournament Timeline", "Dining", "Local Guide", "Important Contacts"]) source[name] = [];
    return Object.fromEntries(Object.entries(source).map(([name, rows]) => [name, { headers: headers[name], records: rows }]));
  };
  const corrupt = makeSource();
  corrupt.Dining.headers = corrupt.Dining.headers.filter((header) => header !== "Location");
  assert.throws(() => build({
    sheets: corrupt,
    participantContentPolicy: GUIDE_PARTICIPANT_CONTENT_POLICIES.ALLOW_VALID_EMPTY_PRE_TOURNAMENT,
  }), (error) => error.issues.some((issue) => /Dining headers are missing Location/.test(issue)));

  const partial = makeSource();
  partial["Guide Sections"].records[0].Status = "Published";
  assert.throws(() => build({
    sheets: partial,
    participantContentPolicy: GUIDE_PARTICIPANT_CONTENT_POLICIES.ALLOW_VALID_EMPTY_PRE_TOURNAMENT,
  }), (error) => error.issues.some((issue) => /Tournament Itinerary has no published participant content/.test(issue)));
});

test("rules projection preserves every participant presentation field without becoming course scoring authority", () => {
  const sheets = officialSheets();
  const presentation = {
    Description: "Best Ball presentation",
    Rules: "Play the better net score.",
    "Handicap Allocation": "100%",
    Handicap: "Full",
    "Handicap Rules": "Allocate by stroke index.",
    "Playing Handicap": "Course handicap",
    "Scoring Format": "Nassau",
    Scoring: "Front, back, overall",
    "Match Format": "Four-ball",
  };
  Object.assign(sheets["Tournament Rules"][0], presentation);
  Object.assign(sheets.Rounds.find((row) => row["Format ID"] === "BB"), presentation);
  const content = build({ sheets }).content;
  assert.deepEqual(content.ruleBook[0], {
    "Rule ID": "r-1",
    "Tournament ID": "2026",
    "Tournament Year": "",
    Year: "",
    Category: "Scoring",
    Subcategory: "",
    Title: "Nassau",
    Body: "Three points are available.",
    "Display Order": "1",
    Status: "Published",
    Published: "",
    "Effective Year": "2026",
    Important: "TRUE",
  });
  const tournamentRule = content.tournamentRules[0];
  assert.deepEqual(Object.fromEntries(Object.keys(presentation).map((field) => [field, tournamentRule[field]])), presentation);
  const round = content.rounds.find((row) => row["Format ID"] === "BB");
  assert.deepEqual(Object.fromEntries(Object.keys(presentation).map((field) => [field, round[field]])), presentation);
  assert.deepEqual({
    Round: tournamentRule.Round,
    Format: tournamentRule.Format,
    teamSize: tournamentRule["Team Size"],
    points: tournamentRule["Points Available"],
    front: tournamentRule["Front 9 Points"],
    back: tournamentRule["Back 9 Points"],
    overall: tournamentRule["Overall Points"],
  }, { Round: "1", Format: "BB", teamSize: "2", points: "3", front: "1", back: "1", overall: "1" });
  assert.equal(Object.hasOwn(content, "courseHoles"), false);
});

test("same logical Guide content produces the same canonical fingerprint despite source row and key order", () => {
  const first = build();
  const sheets = officialSheets();
  sheets["Guide Sections"] = [...sheets["Guide Sections"]].reverse().map((row) => Object.fromEntries(Object.entries(row).reverse()));
  sheets.Courses = [...sheets.Courses].reverse();
  const second = build({ sheets });
  assert.equal(second.sourceFingerprint, first.sourceFingerprint);
  assert.equal(second.contentFingerprint, first.contentFingerprint);
  assert.equal(second.payloadHash, first.payloadHash);
  assert.equal(guideProjectionHash({ b: 2, a: 1 }), guideProjectionHash({ a: 1, b: 2 }));
  assert.equal(canonicalGuideJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("a legitimate participant content change produces a new deterministic fingerprint", () => {
  const original = build();
  const sheets = officialSheets();
  sheets.Dining[0].Notes = "Meet at the first tee";
  const changed = build({ sheets });
  assert.notEqual(changed.sourceFingerprint, original.sourceFingerprint);
  assert.notEqual(changed.contentFingerprint, original.contentFingerprint);
  assert.equal(changed.sourceFingerprint, build({ sheets }).sourceFingerprint);
});

test("projection rejects synthetic 3026, mismatched approval, and unknown course identities", () => {
  assert.throws(() => buildGuideProjection({
    sheets: officialSheets(),
    tournament: { id: "3026", year: 3026 },
    approvedTournamentId: "3026",
    canonicalCourseContext: canonicalCourses(),
  }), (error) => error instanceof GuideProjectionValidationError && error.issues.some((issue) => /3026/.test(issue)));

  assert.throws(() => build({ approvedTournamentId: "2025" }), (error) =>
    error.issues.some((issue) => /not the approved tournament/.test(issue))
  );

  const sheets = officialSheets();
  sheets.Courses[0]["Course ID"] = "UNKNOWN";
  assert.throws(() => build({ sheets }), (error) =>
    error.issues.some((issue) => /unknown canonical assignment UNKNOWN:2/.test(issue))
  );

  const contradictory = officialSheets();
  contradictory.Tournaments[0]["Tournament ID"] = "3026";
  assert.throws(() => build({ sheets: contradictory }), (error) =>
    error.issues.some((issue) => /exactly one approved tournament row; found 0/.test(issue))
  );
});

test("projection rejects duplicate identities, malformed dates/times, missing headers, and incomplete canonical holes", () => {
  const duplicate = officialSheets();
  duplicate["Tournament Itinerary"].push({ ...duplicate["Tournament Itinerary"][0] });
  assert.throws(() => build({ sheets: duplicate }), (error) =>
    error.issues.some((issue) => /duplicate logical identity ROUND-2/.test(issue))
  );

  const malformed = officialSheets();
  malformed["Tournament Itinerary"][0]["Event Date"] = "2026-02-31";
  malformed["Tournament Itinerary"][0]["Start Time"] = "25:90";
  malformed["Tournament Itinerary"][0]["Display Order"] = "later";
  assert.throws(() => build({ sheets: malformed }), (error) => {
    const dateIssue = error.validationIssues.find((issue) => issue.field === "Event Date" && Object.hasOwn(issue, "currentValue"));
    const timeIssue = error.validationIssues.find((issue) => issue.field === "Start Time");
    assert.deepEqual({
      source: dateIssue.source, entity: dateIssue.entity, currentValue: dateIssue.currentValue, expectedValue: dateIssue.expectedValue,
    }, {
      source: "Tournament Itinerary", entity: "round-2", currentValue: "2026-02-31", expectedValue: "A valid 2026 tournament date",
    });
    assert.deepEqual({ currentValue: timeIssue.currentValue, expectedValue: timeIssue.expectedValue }, {
      currentValue: "25:90", expectedValue: "A valid tournament time",
    });
    return error.issues.some((issue) => /invalid approved-tournament date/.test(issue)) &&
      error.issues.some((issue) => /invalid start time/.test(issue)) &&
      error.issues.some((issue) => /invalid Display Order/.test(issue));
  });

  const missingHeader = officialSheets();
  missingHeader.Dining = missingHeader.Dining.map(({ Location: _removed, ...row }) => row);
  assert.throws(() => build({ sheets: missingHeader }), (error) =>
    error.issues.some((issue) => /Dining headers are missing Location/.test(issue))
  );

  const incomplete = canonicalCourses();
  incomplete[0].holes.pop();
  assert.throws(() => build({ canonicalCourseContext: incomplete }), (error) =>
    error.issues.some((issue) => /must have holes 1 through 18 exactly once/.test(issue))
  );
});

test("projection rejects missing, duplicate, or scoring-inconsistent course assignments", () => {
  const missing = officialSheets();
  missing.Courses.pop();
  assert.throws(() => build({ sheets: missing }), (error) =>
    error.issues.some((issue) => /canonical course assignment TPGC01:1 requires exactly one presentation row; found 0/.test(issue))
  );

  const duplicate = officialSheets();
  duplicate.Courses.push({ ...duplicate.Courses[1] });
  assert.throws(() => build({ sheets: duplicate }), (error) =>
    error.issues.some((issue) => /duplicate logical identity TPGC01:1/.test(issue)) &&
    error.issues.some((issue) => /canonical course assignment TPGC01:1 requires exactly one presentation row; found 2/.test(issue))
  );

  const wrongTee = officialSheets();
  wrongTee.Courses[1]["Tee Played"] = "Blue";
  assert.throws(() => build({ sheets: wrongTee }), (error) => {
    const detail = error.validationIssues.find((issue) => issue.field === "Tee Played");
    assert.deepEqual({
      source: detail.source, entity: detail.entity, currentValue: detail.currentValue, expectedValue: detail.expectedValue,
    }, {
      source: "Courses", entity: "TPGC01 · Round 1", currentValue: "Blue", expectedValue: "Gold",
    });
    return error.issues.some((issue) => /Courses TPGC01:1 tee does not match canonical scoring configuration/.test(issue));
  });

  const wrongFormat = officialSheets();
  wrongFormat.Courses[1].Format = "SI";
  assert.throws(() => build({ sheets: wrongFormat }), (error) => {
    const detail = error.validationIssues.find((issue) => issue.field === "Format");
    assert.equal(detail.currentValue, "SI");
    assert.equal(detail.expectedValue, "BB");
    return error.issues.some((issue) => /Courses TPGC01:1 format does not match canonical configuration/.test(issue));
  });

  const presentationYardage = officialSheets();
  presentationYardage.Courses[1].Yardage = "9999";
  const projection = build({ sheets: presentationYardage });
  assert.equal(projection.content.courses[0].Yardage, undefined);
  assert.notEqual(guideContentWithCanonicalCourses(projection.content, canonicalCourses()).courses[0].Yardage, 9999);
});

test("projection fails closed when canonical course scoring configuration is inconsistent", () => {
  const inconsistent = canonicalCourses();
  inconsistent[0].configuration_consistent = false;
  assert.throws(() => build({ canonicalCourseContext: inconsistent }), (error) =>
    error instanceof GuideProjectionValidationError &&
    error.issues.some((issue) => /canonical Course ID TPGC01 has inconsistent scoring configuration/.test(issue))
  );
});

test("Home timeline derives from the exact persisted Guide timeline rows", () => {
  const projection = build();
  const timeline = timelineFromGuideProjection(projection, {
    tournament: { year: 2026, status: "Upcoming", timeZone: "America/New_York" },
    now: new Date("2026-09-24T12:00:00Z"),
  });
  assert.equal(timeline.available, true);
  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].title, "Round 1");
  assert.equal(timeline.events[0].displayOnHome, true);
});
