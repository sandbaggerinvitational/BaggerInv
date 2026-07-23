import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import manifest from "../app/manifest.js";
import { SITE_URL } from "../lib/seo.js";

const PNG_SIGNATURE = "89504e470d0a1a0a";

async function pngDimensions(path) {
  const image = await readFile(new URL(path, import.meta.url));

  assert.equal(image.subarray(0, 8).toString("hex"), PNG_SIGNATURE);

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

test("production PNG icons use the expected dimensions", async () => {
  const icons = [
    ["../app/icon.png", 1024],
    ["../app/apple-icon.png", 180],
    ["../public/favicon-16x16.png", 16],
    ["../public/favicon-32x32.png", 32],
    ["../public/icon-192.png", 192],
    ["../public/icon-512.png", 512],
  ];

  for (const [path, size] of icons) {
    assert.deepEqual(await pngDimensions(path), {
      width: size,
      height: size,
    });
  }
});

test("favicon contains standard browser icon sizes", async () => {
  const favicon = await readFile(
    new URL("../app/favicon.ico", import.meta.url),
  );

  assert.equal(favicon.readUInt16LE(0), 0);
  assert.equal(favicon.readUInt16LE(2), 1);
  assert.equal(favicon.readUInt16LE(4), 3);

  const sizes = Array.from({ length: 3 }, (_, index) => {
    const offset = 6 + index * 16;
    return [favicon[offset] || 256, favicon[offset + 1] || 256];
  });

  assert.deepEqual(sizes, [
    [16, 16],
    [32, 32],
    [48, 48],
  ]);
});

test("manifest references production app icons", () => {
  const appManifest = manifest();

  assert.equal(appManifest.id, SITE_URL);
  assert.equal(appManifest.start_url, SITE_URL);
  assert.equal(appManifest.scope, `${SITE_URL}/`);
  assert.deepEqual(appManifest.icons, [
    {
      src: `${SITE_URL}/icon-192.png`,
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `${SITE_URL}/icon-512.png`,
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ]);
});
