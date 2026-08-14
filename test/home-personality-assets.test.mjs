import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalCourseLogoFilenames,
  courseLogoSources,
  defaultAssets,
  optimizedAssetUrl,
} from "../lib/asset-paths.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Home course artwork resolves from canonical Course ID with the existing fallback", () => {
  assert.deepEqual(canonicalCourseLogoFilenames, {
    TPGC01: "turtle-point-logo",
    CPGC01: "cougar-point-logo",
    OCGC01: "ocean-course-logo",
  });
  assert.deepEqual(courseLogoSources({ courseId: "TPGC01" }), [
    "/images/courses/logos/turtle-point-logo.png",
    defaultAssets.courseLogo,
  ]);
  assert.deepEqual(courseLogoSources({ courseId: "CPGC01", filename: "cougar-point-logo" }), [
    "/images/courses/logos/cougar-point-logo.png",
    defaultAssets.courseLogo,
  ]);
  assert.deepEqual(courseLogoSources({ courseId: "OCGC01", filename: "presentation-ocean" }), [
    "/images/courses/logos/presentation-ocean.png",
    "/images/courses/logos/ocean-course-logo.png",
    defaultAssets.courseLogo,
  ]);
  assert.deepEqual(courseLogoSources({ courseId: "UNKNOWN" }), [defaultAssets.courseLogo]);
  assert.equal(
    optimizedAssetUrl("/images/courses/logos/turtle-point-logo.png", 48),
    "/_next/image?url=%2Fimages%2Fcourses%2Flogos%2Fturtle-point-logo.png&w=48&q=75",
  );
});

test("Home reuses course identity for primary, multiple-match, and grouped-round presentations", async () => {
  const [component, styles] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/personalized-player-home.module.css"),
  ]);
  assert.match(component, /function CourseIdentity/);
  assert.match(component, /courseLogoSources\(\{ courseId: match\?\.courseId, filename: match\?\.courseLogo \}\)/);
  assert.equal((component.match(/<CourseIdentity match=/g) || []).length, 3);
  assert.match(component, /<CourseIdentity match=\{match\} compact \/>[\s\S]*className=\{styles\.roundSummary\}/);
  assert.match(component, /className=\{styles\.choices\}[\s\S]*<CourseIdentity match=\{match\} compact \/>/);
  assert.match(component, /<MobileIdentityImage[\s\S]*optimizedAssetUrl\(source, width\)/);
  assert.match(styles, /\.roundCourseLogo,[\s\S]*width:\s*32px;[\s\S]*object-fit:\s*contain/);
  assert.match(styles, /\.choices \.roundCourseLogo,[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
});

test("Home restores the original Net Skins medallion treatment without a replacement asset", async () => {
  const [component, styles] = await Promise.all([
    source("app/PersonalizedPlayerHome.js"),
    source("app/personalized-player-home.module.css"),
  ]);
  assert.match(component, /className=\{styles\.skinCoin\} aria-hidden="true">S<\/span>/);
  assert.match(styles, /\.skinCoin\s*\{[^}]*radial-gradient[^}]*inset 0 0 0 3px #f2d77c/);
  assert.doesNotMatch(component, /net-skins.*\.(png|webp|svg)/i);
});

test("Home adopts the same primary-destination header primitive as Tournament and Leaderboards", async () => {
  const [identity, command, styles] = await Promise.all([
    source("app/TournamentIdentityHeader.js"),
    source("app/TournamentCommandCenter.js"),
    source("app/tournament-command-center.module.css"),
  ]);
  assert.match(identity, /tournamentLogo\(`sandbagger-\$\{year\}`\)/);
  assert.match(command, /<TournamentIdentityHeader[\s\S]*variant="hero"/);
  assert.doesNotMatch(command.slice(command.indexOf("if (supabaseCommandCenter)"), command.indexOf("<PersonalizedPlayerHome")), /\bcompact\b/);
  assert.match(styles, /\.page\{background:#f6f3eb\}/);
});

test("asset restoration leaves Home hierarchy, deduplication, casing, and request topology intact", async () => {
  const [command, component, participant] = await Promise.all([
    source("app/TournamentCommandCenter.js"),
    source("app/PersonalizedPlayerHome.js"),
    source("app/ParticipantSupabaseHome.js"),
  ]);
  const branch = command.slice(command.indexOf("if (supabaseCommandCenter)"), command.indexOf("return <div className={styles.page}>", command.indexOf("if (supabaseCommandCenter)") + 1));
  const order = ["<TournamentIdentityHeader", "<PersonalizedPlayerHome", "{pulse}", "<TournamentSchedule compact", "<TournamentMoments", "<PersonalizedPlayerHomeSecondary"].map((token) => branch.indexOf(token));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(component, /homeRoundSummaryMatches\(matches, promotedMatchIds\(selection\)\)/);
  assert.match(component, /`Round \$\{match\.round\}`/);
  assert.match(component, /homeFormatLabel\(match\.format\)/);
  assert.equal((participant.match(/\/api\/participant\/home/g) || []).length, 2);
  assert.equal((participant.match(/\/api\/leaderboards\/net-skins/g) || []).length, 1);
  assert.doesNotMatch([command, component, participant].join("\n"), /Google Sheets|gviz|opensheet|spreadsheets\.google/i);
});
