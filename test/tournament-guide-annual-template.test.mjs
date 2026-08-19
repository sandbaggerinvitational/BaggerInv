import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { defaultAssets } from "../lib/asset-paths.js";
import { annualGuideHeroModel } from "../lib/tournament-guide-hero.js";
import { rulesCurrentContextParity, rulesPresentationModel } from "../lib/tournament-guide-rules.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("annual Guide hero binds a future tournament identity without presentation changes", () => {
  const model = annualGuideHeroModel({
    tournament: {
      year: 2027,
      "Tournament Name": "Desert Invitational",
      "Tournament Edition": "11th",
      "Tournament Dates": "October 1 - 4",
      Destination: "Scottsdale, Arizona",
      "Annual Image": "desert-2027",
      "Hero Image": "desert-resort",
      "Mobile Hero Image": "desert-resort-mobile",
    },
  });
  assert.deepEqual(model, {
    year: "2027",
    name: "Desert Invitational",
    edition: "11th Annual",
    dates: "October 1–4",
    destination: "Scottsdale, Arizona",
    logoImage: "/images/tournaments/logos/desert-2027.png",
    logoSource: "tournament",
    heroImage: "/images/tournaments/hero/desert-resort.webp",
    mobileHeroImage: "/images/tournaments/hero/desert-resort-mobile.webp",
    heroSource: "tournament",
    heroAlt: "Scottsdale, Arizona tournament destination",
  });
});

test("annual Guide hero has polished logo-only, image-only, and neither fallbacks", () => {
  const logoOnly = annualGuideHeroModel({
    tournament: { year: 2027, "Tournament Logo": "future-logo", Destination: "Future Destination" },
    courses: [
      { Round: 1, "Course Profile Image": "round-one" },
      { Round: 3, "Course Profile Image": "championship-course" },
    ],
  });
  assert.equal(logoOnly.logoImage, "/images/tournaments/logos/future-logo.png");
  assert.equal(logoOnly.heroImage, "/images/courses/hero/championship-course.webp");
  assert.equal(logoOnly.heroSource, "current-course");

  const imageOnly = annualGuideHeroModel({ tournament: { year: 2028, "Hero Image": "coastal-destination" } });
  assert.equal(imageOnly.logoImage, "/images/tournaments/logos/sandbagger-2028.png");
  assert.equal(imageOnly.logoSource, "active-year-convention");
  assert.equal(imageOnly.heroImage, "/images/tournaments/hero/coastal-destination.webp");

  const neither = annualGuideHeroModel();
  assert.equal(neither.logoImage, "");
  assert.equal(neither.logoSource, "missing");
  assert.equal(neither.heroImage, defaultAssets.tournamentHero);
  assert.equal(neither.mobileHeroImage, defaultAssets.tournamentHero);
  assert.equal(neither.heroSource, "default");
});

test("changed Guide presentation contains no current-year tournament literals", async () => {
  const runtime = (await Promise.all([
    "app/tournament-guide/TournamentGuideHero.js",
    "app/tournament-guide/AnnualGuideHeroMedia.js",
    "app/tournament-guide/page.js",
    "app/tournament-guide/GuideDetailPage.js",
    "app/tournament-guide/ScheduleItinerary.js",
    "app/tournament-guide/DiningItinerary.js",
    "app/tournament-guide/LocalGuide.js",
    "app/tournament-guide/ImportantContacts.js",
    "lib/tournament-guide-hero.js",
    "lib/tournament-guide-rules.js",
    "lib/tournament-guide-schedule.js",
    "lib/tournament-guide-local.js",
    "lib/tournament-guide-contacts.js",
  ].map(source))).join("\n");
  for (const annualLiteral of ["2026", "Kiawah", "10th Annual", "September 25", "Turtle Point", "Cougar Point", "The Ocean Course"]) {
    assert.doesNotMatch(runtime, new RegExp(annualLiteral.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Rules presentation gives each format-specific source rule one participant home", () => {
  const bestBall = { "Rule ID": "bb", Title: "Best Ball scoring", Body: "Use the better net score." };
  const shared = { "Rule ID": "shared", Title: "Best Ball and Scramble pace", Body: "Keep pace." };
  const general = { "Rule ID": "general", Title: "General conduct", Body: "Play promptly." };
  const model = rulesPresentationModel([bestBall, shared, general]);
  assert.deepEqual(model.byFormat.BB, [bestBall]);
  assert.deepEqual(model.byFormat.SC, []);
  assert.deepEqual(model.byFormat.SI, []);
  assert.deepEqual(model.remaining, [shared, general]);
  assert.equal([...Object.values(model.byFormat), model.remaining].flat().length, 3);
});

test("Rules parity detects current format drift without pretending points or handicap are comparable", () => {
  const pass = rulesCurrentContextParity({
    liveRounds: [{ number: 1, format: "Best Ball" }, { number: 2, format: "SC" }],
    tournamentRules: [{ Round: 1, Format: "BB" }, { Round: 2, Format: "Scramble" }],
    formats: [{ "Format ID": "BB" }, { "Format ID": "SC" }],
  });
  assert.equal(pass.format, "PASS");
  assert.equal(pass.points, "NOT_STRUCTURALLY_COMPARABLE");
  assert.equal(pass.handicap, "NOT_STRUCTURALLY_COMPARABLE");
  assert.deepEqual(pass.issues, []);

  const conflict = rulesCurrentContextParity({
    liveRounds: [{ number: 1, format: "SI" }],
    tournamentRules: [{ Round: 1, Format: "BB" }],
    formats: [{ "Format ID": "BB" }],
  });
  assert.equal(conflict.format, "DEFECT_FOUND");
  assert.match(conflict.issues.join(" "), /Round 1 format is SI/);
  assert.match(conflict.issues.join(" "), /missing from the Rounds catalog/);
});

test("Guide maintenance labels distinguish Google authoring from participant projection refresh", async () => {
  const [editor, readiness] = await Promise.all([
    source("app/admin/tournament-guide/GuideEditor.js"),
    source("app/admin/director/game-center-readiness/GameCenterReadinessClient.js"),
  ]);
  assert.match(editor, /Mark Published/);
  assert.match(editor, /Mark Draft/);
  assert.doesNotMatch(editor, />Publish<|>Unpublish</);
  assert.match(editor, /Saved to Google\. Refresh Participant Guide to update Preview\./);
  assert.match(editor, /Recommended primary Schedule editor: Admin Center → Schedule/);
  assert.match(editor, /Information \(Legacy\)/);
  assert.match(editor, /not used by the current participant Tournament Guide/);
  assert.match(readiness, />Refresh Participant Guide</);
  assert.match(readiness, /guideOperation\("refresh-guide-content"\)/);
});
