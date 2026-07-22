export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header, Footer } from "../components";
import { loadPredictionDiagnostics } from "../../lib/prediction-data";
import {
  currentTournamentYear,
  getCourseOptions,
  getFormatCourse,
  getTeamContext,
} from "../../lib/tournament-context";
import { pick } from "../../lib/prediction-engine";
import styles from "./data-health.module.css";
import { careerYearDataIssue } from "../../lib/player-career";

export const metadata = { title: "Data Health | Sandbagger Invitational" };

const clean = (value) => String(value ?? "").trim();
const REQUIRED_COLUMNS = {
  players: [["Player ID", "ID"], ["Display Name", "Player Name", "Name", "First"]],
  matches: [["Year"], ["Format"], ["Team 1 Player 1"], ["Team 2 Player 1"]],
  teamNames: [["Year"], ["Team Side"], ["Team Name", "Team Names", "Name"]],
  liveTournaments: [["Year"]],
  liveRoundHandicaps: [["Year"], ["Player ID"]],
  tournamentRules: [["Year"], ["Format"]],
  courses: [["Year"], ["Course ID"], ["Course Name", "Course"], ["Format"]],
  handicaps: [["Year"], ["Player ID"], ["Team Side"], ["Tournament Handicap"]],
  scorecards: [["Course ID", "Course Name", "Course"], ["Tee", "Tee Name"], ["Course Rating", "Rating"], ["Slope Rating", "Slope"], ["Par"]],
  holes: [["Course ID", "Course Name", "Course"], ["Tee", "Tee Name"], ["Hole", "Hole Number"], ["Stroke Index", "Handicap", "Index"]],
  settings: [["Setting"], ["Value"]],
};

function hasColumn(headers, choices) {
  return choices.some((choice) => headers.includes(choice));
}

function missingColumns(key, headers) {
  return (REQUIRED_COLUMNS[key] || [])
    .filter((choices) => !hasColumn(headers, choices))
    .map((choices) => choices.join(" / "));
}

function duplicateValues(rows, columns) {
  const counts = new Map();
  for (const row of rows) {
    const value = columns.map((column) => clean(row[column])).find(Boolean);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function formatLabel(code) {
  return code === "BB" ? "Best Ball" : code === "SC" ? "Scramble" : "Singles";
}

function appearanceYearsByPlayer(matches) {
  const years = new Map();
  for (const match of matches) {
    const year = Number(match.Year);
    if (!Number.isFinite(year)) continue;
    for (const field of [
      "Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2",
    ]) {
      const playerId = clean(match[field]);
      if (!playerId) continue;
      if (!years.has(playerId)) years.set(playerId, []);
      years.get(playerId).push(year);
    }
  }
  return years;
}

export default async function DataHealthPage({ searchParams }) {
  const query = await searchParams;
  const embedded = query?.embedded === "1";
  let diagnostics;
  let fatalError = "";
  try {
    diagnostics = await loadPredictionDiagnostics();
  } catch (error) {
    fatalError = error.message || "Unable to inspect Google Sheets data.";
  }

  const sheets = diagnostics
    ? Object.fromEntries(Object.entries(diagnostics.sheets).map(([key, item]) => [key, item.rows]))
    : {};
  const year = diagnostics ? currentTournamentYear(sheets) : null;
  const teams = diagnostics ? getTeamContext(sheets, year) : null;
  const formats = diagnostics
    ? ["BB", "SC", "SI"].map((format) => {
        const course = getFormatCourse(sheets, year, format);
        const scorecards = getCourseOptions(sheets, course);
        return {
          format,
          courseId: clean(pick(course, "Course ID")),
          courseName: clean(pick(course, "Course Name", "Course")),
          tees: scorecards.map((row) => clean(pick(row, "Tee", "Tee Name"))).filter(Boolean),
        };
      })
    : [];

  const players = diagnostics?.sheets.players?.rows || [];
  const handicaps = diagnostics?.sheets.handicaps?.rows || [];
  const matches = diagnostics?.sheets.matches?.rows || [];
  const appearanceYears = appearanceYearsByPlayer(matches);
  const careerYearIssues = players
    .map((player) => careerYearDataIssue(player, appearanceYears.get(clean(player["Player ID"] || player.ID)) || []))
    .filter(Boolean);
  const playerDuplicates = duplicateValues(players, ["Player ID", "ID"]);
  const handicapKeys = new Map();
  for (const row of handicaps) {
    const key = `${clean(row.Year)}|${clean(row["Player ID"])}`;
    if (key !== "|") handicapKeys.set(key, (handicapKeys.get(key) || 0) + 1);
  }
  const handicapDuplicates = [...handicapKeys.entries()].filter(([, count]) => count > 1);

  const sheetItems = diagnostics ? Object.values(diagnostics.sheets) : [];
  const healthCounts = sheetItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <main>
      {!embedded ? <Header /> : null}
      <section className={styles.hero}>
        <p>Admin Diagnostics</p>
        <h1>Data Health</h1>
        <span>See exactly what the War Room receives from Google Sheets.</span>
      </section>

      <section className={styles.shell}>
        {fatalError ? <div className={styles.fatal}>{fatalError}</div> : null}
        {diagnostics ? (
          <>
            <div className={styles.summaryGrid}>
              <div><strong>{healthCounts.healthy || 0}</strong><span>Healthy sheets</span></div>
              <div><strong>{healthCounts.warning || 0}</strong><span>Warnings</span></div>
              <div><strong>{healthCounts.error || 0}</strong><span>Errors</span></div>
              <div><strong>{year || "—"}</strong><span>Current year</span></div>
            </div>

            <div className={styles.timestamp}>
              Last checked: {new Date(diagnostics.checkedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT · Every visit performs a fresh check.
            </div>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p>Google Sheets</p><h2>Source status</h2></div>
                <a href={`https://docs.google.com/spreadsheets/d/${diagnostics.spreadsheetId}/edit`} target="_blank" rel="noreferrer">Open workbook ↗</a>
              </div>
              <div className={styles.sheetList}>
                {sheetItems.map((item) => {
                  const missing = missingColumns(item.key, item.headers);
                  const effectiveStatus = missing.length ? "error" : item.status;
                  return (
                    <details className={styles.sheetRow} key={item.key}>
                      <summary>
                        <i data-status={effectiveStatus} />
                        <div><strong>{item.label}</strong><span>{item.matchedName ? `Loaded as “${item.matchedName}”` : "No matching tab loaded"}</span></div>
                        <b>{item.rowCount} rows</b>
                      </summary>
                      <div className={styles.sheetDetails}>
                        <p><strong>Required:</strong> {item.required ? "Yes" : "No"}</p>
                        <p><strong>Columns received:</strong> {item.headers.length ? item.headers.join(", ") : "None"}</p>
                        {missing.length ? <p className={styles.problem}><strong>Missing required columns:</strong> {missing.join(", ")}</p> : null}
                        <p><strong>Aliases accepted:</strong> {item.aliases.join(" or ")}</p>
                        <p><strong>Loaded by:</strong> {item.source || "Not loaded"}{item.gid ? ` · gid ${item.gid}` : ""}</p>
                        <div className={styles.attempts}>
                          {item.attempts.map((attempt, index) => (
                            <div key={`${attempt.source}-${attempt.value}-${index}`} data-ok={attempt.ok ? "true" : "false"}>
                              {attempt.ok ? "✓" : "×"} {attempt.source}: {attempt.value} {attempt.ok ? `(${attempt.rows} rows)` : `— ${attempt.error}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p>War Room</p><h2>Current tournament joins</h2></div></div>
              <div className={styles.contextGrid}>
                <div className={styles.contextBlock}>
                  <span>Team 1</span><strong>{teams?.team1.name || "Not found"}</strong><p>{teams?.team1.players.length || 0} roster players</p>
                </div>
                <div className={styles.contextBlock}>
                  <span>Team 2</span><strong>{teams?.team2.name || "Not found"}</strong><p>{teams?.team2.players.length || 0} roster players</p>
                </div>
              </div>
              <div className={styles.formatList}>
                {formats.map((item) => (
                  <div key={item.format}>
                    <span>{formatLabel(item.format)}</span>
                    <strong>{item.courseName || "No course assigned"}</strong>
                    <p>{item.courseId || "No Course ID"}</p>
                    <em data-ok={item.tees.length ? "true" : "false"}>{item.tees.length ? `Tees: ${item.tees.join(", ")}` : "No matching scorecard tees"}</em>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}><div><p>Integrity Checks</p><h2>Potential data problems</h2></div></div>
              <div className={styles.checkList}>
                <div data-ok={playerDuplicates.length ? "false" : "true"}>{playerDuplicates.length ? `Duplicate Player IDs: ${playerDuplicates.map(([id]) => id).join(", ")}` : "No duplicate Player IDs"}</div>
                <div data-ok={handicapDuplicates.length ? "false" : "true"}>{handicapDuplicates.length ? `Duplicate Year + Player handicap rows: ${handicapDuplicates.map(([key]) => key.replace("|", " / ")).join(", ")}` : "No duplicate Year + Player handicap rows"}</div>
                <div data-ok={teams?.team1.players.length && teams?.team2.players.length ? "true" : "false"}>Current-year team rosters {teams?.team1.players.length && teams?.team2.players.length ? "loaded" : "are incomplete"}</div>
                <div data-ok={formats.every((item) => item.tees.length) ? "true" : "false"}>All format courses {formats.every((item) => item.tees.length) ? "match at least one scorecard tee" : "do not yet match scorecard tees"}</div>
                <div data-ok={careerYearIssues.length ? "false" : "true"}>
                  {careerYearIssues.length
                    ? `Missing player career start: ${careerYearIssues.map((issue) => issue.playerName).join(", ")}`
                    : "Every player has a valid career start year or recorded appearance"}
                </div>
              </div>
            </section>

            <div className={styles.actions}>
              <Link href="/war-room">Open War Room</Link>
              <Link href="/data-health">Run checks again</Link>
            </div>
          </>
        ) : null}
      </section>
      {!embedded ? <Footer /> : null}
    </main>
  );
}
