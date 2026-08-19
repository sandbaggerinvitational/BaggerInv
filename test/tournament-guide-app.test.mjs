import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Tournament Guide leads with app-first actionable destinations", async () => {
  const page = await source("app/tournament-guide/page.js");
  for (const title of ["Schedule", "Courses", "Rules & Formats", "Dining", "Local Guide", "Important Contacts"]) {
    assert.match(page, new RegExp(`title: "${title.replace(/[&]/g, "&")}"`));
  }
  assert.match(page, /className=\{styles\.directory\}/);
  assert.doesNotMatch(page, /className=\{styles\.overview\}/);
  assert.match(page, /Quick access to the information golfers use most\./);
  assert.match(page, /title: "Local Guide", detail: "Local resources and transportation"/);
  assert.doesNotMatch(page, /Tournament-week local concierge/);
});

test("Guide destinations are focused same-origin Supabase views with a flag-gated legacy rollback boundary", async () => {
  const [page, detail, route, resolver, normalized, schema] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/tournament-guide/GuideDetailPage.js"),
    source("app/tournament-guide/[section]/page.js"), source("app/tournament-guide/resolveGuideContent.js"),
    source("app/live/sheetData.js"), source("lib/tournament-guide-content.js"),
  ]);
  for (const destination of ["schedule", "rules", "dining", "getting-around", "contacts"]) {
    assert.match(page, new RegExp(`/tournament-guide/${destination}`));
    assert.match(route, new RegExp(`"${destination}"`));
  }
  assert.match(detail, /resolveTournamentGuideContent\(\)/);
  assert.match(resolver, /requireGuideReadSource/);
  assert.match(resolver, /readGuideProjection\(\{ surface \}\)/);
  assert.match(resolver, /guideContentWithCanonicalCourses/);
  assert.match(resolver, /source\.source\.resolved === "google"/);
  assert.doesNotMatch(resolver, /getTournamentData|refreshHistoricalData|readWorkbookSheetsByName|validateTournamentGuideHeaders|lastGood/);
  assert.match(normalized, /publicGuideRecords\(itineraryRows, guideTournament\)/);
  for (const sheet of ["Tournament Itinerary", "Courses", "Rule Book", "Tournament Rules", "Rounds", "Dining", "Local Guide", "Important Contacts"]) assert.match(schema, new RegExp(sheet));
  assert.doesNotMatch(detail, /target="_blank"|window\.open|https?:\/\//);
  assert.match(detail, /<Link className=\{styles\.backToGuide\} href="\/tournament-guide">‹ Tournament Guide<\/Link>/);
  assert.doesNotMatch(detail, /Find what you need|className=\{styles\.directory\}/);
});

test("Courses defaults to the active tournament and offers the historical archive", async () => {
  const [courses, resolver] = await Promise.all([source("app/courses/page.js"), source("app/tournament-guide/resolveGuideContent.js")]);
  assert.match(courses, /resolveTournamentGuideContent\(\{ surface: "course" \}\)/);
  assert.match(courses, /archive\s*\?\s*await import\("\.\.\/tournament-guide\/resolveGuideContentGoogle\.js"\)/);
  assert.doesNotMatch(courses, /getTournamentData|refreshHistoricalData|loadTournamentGuideSheets/);
  assert.match(resolver, /courses: stored\.courses \|\| \[\]/);
  assert.match(courses, /View Course Archive/);
  assert.match(courses, /\/courses\?view=archive/);
  assert.match(courses, /href="\/tournament-guide">‹ Tournament Guide/);
});

test("Tournament Guide landing owns the published projection-driven annual hero while detail routes stay compact", async () => {
  const [hero, heroModel, guide, detail, courses, courseDetail, resolver] = await Promise.all([
    source("app/tournament-guide/TournamentGuideHero.js"),
    source("lib/tournament-guide-hero.js"),
    source("app/tournament-guide/page.js"),
    source("app/tournament-guide/GuideDetailPage.js"),
    source("app/courses/page.js"),
    source("app/courses/[courseId]/page.js"),
    source("app/tournament-guide/resolveGuideContent.js"),
  ]);
  for (const field of ["Tournament Name", "Tournament Edition", "Tournament Dates", "Tournament Logo", "Hero Image", "Mobile Hero Image"]) {
    assert.match(heroModel, new RegExp(field));
  }
  assert.match(hero, /annualGuideHeroModel\(\{ tournament, courses \}\)/);
  assert.match(hero, /<AnnualGuideHeroMedia/);
  assert.match(hero, /<h1 id="tournament-guide-title">Tournament Guide<\/h1>/);
  assert.match(heroModel, /tournamentLogo/);
  assert.match(heroModel, /current-course/);
  assert.match(resolver, /tournamentIdentity/);
  assert.match(resolver, /data\.tournament\?\.name \|\| stored\.tournamentIdentity\?\.name/);
  assert.match(resolver, /stored\.tournamentIdentity\?\.dates/);
  assert.match(resolver, /stored\.tournamentIdentity\?\.location/);
  assert.match(guide, /<TournamentGuideHero tournament=\{tournamentIdentity\} courses=\{courses\} \/>/);
  assert.doesNotMatch(detail, /TournamentGuideHero/);
  assert.doesNotMatch(courses, /TournamentGuideHero/);
  assert.match(detail, /className=\{styles\.backToGuide\}/);
  assert.match(courses, /href="\/tournament-guide">‹ Tournament Guide/);
  assert.doesNotMatch(courseDetail, /TournamentGuideHero/);
});

test("page titles remain in content and no longer repeat inside the shared hero", async () => {
  const [hero, heroModel, guide, detail, css] = await Promise.all([
    source("app/tournament-guide/TournamentGuideHero.js"),
    source("lib/tournament-guide-hero.js"),
    source("app/tournament-guide/page.js"),
    source("app/tournament-guide/GuideDetailPage.js"),
    source("app/tournament-guide/tournament-guide.module.css"),
  ]);
  assert.doesNotMatch(hero, /Schedule|Courses|Rules & Formats|Dining|Local Guide|Important Contacts/);
  assert.doesNotMatch(guide, /className=\{styles\.guidePageHeading\}|<h1>Tournament Guide<\/h1>/);
  assert.match(guide, /<h2 id="guide-directory-title">Find what you need<\/h2>/);
  for (const title of ["Schedule", "Rules & Formats", "Dining"]) assert.match(detail, new RegExp(`<h1>${title.replace("&", "&")}<\\/h1>`));
  assert.doesNotMatch(guide, /\[\["Edition"/);
  assert.doesNotMatch(guide, /\["Dates"/);
  assert.match(heroModel, /formatTournamentDates\(/);
  assert.match(hero, /identity\.dates/);
  assert.match(css, /\.tournamentIdentityCopy p\{[^}]*text-transform:uppercase/);
});

test("implemented Guide modules use approved sheets while unfinished content remains placeholder-only", async () => {
  const [detail, sheets] = await Promise.all([source("app/tournament-guide/GuideDetailPage.js"), source("lib/google-sheets-data.js")]);
  assert.match(detail, /<Dining records=\{content\.dining\}/);
  assert.match(sheets, /dining: "Dining"/);
  assert.match(detail, /<LocalGuide records=\{content\.localGuide\}/);
  assert.match(detail, /<ImportantContacts records=\{content\.importantContacts\}/);
  assert.match(sheets, /localGuide: "Local Guide"/);
  assert.match(sheets, /importantContacts: "Important Contacts"/);
});

test("Guide preserves shared app chrome and ends naturally after quick access", async () => {
  const [page, css, schedule, rules] = await Promise.all([
    source("app/tournament-guide/page.js"), source("app/tournament-guide/tournament-guide.module.css"),
    source("app/TournamentSchedule.js"), source("app/rules/page.js"),
  ]);
  assert.match(page, /<Header \/>/);
  assert.match(page, /<Footer \/>/);
  assert.doesNotMatch(page, /Welcome|overviewItems|sectionDescription|className=\{styles\.overview\}/);
  assert.match(css, /\.directory/);
  assert.match(css, /padding:18px 0 92px/);
  assert.match(schedule, /\/tournament-guide\/schedule/);
  assert.match(rules, /\/tournament-guide\/rules/);
});

test("Guide schema diagnostics are header-only and Preview isolated", async () => {
  const route = await source("app/api/tournament-guide/schema/route.js");
  assert.match(route, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route, /status: 404/);
  assert.match(route, /modules: content\.diagnostics/);
  assert.doesNotMatch(route, /GOOGLE_SHEETS_ID|privateKey|service.account|cookie|token/i);
});

test("Rules & Formats follows golfer-first information architecture", async () => {
  const detail = await source("app/tournament-guide/GuideDetailPage.js");
  const orderedSections = [
    'id: "tournament"',
    'id: "local"',
    'id: "equipment"',
    'id: "practice"',
    'id: "shotgun"',
    'id: "general"',
  ];
  orderedSections.reduce((previous, section) => {
    const position = detail.indexOf(section);
    assert.ok(position > previous, `${section} should follow the preceding Rules section`);
    return position;
  }, -1);
  assert.ok(detail.lastIndexOf("styles.formatCollection") < detail.lastIndexOf("ruleSections.map"));
  for (const heading of ["Round Formats", "Competition Rules", "Local Rules", "Equipment", "Practice & Caddies", "Shotgun Mulligans", "General Rules"]) {
    assert.match(detail, new RegExp(heading.replace("&", "&")));
  }
});

test("Round Formats are expandable and summarize official workbook values", async () => {
  const [detail, css, summary] = await Promise.all([
    source("app/tournament-guide/GuideDetailPage.js"),
    source("app/tournament-guide/tournament-guide.module.css"),
    source("lib/rules-format-summary.js"),
  ]);
  assert.match(detail, /styles\.formatCard.*styles\.formatOverviewCard/);
  assert.match(detail, /"Points Available"/);
  assert.match(detail, /formatRuleSummary\(formatCode, sources, points\)/);
  assert.match(detail, /<ul>\{summary\.map/);
  assert.match(summary, /"Handicap Allocation"/);
  assert.match(summary, /"Scoring Format"/);
  assert.match(detail, /format\.Description \|\| configuration\?\.Description/);
  assert.match(detail, /formatRules\.map/);
  assert.match(detail, /rules\.map/);
  assert.match(css, /\.formatCard>summary/);
  assert.match(css, /\.formatCard>summary ul/);
  assert.match(css, /@media\(max-width:560px\).*\.formatCard>summary/);
});

test("Rule cards keep title and subtitle while Category remains grouping-only", async () => {
  const detail = await source("app/tournament-guide/GuideDetailPage.js");
  const ruleCard = detail.slice(detail.indexOf("function RuleCard"), detail.indexOf("function FormatCard"));
  assert.match(ruleCard, /rule\.Subcategory/);
  assert.match(ruleCard, /rule\.Title/);
  assert.match(ruleCard, /rule\.Body/);
  assert.match(ruleCard, /rule\["Effective Year"\]/);
  assert.match(ruleCard, /rule\.Important/);
  assert.doesNotMatch(ruleCard, /rule\.Category|categoryTitle|<summary><span>/);
  assert.match(detail, /const searchable = \[rule\.Category, rule\.Subcategory, rule\.Title\]/);
});

test("format summaries render only inside their expandable Round Format cards", async () => {
  const detail = await source("app/tournament-guide/GuideDetailPage.js");
  assert.match(detail, /styles\.formatCard.*styles\.formatOverviewCard/);
  assert.match(detail, /formatRuleSummary\(formatCode, sources, points\)/);
  assert.doesNotMatch(detail, /TournamentRuleSummary|tournamentRuleSummary/);
  assert.doesNotMatch(detail, /Front 9:|Back 9:|points available/);
});

test("format-specific rules are owned by Round Formats instead of repeated below", async () => {
  const [detail, ownership] = await Promise.all([
    source("app/tournament-guide/GuideDetailPage.js"),
    source("lib/tournament-guide-rules.js"),
  ]);
  assert.match(detail, /const presentation = rulesPresentationModel\(ruleBook\)/);
  assert.match(detail, /const remaining = presentation\.remaining/);
  assert.doesNotMatch(detail, /governingCategory/);
  assert.match(detail, /rules=\{presentation\.byFormat\[formatCode\] \|\| \[\]\}/);
  assert.match(ownership, /formats\.length === 1/);
  assert.match(ownership, /else remaining\.push\(rule\)/);
});

test("every non-format rule uses the same compact expandable card pattern", async () => {
  const [detail, css] = await Promise.all([
    source("app/tournament-guide/GuideDetailPage.js"),
    source("app/tournament-guide/tournament-guide.module.css"),
  ]);
  assert.match(detail, /function RuleCard/);
  assert.match(detail, /styles\.formatCard.*styles\.ruleCard/);
  assert.match(detail, /<RuleCard rule=\{rule\}/);
  assert.doesNotMatch(detail, /function RuleList|groupBy\(records/);
  assert.doesNotMatch(detail, /open=\{isTruthy\(rule\.Important\)\}/);
  assert.match(css, /\.ruleCards\{display:grid;gap:10px\}/);
  assert.match(css, /\.ruleCard>summary\{grid-template-columns:minmax\(0,1fr\) auto;min-height:88px/);
  assert.doesNotMatch(css, /\.ruleCard>summary>span/);
});

test("Shotgun Mulligans uses the tournament-tradition beer mug icon", async () => {
  const detail = await source("app/tournament-guide/GuideDetailPage.js");
  assert.match(detail, /id: "shotgun", icon: "🍺", title: "Shotgun Mulligans"/);
  assert.doesNotMatch(detail, /id: "shotgun", icon: "🎯"/);
});

test("Round Formats are collapsed by default without BB, SC, or SI labels", async () => {
  const [detail, css] = await Promise.all([
    source("app/tournament-guide/GuideDetailPage.js"),
    source("app/tournament-guide/tournament-guide.module.css"),
  ]);
  assert.match(detail, /<details className=\{`\$\{styles\.formatCard\} \$\{styles\.formatOverviewCard\}`\}>/);
  assert.doesNotMatch(detail, /styles\.formatOverviewCard\}`\} open/);
  assert.doesNotMatch(detail, /<span>\{formatCode\}<\/span>/);
  assert.match(detail, /formatRuleHeading\(rule\.Title\)/);
  assert.match(css, /\.formatOverviewCard>summary\{grid-template-columns:minmax\(0,1fr\) auto\}/);
  assert.match(css, /\.formatOverviewCard:not\(\[open\]\)>summary\{min-height:0;padding:15px 18px\}/);
  const ruleCardSource = detail.slice(detail.indexOf("function RuleCard"), detail.indexOf("function FormatCard"));
  assert.doesNotMatch(ruleCardSource, /<details[^>]*\sopen/);
});
