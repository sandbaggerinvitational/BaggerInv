// Synthetic local UI certification; no Production routes or identities are used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.BAGGER_TEST_PLAYWRIGHT_PATH || "playwright",
);
const compiled = require("next/dist/compiled/webpack/webpack");
compiled.init();
const root = process.cwd(),
  out = await mkdtemp(join(tmpdir(), "bagger-calcutta-ui-"));
const config = {
  mode: "development",
  context: root,
  entry: "./test/fixtures/calcutta-management-browser.jsx",
  output: { path: out, filename: "fixture.js" },
  resolve: { extensions: [".js", ".jsx"] },
  module: {
    rules: [
      {
        test: /\.(jsx?|css)$/,
        exclude: /node_modules/,
        use: [resolve(root, "test/fixtures/calcutta-browser-loader.cjs")],
      },
    ],
  },
};
await new Promise((yes, no) =>
  compiled
    .webpack(config)
    .run((error, stats) =>
      error || stats.hasErrors()
        ? no(error || new Error(stats.toString()))
        : yes(),
    ),
);
const bundle = await readFile(join(out, "fixture.js"));
const server = createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.end(bundle);
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px Arial}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
    );
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BAGGER_TEST_BROWSER_CHANNEL
    ? { channel: process.env.BAGGER_TEST_BROWSER_CHANNEL }
    : {}),
});
try {
  for (const width of [390, 430, 820, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Browser error:", e.message);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page
      .getByText("Canonical state loaded. No write performed.")
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.fixtureCalls.map((c) => c.action)),
      ["management-read"],
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `configuration overflow ${width}`,
    );
    assert.equal(
      await page
        .getByLabel("Overall place 24 payout %", { exact: true })
        .inputValue(),
      "5",
    );
    await page.getByLabel("R1 place 1 points", { exact: true }).fill("97");
    await page
      .getByRole("button", { name: "Review Changes", exact: true })
      .click();
    await page.getByText("I confirm these exact changes.").waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Save New Revision", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: join(out, `configuration-${width}.png`),
      fullPage: true,
    });
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Discard Changes / Reload", exact: true })
      .click();
    await page
      .getByText("Canonical state loaded. No write performed.")
      .waitFor();
    await page
      .getByRole("button", { name: "Auction / Ownership", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit Synthetic Golfer 1", exact: true })
      .click();
    await page.getByLabel("Purchase price (USD)", { exact: true }).fill("2000");
    await page
      .getByRole("button", { name: "+ Add Owner", exact: true })
      .click();
    await page.getByLabel("Buyer", { exact: true }).selectOption("P1");
    await page.getByLabel("Ownership %", { exact: true }).fill("99");
    assert.equal(
      await page
        .getByRole("button", { name: "Review Changes", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByLabel("Ownership %", { exact: true }).fill("100");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `auction overflow ${width}`,
    );
    const small = await page
      .locator("button")
      .evaluateAll((nodes) =>
        nodes
          .filter(
            (n) =>
              n.getBoundingClientRect().height > 0 &&
              n.getBoundingClientRect().height < 44,
          )
          .map((n) => n.textContent),
      );
    assert.deepEqual(small, []);
    await page
      .getByRole("button", { name: "Review Changes", exact: true })
      .click();
    await page.getByLabel("I confirm these exact changes.").check();
    await page
      .getByRole("button", { name: "Save & Next", exact: true })
      .click();
    await page
      .getByRole("heading", {
        name: "Purchase: Synthetic Golfer 2",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.fixtureCalls.filter((c) => c.action === "management-entry")
            .length,
      ),
      1,
    );
    await page.keyboard.press("Tab");
    assert.notEqual(
      await page.evaluate(() => document.activeElement.tagName),
      "BODY",
    );
    await page.screenshot({
      path: join(out, `auction-${width}.png`),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `${width}px PASS: contained layout, labeled input, review confirmation, incomplete ownership blocked, self-purchase, Save & Next, keyboard, no write on load`,
    );
  }
  console.log(`Evidence: ${out}`);
} finally {
  await browser.close();
  await new Promise((ok) => server.close(ok));
}
