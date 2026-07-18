"use client";
import { useMemo, useState } from "react";
import styles from "./war-room.module.css";
import {
  allocateStrokes,
  courseHandicap,
  formatCode,
  pick,
  playingHandicaps,
  predict,
  settingsMap,
} from "../../lib/prediction-engine";
import {
  currentTournamentYear,
  getCourseOptions,
  getFormatCourse,
  getTeamContext,
  holesForTee,
  scorecardForTee,
} from "../../lib/tournament-context";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function WarRoom({ initialData, loadError }) {
  const sheets = initialData?.sheets || {};
  const [format, setFormat] = useState("BB");
  const [selected, setSelected] = useState([]);
  const [teeOverride, setTeeOverride] = useState("");
  const [showHoleDetails, setShowHoleDetails] = useState(false);

  const year = useMemo(() => currentTournamentYear(sheets), [sheets]);
  const teams = useMemo(() => getTeamContext(sheets, year), [sheets, year]);
  const course = useMemo(
    () => getFormatCourse(sheets, year, format),
    [sheets, year, format]
  );
  const courseId = clean(pick(course, "Course ID"));
  const scorecards = useMemo(() => getCourseOptions(sheets, course), [sheets, course]);
  const tees = scorecards
    .map((row) => clean(pick(row, "Tee", "Tee Name")))
    .filter(Boolean);
  const assignedTee = clean(pick(course, "Tee", "Tee Name"));
  const tee = tees.includes(teeOverride)
    ? teeOverride
    : tees.includes(assignedTee)
      ? assignedTee
      : tees[0] || assignedTee;
  const scorecard = scorecardForTee(scorecards, tee);
  const holes = holesForTee(sheets, courseId, tee);
  const settings = settingsMap(sheets.settings || []);
  const historical = initialData?.historical || {};

  const required = formatCode(format) === "SI" ? 2 : 4;
  const chosen = Array.from({ length: required }, (_, index) => selected[index] || "");
  const slotsPerTeam = formatCode(format) === "SI" ? 1 : 2;

  const details = chosen.map((id, index) => {
    const team = index < slotsPerTeam ? teams.team1 : teams.team2;
    const player = team.players.find((item) => item.id === id) || {
      id,
      name: "Select player",
      tournamentHandicap: null,
    };
    const tournamentHandicap = number(player.tournamentHandicap, NaN);
    const calculatedCourseHandicap = Number.isFinite(tournamentHandicap)
      ? courseHandicap(
          tournamentHandicap,
          pick(scorecard, "Course Rating", "Rating"),
          pick(scorecard, "Slope Rating", "Slope"),
          pick(scorecard, "Par")
        )
      : null;
    return {
      ...player,
      tournamentHandicap,
      courseHandicap: calculatedCourseHandicap,
    };
  });

  const scorecardComplete =
    tee &&
    clean(pick(scorecard, "Course Rating", "Rating")) !== "" &&
    clean(pick(scorecard, "Slope Rating", "Slope")) !== "" &&
    clean(pick(scorecard, "Par")) !== "";
  const ready =
    details.length === required &&
    details.every(
      (player) =>
        player.id &&
        Number.isFinite(player.tournamentHandicap) &&
        Number.isFinite(player.courseHandicap)
    ) &&
    scorecardComplete;

  const play = ready
    ? playingHandicaps(format, details.map((player) => player.courseHandicap))
    : null;
  const prediction = ready
    ? predict({
        format,
        players: details,
        historical,
        partnership: initialData.partnerships || {},
        headToHead: initialData.headToHead || {},
        handicap: play,
        settings,
        teamNames: [teams.team1.name, teams.team2.name],
      })
    : null;
  const strokeMaps =
    play && holes.length === 18
      ? {
          team1: allocateStrokes(play.strokesA, holes),
          team2: allocateStrokes(play.strokesB, holes),
        }
      : null;

  const validation = [];
  if (!courseId) validation.push(`No ${formatCode(format)} course is assigned for ${year}.`);
  if (!scorecards.length && courseId)
    validation.push(`No Course Scorecards rows were found for ${courseId}.`);
  if (scorecards.length && !scorecardComplete)
    validation.push(`The ${tee || "selected"} tee is missing rating, slope, or par.`);
  if (!teams.team1.players.length)
    validation.push(`No ${year} roster was found for ${teams.team1.name}.`);
  if (!teams.team2.players.length)
    validation.push(`No ${year} roster was found for ${teams.team2.name}.`);

  function changeFormat(value) {
    setFormat(value);
    setSelected([]);
    setTeeOverride("");
    setShowHoleDetails(false);
  }
  function updatePlayer(index, value) {
    const next = [...chosen];
    next[index] = value;
    setSelected(next);
  }
  function netForPlayer(index) {
    if (formatCode(format) === "BB") return play.playerStrokes[index];
    if (formatCode(format) === "SI") return play.playerStrokes[index];
    if (index === 0) return play.strokesA;
    if (index === 2) return play.strokesB;
    return "—";
  }

  if (!initialData) {
    return (
      <section className={styles.shell}>
        <div className={styles.error}>
          <h1>War Room</h1>
          <p>{loadError || "Prediction data is unavailable."}</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={styles.hero}>
        <p>Captain&apos;s Analytics</p>
        <h1>War Room</h1>
        <span>Build a matchup. See the strokes. Make the call.</span>
      </section>
      <section className={styles.shell}>
        {loadError ? <div className={styles.notice}>{loadError}</div> : null}
        {validation.length ? (
          <div className={styles.notice}>
            {validation.map((message) => <div key={message}>{message}</div>)}
          </div>
        ) : null}

        <div className={styles.setupCard}>
          <div className={styles.sectionTitle}>
            <span>01</span>
            <div><p>Match Setup</p><h2>Choose the battlefield</h2></div>
          </div>
          <div className={styles.controlsThree}>
            <label>
              Format
              <select value={format} onChange={(event) => changeFormat(event.target.value)}>
                <option value="BB">Best Ball</option>
                <option value="SC">2-Man Scramble</option>
                <option value="SI">Singles</option>
              </select>
            </label>
            <label>
              Course
              <input value={pick(course, "Course Name", "Course") || courseId || "Not assigned"} readOnly />
            </label>
            <label>
              Tee
              <select value={tee} onChange={(event) => setTeeOverride(event.target.value)} disabled={!tees.length}>
                {tees.length
                  ? tees.map((name) => <option key={name} value={name}>{name}</option>)
                  : <option value="">No scorecard tees</option>}
              </select>
            </label>
          </div>

          <div className={styles.matchupGrid}>
            {[teams.team1, teams.team2].map((team, side) => (
              <div className={styles.teamPanel} key={team.side}>
                <div>
                  <span>{team.name}</span>
                  <strong>{formatCode(format) === "SI" ? "Singles Player" : "Pairing"}</strong>
                </div>
                {Array.from({ length: slotsPerTeam }, (_, slot) => {
                  const index = side * slotsPerTeam + slot;
                  return (
                    <label key={index}>
                      Player {slot + 1}
                      <select value={chosen[index]} onChange={(event) => updatePlayer(index, event.target.value)}>
                        <option value="">Select player</option>
                        {team.players
                          .filter((player) => !chosen.includes(player.id) || chosen[index] === player.id)
                          .map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {!ready ? (
          <div className={styles.emptyState}>
            <span>Complete the matchup</span>
            <h2>Select every player to run the prediction.</h2>
            {!scorecardComplete ? <p>A complete tee scorecard is also required.</p> : null}
          </div>
        ) : (
          <>
            <div className={styles.predictionCard}>
              <div className={styles.model}>{prediction.model} · {prediction.confidence} confidence</div>
              <div className={styles.probabilities}>
                <div><span>{teams.team1.name}</span><strong>{prediction.teamA}%</strong></div>
                <div className={styles.tie}><span>HALVE</span><strong>{prediction.tie}%</strong></div>
                <div><span>{teams.team2.name}</span><strong>{prediction.teamB}%</strong></div>
              </div>
              <div className={styles.bar}>
                <i style={{ width: `${prediction.teamA}%` }} />
                <b style={{ width: `${prediction.tie}%` }} />
                <em style={{ width: `${prediction.teamB}%` }} />
              </div>
              <div className={styles.factors}>
                {prediction.factors.map((factor, index) => <div key={index} data-side={factor.side}>{factor.label}</div>)}
              </div>
            </div>

            <div className={styles.breakdownCard}>
              <div className={styles.sectionTitle}>
                <span>02</span>
                <div><p>Handicap Breakdown</p><h2>Where the strokes fall</h2></div>
              </div>
              <div className={styles.playerTable}>
                <div className={styles.tableHead}>
                  <span>Player</span><span>Tournament HCP</span><span>Course HCP</span><span>Playing HCP</span>
                </div>
                {details.map((player, index) => (
                  <div key={player.id}>
                    <strong>{player.name}</strong>
                    <span>{player.tournamentHandicap.toFixed(1)}</span>
                    <span>{Math.round(player.courseHandicap)}</span>
                    <b>{netForPlayer(index)}</b>
                  </div>
                ))}
              </div>
              <div className={styles.strokeSummary}>
                <div><span>{teams.team1.name} receives</span><strong>{play.strokesA} stroke{play.strokesA === 1 ? "" : "s"}</strong></div>
                <div><span>{teams.team2.name} receives</span><strong>{play.strokesB} stroke{play.strokesB === 1 ? "" : "s"}</strong></div>
              </div>

              {holes.length === 18 ? (
                <div className={styles.holeDetails}>
                  <button type="button" onClick={() => setShowHoleDetails((value) => !value)}>
                    {showHoleDetails ? "Hide hole details" : "View hole-by-hole stroke allocation"}
                  </button>
                  {showHoleDetails ? (
                    <div className={styles.holeGrid}>
                      {holes.map((hole, index) => (
                        <div key={index}>
                          <span>{pick(hole, "Hole", "Hole Number") || index + 1}</span>
                          <small>SI {pick(hole, "Stroke Index", "Handicap", "HCP")}</small>
                          <b>
                            {strokeMaps.team1[index]
                              ? `${teams.team1.name} +${strokeMaps.team1[index]}`
                              : strokeMaps.team2[index]
                                ? `${teams.team2.name} +${strokeMaps.team2[index]}`
                                : "—"}
                          </b>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={styles.noHoles}>Hole details are hidden because this tee does not yet have all 18 Course Holes rows.</p>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
