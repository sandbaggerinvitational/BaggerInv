import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { publicHomepageTournamentLogo } from "../app/homepage-history-card.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public homepage history cards resolve the existing tournament marks", async () => {
  for (let year = 2017; year <= 2026; year += 1) {
    const expected = `/images/tournaments/logos/sandbagger-${year}.png`;
    assert.equal(publicHomepageTournamentLogo({ year }), expected);
    await access(new URL(`../public${expected}`, import.meta.url));
  }

  assert.equal(
    publicHomepageTournamentLogo({ year: 2024, logoFileName: "sandbagger-2019.png" }),
    "/images/tournaments/logos/sandbagger-2019.png",
  );
  assert.equal(publicHomepageTournamentLogo({ year: 2030 }), null);
});

test("public homepage renders the compact contained 2026 Upcoming pill", async () => {
  const [page, css] = await Promise.all([
    source("app/page.js"),
    source("app/globals.css"),
  ]);

  assert.match(page, /src=\{publicHomepageTournamentLogo\(tournament\)\}/);
  assert.match(page, /<span className="yearCardYear">\{tournament\.year\}<\/span>/);
  assert.match(page, /<StatusBadge className="yearCardStatus" status="Upcoming" \/>/);
  assert.doesNotMatch(css, /\.yearCard span\s*\{/);
  assert.match(css, /\.yearCard\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.yearCard \.yearCardStatus\s*\{[^}]*align-self:\s*flex-start;[^}]*width:\s*max-content;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*font:\s*900 \.62rem\/1 Arial, sans-serif;[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.yearGrid\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css.match(/\.yearCard \.yearCardStatus\s*\{[^}]*\}/s)?.[0] || "", /position:\s*absolute/);
});

test("participant history remains on its explicit PWA presentation", async () => {
  const [participantRoute, sharedHistory] = await Promise.all([
    source("app/app/history/page.js"),
    source("app/history/page.js"),
  ]);

  assert.match(participantRoute, /participantPresentation:\s*true/);
  assert.match(sharedHistory, /participantPresentation \? pwaStyles\.yearGrid : ""/);
  assert.doesNotMatch(participantRoute, /homepage-history-card|yearCardStatus|publicHomepageTournamentLogo/);
});
