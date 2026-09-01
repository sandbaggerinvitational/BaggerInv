import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { metadata as adminMetadata } from "../app/admin/layout.js";
import { metadata as participantMetadata } from "../app/app/layout.js";
import sitemap from "../app/sitemap.js";
import { getLeaderboardSlugs } from "../lib/leaderboards.js";
import { MATCH_PROGRESSION_RECORD_SLUGS } from "../lib/match-progression.js";
import { PUBLIC_RECORD_SLUGS, isPublicRecordSlug } from "../lib/public-record-routes.js";
import { SCORECARD_RECORD_SLUGS } from "../lib/scorecard-record-leaderboards.js";
import { SITE_URL, pageMetadata, privatePageMetadata } from "../lib/seo.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("representative public metadata has one branded title and an exact canonical", () => {
  for (const [title, path] of [
    ["History | The Sandbagger Invitational", "/history"],
    ["Clay Beltran | The Sandbagger Invitational", "/players/clay-beltran"],
    ["2025 Tournament", "/history/2025"],
    ["Ocean Course", "/courses/OC01"],
    ["Career Points", "/records/career-points"],
  ]) {
    const metadata = pageMetadata({ title, path });
    assert.equal(metadata.title.absolute.split("The Sandbagger Invitational").length - 1, 1);
    assert.equal(metadata.alternates.canonical, `${SITE_URL}${path}`);
    assert.equal(metadata.openGraph.url, `${SITE_URL}${path}`);
    assert.equal(metadata.openGraph.title, metadata.title.absolute);
    assert.equal(metadata.twitter.title, metadata.title.absolute);
    assert.equal(metadata.openGraph.images[0].url.startsWith(`${SITE_URL}/`), true);
  }
});

test("private participant, auth, and administration metadata removes the public canonical", async () => {
  const privateMetadata = privatePageMetadata("My Match | Sandbagger Invitational");
  for (const metadata of [privateMetadata, participantMetadata, adminMetadata]) {
    assert.equal(metadata.robots.index, false);
    assert.equal(metadata.robots.follow, false);
    assert.equal(metadata.alternates.canonical, null);
    assert.equal(metadata.openGraph, null);
    assert.equal(metadata.twitter, null);
  }

  const [participantAuth, activate] = await Promise.all([
    source("app/participant-auth/page.js"),
    source("app/activate/page.js"),
  ]);
  assert.match(participantAuth, /privatePageMetadata\("Sign In · The Bagger"\)/);
  assert.match(activate, /privatePageMetadata\("Activate Player Passport"\)/);
});

test("the canonical Record route registry covers every supported detail contract exactly once", () => {
  const expected = new Set([
    ...getLeaderboardSlugs(),
    ...SCORECARD_RECORD_SLUGS,
    ...MATCH_PROGRESSION_RECORD_SLUGS,
  ]);
  assert.equal(PUBLIC_RECORD_SLUGS.length, expected.size);
  assert.deepEqual(new Set(PUBLIC_RECORD_SLUGS), expected);
  assert.equal(new Set(PUBLIC_RECORD_SLUGS).size, PUBLIC_RECORD_SLUGS.length);
  for (const slug of expected) assert.equal(isPublicRecordSlug(slug), true, slug);
  assert.equal(isPublicRecordSlug("retired-record"), false);
});

test("sitemap includes every Record destination once and excludes private surfaces", async () => {
  const originalEnvironment = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    const entries = await sitemap();
    const urls = entries.map((item) => item.url);
    assert.equal(new Set(urls).size, urls.length);
    for (const slug of PUBLIC_RECORD_SLUGS) {
      assert.equal(urls.filter((url) => url === `${SITE_URL}/records/${slug}`).length, 1, slug);
    }
    for (const path of [
      "/home", "/my-match", "/score", "/me", "/participant-auth",
      "/app/guide", "/admin", "/admin/director", "/api/tournament/live",
    ]) {
      assert.equal(urls.includes(`${SITE_URL}${path}`), false, path);
    }
  } finally {
    if (originalEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalEnvironment;
  }
});

test("public dynamic route families retain distinct path-aware metadata without new loaders", async () => {
  const pages = await Promise.all([
    "app/players/[slug]/page.js",
    "app/history/[year]/page.js",
    "app/history/[year]/round/[round]/page.js",
    "app/history/[year]/team/[side]/page.js",
    "app/champions/[year]/page.js",
    "app/courses/[courseId]/page.js",
    "app/courses/[courseId]/holes/[holeNumber]/page.js",
    "app/records/[slug]/page.js",
  ].map(source));
  for (const page of pages) assert.match(page, /return pageMetadata\(\{/);
  assert.match(pages[0], /path: `\/players\/\$\{slug\}`/);
  assert.match(pages[1], /path: `\/history\/\$\{year\}`/);
  assert.match(pages[2], /path: `\/history\/\$\{year\}\/round\/\$\{round\}`/);
  assert.match(pages[3], /const decodedSide = decodeURIComponent\(side\)/);
  assert.match(pages[3], /path: `\/history\/\$\{year\}\/team\/\$\{encodeURIComponent\(decodedSide\)\}`/);
  assert.match(pages[4], /path: `\/champions\/\$\{year\}`/);
  assert.match(pages[5], /path: `\/courses\/\$\{encodeURIComponent\(courseId\)\}`/);
  assert.match(pages[6], /path: `\/courses\/\$\{encodeURIComponent\(courseId\)\}\/holes\/\$\{holeNumber\}`/);
  assert.match(pages[7], /path: `\/records\/\$\{slug\}`/);
});

test("released accessibility fixes remain represented in the Step 14 contracts", async () => {
  const [menu, advancedTable, draftStyles] = await Promise.all([
    source("app/Menu.js"),
    source("app/statistics/AdvancedTable.js"),
    source("app/draft/draft.module.css"),
  ]);
  assert.match(menu, /menuButton\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(advancedTable, /scope="col"/);
  assert.match(advancedTable, /scope="row"/);
  assert.match(advancedTable, /role="region"/);
  assert.match(advancedTable, /tabIndex=\{0\}/);
  assert.match(draftStyles, /min-height:\s*44px/);
});
