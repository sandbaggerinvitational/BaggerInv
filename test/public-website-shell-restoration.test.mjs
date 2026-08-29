import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the public site menu restores its original tournament footer without changing the PWA Hub", async () => {
  const menu = await source("app/Menu.js");
  const siteContent = menu.slice(menu.indexOf("const siteContent"), menu.indexOf("const hubContent"));
  const hubContent = menu.slice(menu.indexOf("const hubContent"), menu.indexOf("return ("));

  assert.match(siteContent, /<nav className="sideNav sideNavSite" aria-label="Site navigation">[\s\S]*navigationSections\.map/);
  assert.match(siteContent, /<div className="sideMenuFooter">24 players · Two teams · One trophy<\/div>/);
  assert.match(siteContent, /directorMenuLink[\s\S]*Tournament Director/);
  assert.doesNotMatch(hubContent, /sideMenuFooter|24 players · Two teams · One trophy/);
  assert.match(menu, /appShell[\s\S]*\? <Sheet[\s\S]*: <>[\s\S]*\{siteContent\}/);
});

test("the public Match Center final-results action restores Champions while Supabase delivery stays selected", async () => {
  const [matchCenter, livePage, transport] = await Promise.all([
    source("app/live/MatchCenter.js"),
    source("app/live/page.js"),
    source("app/live/TournamentSupabaseRead.js"),
  ]);

  assert.match(matchCenter, /href=\{`\/champions\/\$\{tournament\.year\}`\}>View Final Results →<\/Link>/);
  assert.doesNotMatch(matchCenter, /href=\{`\/history\/\$\{tournament\.year\}`\}>View Final Results →<\/Link>/);
  assert.match(livePage, /requireTournamentReadSource\(env\)/);
  assert.match(livePage, /<TournamentSupabaseRead[\s\S]*presentation=\{participantPresentation \? "participant" : "public"\}/);
  assert.match(transport, /presentation === "public"[\s\S]*<MatchCenterExperience/);
  assert.match(transport, /fetch\("\/api\/tournament\/live"/);
});
