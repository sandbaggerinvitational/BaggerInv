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
import { isFinalizedMatch, isOfficialMatchResult } from "../../lib/live-tournament";
import {
  isValidTournamentId,
  recordBelongsToTournament,
  tournamentId,
  tournamentYear,
} from "../../lib/tournament-identifiers";

export const metadata = { title: "Data Health | Sandbagger Invitational" };

const clean = (value) => String(value ?? "").trim();
const REQUIRED_COLUMNS = {
  tournaments: [["Year", "Tournament ID"]],
  players: [["Player ID", "ID"], ["Display Name", "Player Name", "Name", "First"]],
  matches: [["Year"], ["Format"], ["Team 1 Player 1"], ["Team 2 Player 1"]],
  liveMatches: [["Match ID"], ["Year", "Tournament ID"], ["Round"], ["Match Status"]],
  teamNames: [["Year", "Tournament ID"], ["Team Side"], ["Team ID"], ["Team Name", "Team Names", "Name"], ["Captain Player ID", "Captain"]],
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
  const liveMatches = diagnostics?.sheets.liveMatches?.rows || [];
  const teamNames = diagnostics?.sheets.teamNames?.rows || [];
  const courses = diagnostics?.sheets.courses?.rows || [];
  const tournaments = diagnostics?.sheets.tournaments?.rows || [];
  const liveTournaments = diagnostics?.sheets.liveTournaments?.rows || [];
  const tournamentRules = diagnostics?.sheets.tournamentRules?.rows || [];
  const selectedTournament = tournaments.find((record) => tournamentYear(record) === Number(year)) || null;
  const selectedTournamentId = selectedTournament ? tournamentId(selectedTournament) : "";
  const explicitTournamentId = (record) => clean(record["Tournament ID"] || record.Year);
  const directTournamentIds = tournaments.map(explicitTournamentId).filter(Boolean);
  const knownTournamentIds = new Set(tournaments.map((record) => tournamentId(record)).filter(Boolean));
  const missingTournamentIds = tournaments.filter((record) => !explicitTournamentId(record));
  const zeroTournamentIds = tournaments.filter((record) => explicitTournamentId(record) === "0");
  const duplicateTournamentIds = [...directTournamentIds.reduce((counts, id) => {
    counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, new Map())].filter(([, count]) => count > 1);
  const requestedTournamentId = clean(query?.tournament);
  const invalidSelector = Boolean(requestedTournamentId) && (
    !isValidTournamentId(requestedTournamentId) || !knownTournamentIds.has(requestedTournamentId)
  );
  const unknownMatchReferences = [...matches, ...liveMatches].filter((record) => {
    const reference = explicitTournamentId(record);
    return reference && !knownTournamentIds.has(reference);
  });
  const tournamentMatches = selectedTournamentId
    ? matches.filter((record) => recordBelongsToTournament(record, selectedTournamentId, year))
    : [];
  const expectedRoundCounts = tournamentMatches.reduce((counts, match) => {
    const round = Number(match.Round);
    if (Number.isFinite(round)) counts.set(round, (counts.get(round) || 0) + 1);
    return counts;
  }, new Map());
  const definedRounds = [...new Set(tournamentRules
    .filter((record) => !year || String(record.Year) === String(year))
    .map((record) => Number(record.Round))
    .filter(Number.isFinite))];
  const zeroExpectedRounds = definedRounds.filter((round) => !expectedRoundCounts.get(round));
  const finalizedWithoutPoints = tournamentMatches.filter(
    (match) => isFinalizedMatch(match) && !isOfficialMatchResult(match)
  );
  const officialMatches = tournamentMatches.filter(isOfficialMatchResult);
  const finalizedScore = officialMatches.reduce((score, match) => ({
    teamOne: score.teamOne + (Number(match["Team 1 Points"]) || 0),
    teamTwo: score.teamTwo + (Number(match["Team 2 Points"]) || 0),
  }), { teamOne: 0, teamTwo: 0 });
  const publicTournament = liveTournaments.find((record) =>
    selectedTournamentId && recordBelongsToTournament(record, selectedTournamentId, year)
  );
  const publicScore = {
    teamOne: Number(publicTournament?.["Team 1 Score"]) || 0,
    teamTwo: Number(publicTournament?.["Team 2 Score"]) || 0,
  };
  const publicScoreMismatch = Boolean(publicTournament) && (
    publicScore.teamOne !== finalizedScore.teamOne || publicScore.teamTwo !== finalizedScore.teamTwo
  );
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
  const playerIds = new Set(players.map((player) => clean(player["Player ID"] || player.ID)).filter(Boolean));
  const captainIdFor = (team) => clean(team["Captain Player ID"] || team["Captain ID"] || team.Captain);
  const historicalTeamsMissingCaptain = teamNames.filter(
    (team) => !captainIdFor(team) && !clean(team["Captain Name"])
  );
  const captainIdsNotFound = teamNames.filter(
    (team) => captainIdFor(team) && !playerIds.has(captainIdFor(team))
  );
  const captainsMissingFromRoster = teamNames.filter((team) => {
    const captainId = captainIdFor(team);
    if (!captainId || !playerIds.has(captainId)) return false;
    return !handicaps.some((row) =>
      Number(row.Year) === Number(team.Year) &&
      clean(row["Team Side"]) === clean(team["Team Side"]) &&
      clean(row["Player ID"]) === captainId
    );
  });
  const captainMappingsByTeam = new Map();
  for (const team of teamNames) {
    const teamKey = `${clean(team["Tournament ID"] || team.Year)}|${clean(team["Team ID"] || team["Team Side"])}`;
    const captainId = captainIdFor(team);
    if (!captainId || teamKey === "|") continue;
    if (!captainMappingsByTeam.has(teamKey)) captainMappingsByTeam.set(teamKey, new Set());
    captainMappingsByTeam.get(teamKey).add(captainId);
  }
  const multipleCaptainMappings = [...captainMappingsByTeam.entries()].filter(([, ids]) => ids.size > 1);
  const historicalMatchesMissingTeamIds = matches.filter((match) =>
    !clean(match["Team 1 Team ID"] || match["Team 1 ID"]) ||
    !clean(match["Team 2 Team ID"] || match["Team 2 ID"])
  );
  const historicalMatchesMissingCourse = matches.filter((match) => {
    const matchCourseId = clean(match["Course ID"]);
    return !courses.some((course) => {
      const sameYear = Number(course.Year) === Number(match.Year);
      if (!sameYear) return false;
      if (matchCourseId) return clean(course["Course ID"]) === matchCourseId;
      return Number(clean(course.Round).replace(/\D/g, "")) === Number(match.Round);
    });
  });
  const historicalScramblesWithIndividualStrokes = matches.filter((match) =>
    clean(match.Format).toUpperCase() === "SC" &&
    ["Team 1 Player 1 Stroke", "Team 1 Player 2 Stroke", "Team 2 Player 1 Stroke", "Team 2 Player 2 Stroke"]
      .some((field) => clean(match[field]) && Number(match[field]) !== 0)
  );

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
                <div data-ok={invalidSelector ? "false" : "true"}>
                  {invalidSelector ? `Invalid tournament selector value: ${requestedTournamentId}` : "Tournament selector resolves to a valid tournament"}
                  {invalidSelector ? <Link href="/admin?tab=tournament"> Fix in Tournament →</Link> : null}
                </div>
                <div data-ok={zeroTournamentIds.length ? "false" : "true"}>
                  {zeroTournamentIds.length ? "Tournament ID 0 detected" : "No Tournament ID 0 values detected"}
                  {zeroTournamentIds.length ? <Link href="/admin?tab=tournament"> Fix in Tournament →</Link> : null}
                </div>
                <div data-ok={missingTournamentIds.length ? "false" : "true"}>
                  {missingTournamentIds.length
                    ? `Missing Tournament ID or Year: ${missingTournamentIds.map((record) => record.Annual || record["Tournament Name"] || "Unnamed tournament").join(", ")}`
                    : "Every tournament has a stable identifier"}
                  {missingTournamentIds.length ? <Link href={`/admin?tab=tournament${selectedTournamentId ? `&tournament=${encodeURIComponent(selectedTournamentId)}` : ""}`}> Fix in Tournament →</Link> : null}
                </div>
                <div data-ok={duplicateTournamentIds.length ? "false" : "true"}>
                  {duplicateTournamentIds.length ? `Duplicate Tournament IDs: ${duplicateTournamentIds.map(([id]) => id).join(", ")}` : "No duplicate Tournament IDs"}
                  {duplicateTournamentIds.length ? <Link href="/admin?tab=tournament"> Fix in Tournament →</Link> : null}
                </div>
                <div data-ok={unknownMatchReferences.length ? "false" : "true"}>
                  {unknownMatchReferences.length
                    ? `${unknownMatchReferences.length} match rows reference an unknown Tournament ID`
                    : "All match rows reference a known tournament"}
                  {unknownMatchReferences.length ? <Link href={`/admin?tab=matches${selectedTournamentId ? `&tournament=${encodeURIComponent(selectedTournamentId)}` : ""}`}> Fix in Matches →</Link> : null}
                </div>
                <div data-ok={zeroExpectedRounds.length ? "false" : "true"}>
                  {zeroExpectedRounds.length ? `Rounds with zero expected matches: ${zeroExpectedRounds.join(", ")}` : "Every defined round has configured matches"}
                  {zeroExpectedRounds.length ? <Link href={`/admin?tab=matches${selectedTournamentId ? `&tournament=${encodeURIComponent(selectedTournamentId)}` : ""}`}> Fix in Matches →</Link> : null}
                </div>
                <div data-ok={finalizedWithoutPoints.length ? "false" : "true"}>
                  {finalizedWithoutPoints.length
                    ? `Finalized matches missing valid points: ${finalizedWithoutPoints.map((match) => match["Match ID"] || "Unknown match").join(", ")}`
                    : "Every finalized match has a valid point total"}
                  {finalizedWithoutPoints.length ? <Link href={`/admin?tab=live-scoring${selectedTournamentId ? `&tournament=${encodeURIComponent(selectedTournamentId)}` : ""}`}> Fix in Live Scoring →</Link> : null}
                </div>
                <div data-ok={publicScoreMismatch ? "false" : "true"}>
                  {publicScoreMismatch
                    ? `Public score ${publicScore.teamOne}–${publicScore.teamTwo} differs from finalized total ${finalizedScore.teamOne}–${finalizedScore.teamTwo}`
                    : "Public score matches the finalized point total"}
                  {publicScoreMismatch ? <Link href={`/admin?tab=live-scoring${selectedTournamentId ? `&tournament=${encodeURIComponent(selectedTournamentId)}` : ""}`}> Review Live Scoring →</Link> : null}
                </div>
                <div data-ok={playerDuplicates.length ? "false" : "true"}>{playerDuplicates.length ? `Duplicate Player IDs: ${playerDuplicates.map(([id]) => id).join(", ")}` : "No duplicate Player IDs"}</div>
                <div data-ok={handicapDuplicates.length ? "false" : "true"}>{handicapDuplicates.length ? `Duplicate Year + Player handicap rows: ${handicapDuplicates.map(([key]) => key.replace("|", " / ")).join(", ")}` : "No duplicate Year + Player handicap rows"}</div>
                <div data-ok={historicalTeamsMissingCaptain.length ? "false" : "true"}>
                  {historicalTeamsMissingCaptain.length ? `${historicalTeamsMissingCaptain.length} historical teams are missing a captain` : "Every historical team has a captain mapping"}
                  {historicalTeamsMissingCaptain.length ? <Link href="/admin?tab=teams"> Fix in Teams →</Link> : null}
                </div>
                <div data-ok={captainIdsNotFound.length ? "false" : "true"}>
                  {captainIdsNotFound.length ? `Captain Player IDs not found: ${[...new Set(captainIdsNotFound.map(captainIdFor))].join(", ")}` : "Every historical captain Player ID resolves to a player"}
                  {captainIdsNotFound.length ? <Link href="/admin?tab=players"> Fix in Players →</Link> : null}
                </div>
                <div data-ok={captainsMissingFromRoster.length ? "false" : "true"}>
                  {captainsMissingFromRoster.length ? `${captainsMissingFromRoster.length} historical captains are not present on their team roster` : "Every historical captain is present on the matching roster"}
                  {captainsMissingFromRoster.length ? <Link href="/admin?tab=teams"> Fix in Teams →</Link> : null}
                </div>
                <div data-ok={multipleCaptainMappings.length ? "false" : "true"}>
                  {multipleCaptainMappings.length ? `${multipleCaptainMappings.length} historical teams have multiple captain mappings` : "No historical team has multiple captain mappings"}
                  {multipleCaptainMappings.length ? <Link href="/admin?tab=teams"> Fix in Teams →</Link> : null}
                </div>
                <div data-ok={historicalMatchesMissingTeamIds.length ? "false" : "true"}>
                  {historicalMatchesMissingTeamIds.length ? `${historicalMatchesMissingTeamIds.length} historical matches are missing Team IDs` : "Every historical match has Team IDs"}
                  {historicalMatchesMissingTeamIds.length ? <Link href="/admin?tab=matches"> Fix in Matches →</Link> : null}
                </div>
                <div data-ok={historicalMatchesMissingCourse.length ? "false" : "true"}>
                  {historicalMatchesMissingCourse.length ? `${historicalMatchesMissingCourse.length} historical matches have no valid course mapping` : "Every historical match resolves to a course"}
                  {historicalMatchesMissingCourse.length ? <Link href="/admin?tab=matches"> Fix in Matches →</Link> : null}
                </div>
                <div data-ok={historicalScramblesWithIndividualStrokes.length ? "false" : "true"}>
                  {historicalScramblesWithIndividualStrokes.length ? `${historicalScramblesWithIndividualStrokes.length} historical scramble matches contain individual stroke values` : "Historical scrambles use team-level stroke fields"}
                  {historicalScramblesWithIndividualStrokes.length ? <Link href="/admin?tab=matches"> Fix in Matches →</Link> : null}
                </div>
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
