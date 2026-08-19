import Link from "next/link";
import { Header, Footer } from "../components";
import { formatRuleHeading, formatRuleSummary } from "../../lib/rules-format-summary";
import { getFormatName } from "../../lib/stats";
import { isTruthy, paragraphs } from "../../lib/tournament-guide";
import { resolveTournamentGuideContent } from "./resolveGuideContent";
import ScheduleItinerary from "./ScheduleItinerary";
import DiningItinerary from "./DiningItinerary";
import LocalGuide from "./LocalGuide";
import ImportantContacts from "./ImportantContacts";
import { GUIDE_FORMATS, guideFormatCode, rulesCurrentContextParity, rulesPresentationModel } from "../../lib/tournament-guide-rules";
import styles from "./tournament-guide.module.css";

const ruleSections = [
  { id: "tournament", icon: "🏆", title: "Competition Rules", matches: /tournament|handicap|scoring/i },
  { id: "local", icon: "📍", title: "Local Rules", matches: /local/i },
  { id: "equipment", icon: "📏", title: "Equipment", matches: /equipment|device|distance|rangefinder/i },
  { id: "practice", icon: "👨‍🦯", title: "Practice & Caddies", matches: /practice|cadd/i },
  { id: "shotgun", icon: "🍺", title: "Shotgun Mulligans", matches: /shotgun|mulligan/i },
  { id: "general", icon: "📋", title: "General Rules", matches: /general|competition/i },
];
const code = guideFormatCode;

function Text({ value }) { return paragraphs(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>); }
function Empty({ title }) { return <div className={styles.empty}><span>Tournament Guide</span><h2>{title}</h2><p>Published tournament information will appear here when available.</p></div>; }

function Schedule({ tournament, records, description, rounds, courses, tournamentRules, formatRules, initialNow }) {
  if (!records.length) return <Empty title="Schedule" />;
  return <section className={`${styles.focusedContent} ${styles.scheduleExperience}`}><header><p className={styles.eyebrow}>Tournament Week</p><h1>Schedule</h1><Text value={description} /></header><ScheduleItinerary records={records} tournament={tournament} rounds={rounds} courses={courses} tournamentRules={tournamentRules} formatRules={formatRules} initialNow={initialNow} /></section>;
}

function Dining({ records }) {
  if (!records.length) return <Empty title="Dining" />;
  return <section className={`${styles.focusedContent} ${styles.scheduleExperience}`}><header><p className={styles.eyebrow}>Tournament Dining</p><h1>Dining</h1><p>Your restaurant itinerary for tournament weekend.</p></header><DiningItinerary records={records} /></section>;
}

function RuleCard({ rule }) {
  const subtitle = rule.Subcategory && rule.Subcategory !== rule.Title ? rule.Subcategory : "";
  const title = rule.Title || subtitle || "Rule";
  return <details className={`${styles.formatCard} ${styles.ruleCard} ${isTruthy(rule.Important) ? styles.ruleCardImportant : ""}`}><summary><div><h3>{title}</h3>{subtitle && subtitle !== title ? <p>{subtitle}</p> : null}</div><b aria-hidden="true">⌄</b></summary><div className={styles.formatDetails}><Text value={rule.Body} />{rule["Effective Year"] ? <small>Effective {rule["Effective Year"]}</small> : null}</div></details>;
}
function FormatCard({ format, configuration, rules }) {
  const formatCode = code(format["Format ID"] || format.Format);
  const description = format.Description || configuration?.Description;
  const formatRules = [format.Rules, configuration?.Rules].filter(Boolean);
  const sources = [configuration, format, ...rules].filter(Boolean);
  const points = configuration?.["Points Available"];
  const summary = formatRuleSummary(formatCode, sources, points);
  return <details className={`${styles.formatCard} ${styles.formatOverviewCard}`}><summary><div><h3>{format.Name || getFormatName(formatCode)}</h3>{summary.length ? <ul>{summary.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div><b aria-hidden="true">⌄</b></summary><div className={styles.formatDetails}>{description ? <Text value={description} /> : null}{formatRules.map((value, index) => <Text value={value} key={`${formatCode}-${index}`} />)}{rules.length ? <div className={styles.formatRules}>{rules.map((rule) => <div key={rule["Rule ID"]}><b>{formatRuleHeading(rule.Title)}</b><Text value={rule.Body} /></div>)}</div> : null}</div></details>;
}

function RuleSection({ id, icon, title, records }) {
  if (!records.length) return null;
  return <section className={styles.ruleCollection}><h2><span aria-hidden="true">{icon}</span>{title}</h2><div className={styles.ruleCards}>{records.map((rule) => <RuleCard rule={rule} key={rule["Rule ID"]} />)}</div></section>;
}

function Rules({ ruleBook, tournamentRules, rounds, liveRounds }) {
  const presentation = rulesPresentationModel(ruleBook);
  const remaining = presentation.remaining;
  const sectionRecords = Object.fromEntries(ruleSections.map((section) => [section.id, []]));
  remaining.forEach((rule) => {
    const searchable = [rule.Category, rule.Subcategory, rule.Title].filter(Boolean).join(" ");
    const section = ruleSections.slice(1).find((candidate) => candidate.matches.test(searchable))
      || ruleSections[0].matches.test(searchable) && ruleSections[0]
      || ruleSections.at(-1);
    sectionRecords[section.id].push(rule);
  });
  const formats = GUIDE_FORMATS.map((format) => rounds.find((row) => code(row["Format ID"] || row.Format) === format) || { "Format ID": format, Name: getFormatName(format) });
  const parity = rulesCurrentContextParity({ liveRounds, tournamentRules, formats: rounds });
  if (parity.issues.length) console.error("Tournament Guide rules/current scoring parity defect", parity.issues);
  return <section className={`${styles.focusedContent} ${styles.rulesExperience}`}><header><p className={styles.eyebrow}>Official Competition</p><h1>Rules & Formats</h1><p>Official tournament rules and the format for every round, combined from the existing workbook.</p></header>{parity.issues.length ? <aside className={styles.rulesParityWarning} role="alert"><strong>Current format configuration needs review.</strong><span>The Guide has detected a mismatch between published Rules and the current playing configuration.</span></aside> : null}<section className={styles.formatCollection}><header><h2><span aria-hidden="true">⛳</span>Round Formats</h2><p>Best Ball, Scramble & Singles</p></header><div>{formats.map((format) => { const formatCode = code(format["Format ID"] || format.Format); return <FormatCard format={format} configuration={tournamentRules.find((rule) => code(rule.Format) === formatCode)} rules={presentation.byFormat[formatCode] || []} key={formatCode} />; })}</div></section>{ruleSections.map((section) => <RuleSection {...section} records={sectionRecords[section.id]} key={section.id} />)}</section>;
}

function Placeholder({ title, detail }) { return <section className={styles.placeholder}><span>Tournament Guide</span><h1>{title}</h1><p>{detail}</p></section>; }

export default async function GuideDetailPage({ section }) {
  const content = await resolveTournamentGuideContent();
  const { tournament, schedule: itinerary, ruleBook } = content;
  const descriptions = Object.fromEntries(content.overview.map((item) => [item["Section Slug"], item.Description]));
  return <main className={styles.guideDetailPage}><Header /><div className={styles.shell}><Link className={styles.backToGuide} href="/tournament-guide">‹ Tournament Guide</Link>{section === "schedule" ? <Schedule tournament={content.liveTournament} records={itinerary} description={descriptions.itinerary} rounds={content.liveRounds} courses={content.courses} tournamentRules={content.tournamentRules} formatRules={content.rounds} initialNow={content.timelineNow} /> : null}{section === "rules" ? <Rules ruleBook={ruleBook} tournamentRules={content.tournamentRules} rounds={content.rounds} liveRounds={content.liveRounds} /> : null}{section === "dining" ? <Dining records={content.dining} /> : null}{section === "getting-around" ? <LocalGuide records={content.localGuide} /> : null}{section === "contacts" ? <ImportantContacts records={content.importantContacts} /> : null}</div><Footer /></main>;
}
