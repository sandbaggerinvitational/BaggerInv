import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyGuideCoursePresentation,
  applyGuideCoursesToMyMatch,
  applyGuideCoursesToTournament,
  applyGuideCourseToGameCenter,
  applyGuideProjectionToHome,
  guideParticipantProjection,
} from "../lib/guide-participant-adapter.js";

const guideRead = {
  payload: {
    ok: true,
    data: {
      projection_revision: 7,
      publication_sequence: 11,
      content_fingerprint: "abc123",
      published_at: "2026-08-13T12:00:00.000Z",
      course_context: [{
        course_id: "TPGC01", tee: "Blue", rating: 72.4, slope: 138, par: 72,
        rounds: [{ round_number: 1, format: "BB", name: "Round 1" }],
        holes: Array.from({ length: 18 }, (_, index) => ({
          hole_number: index + 1, yardage: 370 + index, par: 4, stroke_index: index + 1,
        })),
      }],
      content: {
        schemaVersion: "guide-projection-v1",
        content: {
          courses: [{
            "Course ID": "TPGC01", Round: "1", Course: "Director Course Name",
            "Course Logo": "director-course.svg", City: "Pinehurst", State: "NC",
            "Course Overview": "Participant course description.",
          }],
          timelineRows: [{
            Year: "2026", "Tournament Day": "Thursday", "Event Date": "2026-08-13",
            "Start Time": "08:00", "End Time": "09:00", "Event Type": "Breakfast",
            Title: "Welcome Breakfast", Subtitle: "", Location: "Clubhouse",
            "Display on Home": "TRUE", "Notification Minutes": "30", "Sort Order": "1",
            "Status Override": "",
          }, {
            Year: "2026", "Tournament Day": "Thursday", "Event Date": "2026-08-13",
            "Start Time": "10:00", "End Time": "11:00", "Event Type": "Briefing",
            Title: "Director Briefing", Subtitle: "", Location: "Meeting Room",
            "Display on Home": "FALSE", "Notification Minutes": "", "Sort Order": "2",
            "Status Override": "",
          }],
        },
      },
    },
  },
};

test("participant adapter unwraps the published revision and preserves safe metadata", () => {
  const projected = guideParticipantProjection(guideRead);
  assert.equal(projected.metadata.source, "supabase");
  assert.equal(projected.metadata.revision, 7);
  assert.equal(projected.metadata.contentFingerprint, "abc123");
  assert.equal(projected.content.courses[0]["Course ID"], "TPGC01");
  assert.equal(projected.content.courses[0]["Tee Played"], "Blue");
  assert.equal(projected.content.courses[0].Rating, 72.4);
  assert.equal(projected.content.courseHoles.length, 18);
});

test("fresh canonical course context changes delivery without rewriting the immutable Guide revision", () => {
  const first = guideParticipantProjection(guideRead);
  const refreshed = structuredClone(guideRead);
  refreshed.payload.data.course_context[0].tee = "Tournament Gold";
  refreshed.payload.data.course_context[0].rating = 73.1;
  refreshed.payload.data.course_context[0].holes[0].yardage = 421;
  const second = guideParticipantProjection(refreshed);

  assert.equal(first.metadata.revision, second.metadata.revision);
  assert.equal(first.metadata.contentFingerprint, second.metadata.contentFingerprint);
  assert.equal(first.content.courses[0]["Tee Played"], "Blue");
  assert.equal(second.content.courses[0]["Tee Played"], "Tournament Gold");
  assert.equal(second.content.courses[0].Rating, 73.1);
  assert.equal(second.content.courseHoles[0].Yardage, 421);
});

test("Guide course presentation changes display fields but never scoring-critical fields or canonical identity", () => {
  const canonical = {
    id: "TPGC01", name: "Old Name", logo: "old.svg", tee: "Blue", rating: 72.4,
    slope: 138, par: 72, yardage: 6980, strokeAllocation: [1, 2, 3],
  };
  const result = applyGuideCoursePresentation(canonical, guideRead, { round: 1 });
  assert.deepEqual({ id: result.id, tee: result.tee, rating: result.rating, slope: result.slope,
    par: result.par, yardage: result.yardage, strokeAllocation: result.strokeAllocation },
  { id: "TPGC01", tee: "Blue", rating: 72.4, slope: 138, par: 72, yardage: 6980,
    strokeAllocation: [1, 2, 3] });
  assert.equal(result.name, "Director Course Name");
  assert.equal(result.logo, "director-course.svg");
  assert.equal(result.location, "Pinehurst, NC");
  assert.equal(result.description, "Participant course description.");
});

test("Tournament, Game Center and My Match use one canonical Course ID presentation mapping", () => {
  const tournament = applyGuideCoursesToTournament({ rounds: [{
    number: 1,
    course: { id: "TPGC01", name: "Old", tee: "Blue" },
    matches: [{ round: 1, course: { id: "TPGC01", name: "Old", tee: "Blue" } }],
  }] }, guideRead);
  assert.equal(tournament.rounds[0].course.name, "Director Course Name");
  assert.equal(tournament.rounds[0].matches[0].course.name, "Director Course Name");
  assert.equal(tournament.rounds[0].matches[0].course.tee, "Blue");

  const gameCenter = applyGuideCourseToGameCenter({
    match: { round: 1, course: { id: "TPGC01", name: "Old", tee: "Blue" } },
    display: { courseName: "Old", course: { name: "Old", tee: "Blue", rating: 72.4 } },
  }, guideRead);
  assert.equal(gameCenter.match.course.name, "Director Course Name");
  assert.equal(gameCenter.display.courseName, "Director Course Name");
  assert.equal(gameCenter.display.course.rating, 72.4);

  const myMatch = applyGuideCoursesToMyMatch({ matches: [{
    matchId: "2026-R1-1", round: 1, courseId: "TPGC01", course: "Old", courseLogo: "old.svg", tee: "Blue",
  }] }, guideRead);
  assert.equal(myMatch.matches[0].course, "Director Course Name");
  assert.equal(myMatch.matches[0].courseLogo, "director-course.svg");
  assert.equal(myMatch.matches[0].courseId, "TPGC01");
  assert.equal(myMatch.matches[0].tee, "Blue");
});

test("Home timeline and course presentation share the current Guide revision while retaining full Guide itinerary elsewhere", () => {
  const home = applyGuideProjectionToHome({
    participant: { matches: [{ round: 1, courseId: "TPGC01", course: "Old", tee: "Blue" }] },
    liveData: {
      tournament: { id: "2026", year: 2026, status: "Live", timeZone: "America/Chicago" },
      rounds: [{ number: 1, status: "Live", format: "Best Ball",
        course: { id: "TPGC01", name: "Old", tee: "Blue" }, matches: [] }],
      timeline: { available: true, events: [{ id: "stale" }] },
      schedule: [{ id: "stale" }],
    },
    presentation: {},
  }, guideRead, { now: new Date("2026-08-13T13:30:00.000Z") });

  assert.equal(home.presentation.guide.revision, 7);
  assert.equal(home.liveData.rounds[0].course.name, "Director Course Name");
  assert.equal(home.participant.matches[0].course, "Director Course Name");
  assert.equal(home.liveData.timeline.available, true);
  assert.deepEqual(home.liveData.timeline.events.map((event) => event.title), ["Welcome Breakfast"]);
  assert.deepEqual(home.liveData.schedule.map((event) => event.title), ["Welcome Breakfast"]);
});

test("participant consistency routes isolate Guide delivery failures and contain no Google fallback", async () => {
  const files = await Promise.all([
    "../app/api/participant/home/route.js",
    "../app/api/tournament/live/route.js",
    "../app/api/game-center/[matchId]/route.js",
    "../app/api/my-match/route.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of files) {
    assert.match(source, /readGuideProjection/);
    assert.match(source, /GUIDE_PROJECTION_UNAVAILABLE/);
    assert.match(source, /Google-Requests", "0"|googleRequests:\s*0/);
    assert.doesNotMatch(source, /getTournamentData|readWorkbookSheetsByName|resolveGuideContentGoogle/);
  }
  const gameCenterPage = await readFile(new URL("../app/game-center/[matchId]/page.js", import.meta.url), "utf8");
  assert.match(gameCenterPage, /readGuideProjection/);
  assert.match(gameCenterPage, /applyGuideCourseToGameCenter/);
  assert.match(gameCenterPage, /\.catch\(\(\) => null\)/);
  assert.doesNotMatch(gameCenterPage, /getTournamentData|readWorkbookSheetsByName|resolveGuideContentGoogle/);
});
