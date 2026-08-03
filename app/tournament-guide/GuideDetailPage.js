import Link from "next/link";
import { Header, Footer } from "../components";
import AssetImage from "../AssetImage";
import { tournamentLogo } from "../../lib/asset-paths";
import { loadTournamentGuideSheets } from "../../lib/google-sheets-data";
import { getFormatName, getRoundFormats, getTournamentRules, getTournaments, refreshHistoricalData } from "../../lib/stats";
import { groupBy, isTruthy, paragraphs, publicGuideRecords } from "../../lib/tournament-guide";
import styles from "./tournament-guide.module.css";

const titles = { schedule: "Schedule", rules: "Rules & Formats", dining: "Dining", "getting-around": "Getting Around", contacts: "Important Contacts" };
const formatTerms = { BB: ["best ball", "four-ball", "four ball"], SC: ["scramble"], SI: ["singles", "single match"] };
const text = (record) => Object.values(record || {}).join(" ").toLowerCase();
const code = (value) => String(value || "").trim().toUpperCase();
const roundNumber = (value) => { const parsed = Number(String(value ?? "").replace(/\D/g, "")); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; };
const timeRange = (event) => [event["Start Time"], event["End Time"]].filter(Boolean).join(" – ");

function Text({ value }) { return paragraphs(value).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>); }
function Empty({ title }) { return <div className={styles.empty}><span>Tournament Guide</span><h2>{title}</h2><p>Published tournament information will appear here when available.</p></div>; }

function Schedule({ tournament, records, description }) {
  if (!records.length) return <Empty title="Schedule" />;
  return <section className={styles.focusedContent}><header><p className={styles.eyebrow}>Tournament Week</p><h1>Schedule</h1><Text value={description} /></header><div className={styles.timeline}>{Object.entries(groupBy(records, "Day Label")).map(([day, events]) => <section className={styles.day} key={day}><h3>{day}</h3>{events.map((event) => {
    const eventRound = roundNumber(event["Round ID"]);
    const round = eventRound ? tournament.courses.find((course) => roundNumber(course.Round) === eventRound) : null;
    const venue = round?.Course || event.Location;
    const meta = round ? [`Round ${roundNumber(round.Round)}`, getFormatName(round.Format), round["Tee Played"] ? `${round["Tee Played"]} Tees` : ""].filter(Boolean) : [];
    return <article className={`${styles.event} ${isTruthy(event.Featured) ? styles.featured : ""}`} key={event["Event ID"]}><div className={styles.eventTime}>{timeRange(event) || event["Event Date"]}</div><div><span>{event["Event Type"]}</span><h4>{event.Title}</h4>{event.Subtitle ? <strong>{event.Subtitle}</strong> : null}{venue ? <p className={styles.location}>{venue}</p> : null}{meta.length ? <p className={styles.roundMeta}>{meta.join(" • ")}</p> : null}<Text value={event.Details} /></div></article>;
  })}</section>)}</div></section>;
}

function RuleList({ records }) { return <div className={styles.rules}>{Object.entries(groupBy(records, "Category")).map(([category, rules]) => <section key={category}><h3>{category}</h3>{rules.map((rule) => <details className={isTruthy(rule.Important) ? styles.important : ""} key={rule["Rule ID"]} open={isTruthy(rule.Important)}><summary><span>{rule.Subcategory || "Rule"}</span>{rule.Title}</summary><div><Text value={rule.Body} />{rule["Effective Year"] ? <small>Effective {rule["Effective Year"]}</small> : null}</div></details>)}</section>)}</div>; }
function TournamentRuleSummary({ records }) { return <div className={styles.tournamentRuleSummary}>{records.map((rule) => { const format = code(rule.Format); const segments = [rule["Front 9 Used"] ? `Front 9: ${rule["Front 9 Points"]} pt` : "", rule["Back 9 Used"] ? `Back 9: ${rule["Back 9 Points"]} pt` : "", rule["Overall Used"] ? `Overall: ${rule["Overall Points"]} pt` : ""].filter(Boolean); return <article key={`${rule.Year}-${rule.Round}-${format}`}><span>{rule.Round}</span><h3>{getFormatName(format)}</h3>{rule["Points Available"] !== null && rule["Points Available"] !== undefined ? <strong>{rule["Points Available"]} points available</strong> : null}{segments.length ? <p>{segments.join(" • ")}</p> : null}</article>; })}</div>; }
function FormatCard({ format, configuration, rules }) { const formatCode = code(format["Format ID"] || format.Format); const description = format.Description || configuration?.Description; const formatRules = [format.Rules, configuration?.Rules].filter(Boolean); return <article className={styles.formatCard}><header><span>{formatCode}</span><h3>{format.Name || getFormatName(formatCode)}</h3>{configuration?.["Points Available"] !== null && configuration?.["Points Available"] !== undefined ? <strong>{configuration["Points Available"]} points available</strong> : null}</header>{description ? <Text value={description} /> : null}{formatRules.map((value, index) => <Text value={value} key={`${formatCode}-${index}`} />)}{rules.length ? <div className={styles.formatRules}>{rules.map((rule) => <div key={rule["Rule ID"]}><b>{rule.Title}</b><Text value={rule.Body} /></div>)}</div> : null}</article>; }

function Rules({ ruleBook, tournamentRules, rounds }) {
  const forFormat = (format) => ruleBook.filter((rule) => formatTerms[format].some((term) => text(rule).includes(term)));
  const formatIds = new Set(Object.keys(formatTerms).flatMap((format) => forFormat(format).map((rule) => rule["Rule ID"])));
  const remaining = ruleBook.filter((rule) => !formatIds.has(rule["Rule ID"]));
  const general = remaining.filter((rule) => /general/i.test(String(rule.Category || "")));
  const tournament = remaining.filter((rule) => !general.includes(rule));
  const formats = ["BB", "SC", "SI"].map((format) => rounds.find((row) => code(row["Format ID"] || row.Format) === format) || { "Format ID": format, Name: getFormatName(format) });
  return <section className={styles.focusedContent}><header><p className={styles.eyebrow}>Official Competition</p><h1>Rules & Formats</h1><p>Official tournament rules and the format for every round, combined from the existing workbook.</p></header><section className={styles.ruleCollection}><h2>General Rules</h2>{general.length ? <RuleList records={general} /> : <p className={styles.supporting}>No separate general rules are published for this tournament.</p>}</section><section className={styles.ruleCollection}><h2>Tournament Rules</h2>{tournament.length ? <RuleList records={tournament} /> : null}{tournamentRules.length ? <TournamentRuleSummary records={tournamentRules} /> : <p className={styles.supporting}>No tournament-specific scoring rules are configured for this year.</p>}</section><section className={styles.formatCollection}><header><p className={styles.eyebrow}>Round Formats</p><h2>Best Ball, Scramble & Singles</h2></header><div>{formats.map((format) => { const formatCode = code(format["Format ID"] || format.Format); return <FormatCard format={format} configuration={tournamentRules.find((rule) => code(rule.Format) === formatCode)} rules={forFormat(formatCode)} key={formatCode} />; })}</div></section></section>;
}

function Placeholder({ title, detail }) { return <section className={styles.placeholder}><span>Tournament Guide</span><h1>{title}</h1><p>{detail}</p></section>; }

export default async function GuideDetailPage({ section }) {
  await refreshHistoricalData();
  const tournament = getTournaments()[0];
  if (!tournament) throw new Error("Tournament Guide could not resolve the current tournament.");
  const sheets = await loadTournamentGuideSheets();
  const itinerary = publicGuideRecords(sheets.itinerary, tournament);
  const ruleBook = publicGuideRecords(sheets.rules, tournament);
  const descriptions = Object.fromEntries(publicGuideRecords(sheets.sections, tournament).map((item) => [item["Section Slug"], item.Description]));
  const title = titles[section];
  return <main><Header /><section className={`${styles.hero} ${styles.heroCompact}`}><div><p>Tournament Guide</p><h1>{title}</h1><strong>{tournament.editionTitle || `${tournament.year} Sandbagger Invitational`}</strong><span>{[tournament.Location, tournament.Dates || tournament.Date].filter(Boolean).join(" • ")}</span></div><div className={styles.logoPlate}><div className={styles.logoInner}><AssetImage src={tournamentLogo(tournament.logoFileName)} alt={`${tournament.year} tournament logo`} fallback={String(tournament.year)} className={styles.logo} fallbackClassName={styles.logoFallback} /></div></div></section><div className={styles.shell}><Link className={styles.backToGuide} href="/tournament-guide">‹ Tournament Guide</Link>{section === "schedule" ? <Schedule tournament={tournament} records={itinerary} description={descriptions.itinerary} /> : null}{section === "rules" ? <Rules ruleBook={ruleBook} tournamentRules={getTournamentRules(tournament.year)} rounds={getRoundFormats()} /> : null}{section === "dining" ? <Placeholder title="Dining" detail="Tournament dining information will be available here once its shared content structure is finalized." /> : null}{section === "getting-around" ? <Placeholder title="Getting Around" detail="Tournament transportation and arrival information will be available here once its shared content structure is finalized." /> : null}{section === "contacts" ? <Placeholder title="Important Contacts" detail="Tournament contact information will be available here once its shared content structure is finalized." /> : null}</div><Footer /></main>;
}
