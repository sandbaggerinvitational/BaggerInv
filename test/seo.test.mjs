import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_URL,
  absoluteUrl,
  pageMetadata,
  privatePageMetadata,
} from "../lib/seo.js";

test("production SEO URLs always use baggerinv.com", () => {
  assert.equal(SITE_URL, "https://baggerinv.com");
  assert.equal(absoluteUrl("/history/2025"), "https://baggerinv.com/history/2025");

  const metadata = pageMetadata({
    title: "2025 History",
    description: "Tournament history.",
    path: "/history/2025",
  });

  assert.equal(
    metadata.alternates.canonical,
    "https://baggerinv.com/history/2025"
  );
  assert.equal(metadata.openGraph.url, "https://baggerinv.com/history/2025");
  assert.equal(
    metadata.openGraph.images[0].url,
    `https://baggerinv.com${DEFAULT_SOCIAL_IMAGE}`
  );
  assert.equal(
    metadata.twitter.images[0],
    `https://baggerinv.com${DEFAULT_SOCIAL_IMAGE}`
  );
});

test("private application pages are excluded from search indexing", () => {
  const metadata = privatePageMetadata("Admin");
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.robots.follow, false);
  assert.equal(metadata.robots.noarchive, true);
});

test("root metadata configures the production title template and icons", async () => {
  const layout = await readFile(
    new URL("../app/layout.js", import.meta.url),
    "utf8",
  );

  assert.match(layout, /template: `%s \| \$\{SITE_NAME\}`/);
  assert.match(layout, /absoluteUrl\("\/favicon\.ico"\)/);
  assert.match(layout, /absoluteUrl\("\/favicon-16x16\.png"\)/);
  assert.match(layout, /absoluteUrl\("\/favicon-32x32\.png"\)/);
  assert.match(layout, /absoluteUrl\("\/icon\.png"\)/);
  assert.match(layout, /absoluteUrl\("\/apple-icon\.png"\)/);
});

test("root layout enables Vercel Web Analytics site-wide", async () => {
  const layout = await readFile(
    new URL("../app/layout.js", import.meta.url),
    "utf8",
  );

  assert.match(
    layout,
    /import \{ Analytics \} from "@vercel\/analytics\/next";/,
  );
  assert.match(layout, /\{children\}\s*<Analytics \/>/);
});
