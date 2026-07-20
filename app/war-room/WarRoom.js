"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
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
import { briefingPayload, buildFallbackBriefing } from "../../lib/captains-briefing";
import { teamVibesTier } from "../../lib/prediction-engine";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const normalized = clean(value)
    .replace(/[−–—]/g, "-")
    .replace(/,/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function compactPlayerName(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Player";
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function BriefingParagraph({ paragraph }) {
  const match = paragraph.match(/^([A-Z][A-Z '\-]+):\s*(.*)$/s);
  if (!match) return <p>{paragraph}</p>;
  return <div className={styles.briefingSection}><strong>{match[1]}</strong><p>{match[2]}</p></div>;
}

export default function WarRoom({ initialData, loadError, aiConfigured = false }) {
  const sheets = initialData?.sheets || {};
  const [format, setFormat] = useState("BB");
  const [selected, setSelected] = useState([]);
  const [teeOverride, setTeeOverride] = useState("");
  const [showHoleDetails, setShowHoleDetails] = useState(false);
  const [aiBriefing, setAiBriefing] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const year = useMemo(() => currentTournamentYear(sheets), [sheets]);
  const teams = useMemo(() => getTeamContext(sheets, year), [sheets, year]);
  const course = useMemo(() => getFormatCourse(sheets, year, format), [sheets, year, format]);
  const courseId = clean(pick(course, "Course ID"));
  const scorecards = useMemo(() => getCourseOptions(sheets, course), [sheets, course]);
  const tees = scorecards.map((row) => clean(pick(row, "Tee", "Tee Name"))).filter(Boolean);
  const assignedTee = clean(pick(course, "Tee", "Tee Name"));
  const tee = tees.includes(teeOverride)
    ? teeOverride
    : tees.includes(assignedTee)
      ? assignedTee
      : tees[0] || assignedTee;
  const scorecard = scorecardForTee(scorecards, tee);
  const scorecardValues = {
    rating: pick(scorecard, "Course Rating", "Rating"),
    slope: pick(scorecard, "Slope Rating", "Slope"),
    par: pick(scorecard, "Par"),
  };
  const holes = holesForTee(sheets, course, tee);
  const settings = settingsMap(sheets.settings || []);
  const historical = initialData?.historical || {};
  const partnerships = initialData?.partnerships || {};
  const headToHead = initialData?.headToHead || {};

  const required = formatCode(format) === "SI" ? 2 : 4;
  const chosen = Array.from({ length: required }, (_, index) => selected[index] || "");
  const slotsPerTeam = formatCode(format) === "SI" ? 1 : 2;

  const details = chosen.map((id, index) => {
    const team = index < slotsPerTeam ? teams.team1 : teams.team2;
    const player = team.players.find((item) => item.id === id) || { id, name: "Select player", tournamentHandicap: null };
    const tournamentHandicap = number(player.tournamentHandicap, NaN);
    const calculatedCourseHandicap = Number.isFinite(tournamentHandicap)
      ? courseHandicap(tournamentHandicap, scorecardValues.rating, scorecardValues.slope, scorecardValues.par)
      : null;
    return { ...player, tournamentHandicap, courseHandicap: calculatedCourseHandicap };
  });

  const scorecardComplete = tee && clean(scorecardValues.rating) !== "" && clean(scorecardValues.slope) !== "" && clean(scorecardValues.par) !== "";
  const ready = details.length === required && details.every((player) => player.id && Number.isFinite(player.tournamentHandicap) && Number.isFinite(player.courseHandicap)) && scorecardComplete;
  const play = ready ? playingHandicaps(format, details.map((player) => player.courseHandicap)) : null;
  const prediction = ready
    ? predict({ format, players: details, historical, partnership: partnerships, headToHead, handicap: play, settings, teamNames: [teams.team1.name, teams.team2.name] })
    : null;
  const playerStrokeMaps = play && holes.length === 18 && formatCode(format) !== "SC"
    ? play.playerStrokes.map((strokes) => allocateStrokes(strokes, holes))
    : null;
  const effectiveStrokeMaps = play && holes.length === 18
    ? formatCode(format) === "SC"
      ? { team1: allocateStrokes(play.strokesA, holes), team2: allocateStrokes(play.strokesB, holes) }
      : {
          team1: holes.map((_, index) => Math.max(...playerStrokeMaps.slice(0, slotsPerTeam).map((map) => map[index] || 0))),
          team2: holes.map((_, index) => Math.max(...playerStrokeMaps.slice(slotsPerTeam).map((map) => map[index] || 0))),
        }
    : null;

  const fallbackBriefing = ready
    ? buildFallbackBriefing({ prediction, teamNames: [teams.team1.name, teams.team2.name], format: formatCode(format) === "BB" ? "Best Ball" : formatCode(format) === "SC" ? "Scramble" : "Singles", players: details, optimizer: null })
    : "";

  const validation = [];
  if (!courseId) validation.push(`No ${formatCode(format)} course is assigned for ${year}.`);
  if (!scorecards.length && courseId) validation.push(`No Course Scorecards rows were found for ${pick(course, "Course Name", "Course") || courseId}.`);
  if (scorecards.length && !scorecardComplete) validation.push(`The ${tee || "selected"} tee is missing rating, slope, or par.`);
  if (!teams.team1.players.length) validation.push(`No ${year} roster was found for ${teams.team1.name}.`);
  if (!teams.team2.players.length) validation.push(`No ${year} roster was found for ${teams.team2.name}.`);

  function changeFormat(value) {
    setFormat(value);
    setSelected([]);
    setTeeOverride("");
    setShowHoleDetails(false);
    setAiBriefing("");
    setAiError("");
  }
  function updatePlayer(index, value) {
    const next = [...chosen];
    next[index] = value;
    setSelected(next);
    setAiBriefing("");
    setAiError("");
  }
  function netForPlayer(index) {
    if (formatCode(format) === "BB" || formatCode(format) === "SI") return play.playerStrokes[index];
    if (index === 0) return play.strokesA;
    if (index === 2) return play.strokesB;
    return "—";
  }

  const team1Rows = ready ? details.slice(0, slotsPerTeam).map((player, index) => ({ ...player, playingHandicap: netForPlayer(index) })) : [];
  const team2Rows = ready ? details.slice(slotsPerTeam).map((player, index) => ({ ...player, playingHandicap: netForPlayer(index + slotsPerTeam) })) : [];
  const strokeEdge = play ? play.strokesA - play.strokesB : 0;
  const edgeTeam = strokeEdge > 0 ? teams.team1.name : strokeEdge < 0 ? teams.team2.name : "Even";
  const edgeAmount = Math.abs(strokeEdge);
  const frontA = effectiveStrokeMaps ? effectiveStrokeMaps.team1.slice(0, 9).reduce((sum, value) => sum + value, 0) : 0;
  const frontB = effectiveStrokeMaps ? effectiveStrokeMaps.team2.slice(0, 9).reduce((sum, value) => sum + value, 0) : 0;
  const backA = effectiveStrokeMaps ? effectiveStrokeMaps.team1.slice(9).reduce((sum, value) => sum + value, 0) : 0;
  const backB = effectiveStrokeMaps ? effectiveStrokeMaps.team2.slice(9).reduce((sum, value) => sum + value, 0) : 0;
  const frontEdge = frontA - frontB;
  const backEdge = backA - backB;
  const playingLabel = formatCode(format) === "SC" ? "Team Playing HCP" : formatCode(format) === "BB" ? "Best Ball Effective HCP" : "Playing HCP";
  const driverRows = prediction?.contributions
    .filter((item) => formatCode(format) !== "SI" || item.id !== "team")
    .map((item) => {
      const gap = Math.abs(item.teamA - item.teamB);
      return {
        ...item,
        strength: Math.round(Math.max(item.teamA, item.teamB)),
        favored: gap < .5 ? "Even" : item.teamA > item.teamB ? teams.team1.name : teams.team2.name,
      };
    }) || [];
  async function generateAiBriefing() {
    if (!ready) return;
    if (!aiConfigured) {
      setAiError("The SBI Match Analyst is not configured yet. Add OPENAI_API_KEY to the Production environment in Vercel, then redeploy.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    try {
      const response = await fetch("/api/captains-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(briefingPayload({
          prediction,
          teamNames: [teams.team1.name, teams.team2.name],
          format: formatCode(format) === "BB" ? "Best Ball" : formatCode(format) === "SC" ? "Scramble" : "Singles",
          courseName: pick(course, "Course Name", "Course") || courseId,
          tee,
          players: details,
          optimizer: null,
        })),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const suffix = result.requestId ? ` (request ${result.requestId})` : "";
        throw new Error(`${result.error || "Briefing request failed."}${suffix}`);
      }
      setAiBriefing(result.briefing);
    } catch (error) {
      setAiError(error.message);
    } finally {
      setAiLoading(false);
    }
  }

  if (!initialData) {
    return <section className={styles.shell}><div className={styles.error}><h1>War Room</h1><p>{loadError || "Prediction data is unavailable."}</p></div></section>;
  }

  return (
    <>
      <section className={styles.hero}>
        <p>War Room Analytics</p><h1>Matchup Builder</h1><span>Build a matchup. See the strokes. Make the call.</span>
      </section>
      <section className={styles.shell}>
        {loadError ? <div className={styles.notice}>{loadError}</div> : null}
        {validation.length ? <div className={styles.notice}>{validation.map((message) => <div key={message}>{message}</div>)}</div> : null}
        <div className={styles.setupCard}>
          <div className={styles.sectionTitle}><span>01</span><div><p>Matchup Builder</p><h2>Choose the battlefield</h2></div></div>
          <div className={styles.controlsThree}>
            <label>Format<select value={format} onChange={(event) => changeFormat(event.target.value)}><option value="BB">Best Ball</option><option value="SC">Scramble</option><option value="SI">Singles</option></select></label>
            <label>Course<input value={pick(course, "Course Name", "Course") || courseId || "Not assigned"} readOnly /></label>
            <label>Tee<select value={tee} onChange={(event) => { setTeeOverride(event.target.value); setAiBriefing(""); }} disabled={!tees.length}>{tees.length ? tees.map((name) => <option key={name} value={name}>{name}</option>) : <option value="">No scorecard tees</option>}</select></label>
          </div>
          <div className={styles.matchupGrid}>
            {[teams.team1, teams.team2].map((team, side) => (
              <div className={styles.teamPanel} key={team.side}>
                <div><span>{team.name}</span><strong>{formatCode(format) === "SI" ? "Singles Player" : "Pairing"}</strong></div>
                {Array.from({ length: slotsPerTeam }, (_, slot) => {
                  const index = side * slotsPerTeam + slot;
                  return <label key={index}>Player {slot + 1}<select value={chosen[index]} onChange={(event) => updatePlayer(index, event.target.value)}><option value="">Select player</option>{team.players.filter((player) => !chosen.includes(player.id) || chosen[index] === player.id).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>;
                })}
              </div>
            ))}
          </div>
        </div>

        {!ready ? (
          <div className={styles.emptyState}><span>Complete the matchup</span><h2>Select every player to run the prediction.</h2>{!scorecardComplete ? <p>A complete tee scorecard is also required.</p> : null}</div>
        ) : (
          <>
            <div className={styles.dashboardHeader}>
              <span>02</span>
              <div><p>Selected Matchup</p><h2>Matchup analysis</h2></div>
              <small>{formatCode(format) === "BB" ? "Best Ball" : formatCode(format) === "SC" ? "Scramble" : "Singles"} · {tee}</small>
            </div>
            <div className={styles.predictionCard}>
              <div className={styles.model}>{prediction.model} · {prediction.confidence} confidence</div>
              <div className={styles.probabilities}>
                <div><span>{teams.team1.name}</span><strong>{prediction.teamA}%</strong></div>
                <div className={styles.tie}><span>HALVE</span><strong>{prediction.tie}%</strong></div>
                <div><span>{teams.team2.name}</span><strong>{prediction.teamB}%</strong></div>
              </div>
              <div className={styles.bar}><i style={{ width: `${prediction.teamA}%` }} /><b style={{ width: `${prediction.tie}%` }} /><em style={{ width: `${prediction.teamB}%` }} /></div>
              <div className={styles.driverPanel}>
                <div className={styles.driverHeading}><span>What drives this matchup</span><small>Fast read · deeper bars mean stronger evidence</small></div>
                <div className={styles.v11DriverList}>{driverRows.map((item) => <div className={styles.v11DriverRow} key={item.id} data-side={item.side}>
                  <div><strong>{item.label}</strong><span>{item.favored}</span></div>
                  <div className={styles.v11DriverTrack} role="meter" aria-label={`${item.label}: ${item.favored}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={item.strength}><i style={{ width: `${item.strength}%` }} /></div>
                  <b>{item.strength}</b>
                </div>)}</div>
              </div>
            </div>

            {formatCode(format) !== "SI" ? <div className={styles.decisionGrid}>
              {[
                { key: "A", name: teams.team1.name, vibes: prediction.teamVibes.teamA },
                { key: "B", name: teams.team2.name, vibes: prediction.teamVibes.teamB },
              ].map(({ key, name, vibes }) => { const tier = teamVibesTier(vibes); return <div className={styles.vibesCard} key={key} data-known={vibes.known}>
                <span>{name} · Team Vibes</span><strong>{vibes.known ? Math.round(vibes.score) : "—"}</strong><b>{tier.icon} {tier.label}</b><small>{vibes.known ? `${vibes.sameFormatMatches} same-format · ${vibes.matches} overall matches` : "No recorded pairing history yet"}</small>
              </div>; })}
            </div> : null}

            <div className={styles.simHandoff}>
              <div><span>Explore the uncertainty</span><strong>See 10,000 possible outcomes for this exact matchup.</strong></div>
              <Link href={`/war-room/simulator?format=${encodeURIComponent(formatCode(format))}&players=${encodeURIComponent(chosen.join(","))}&tee=${encodeURIComponent(tee)}`}>Run 10,000 simulations →</Link>
            </div>

            <div className={styles.briefingCard}>
              <div className={styles.sectionTitle}><span>SBI</span><div><p>SBI Match Analyst</p><h2>The official scouting report</h2></div></div>
              <div className={styles.briefingText}>{String(aiBriefing || fallbackBriefing).split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <BriefingParagraph paragraph={paragraph} key={index} />)}</div>
              <div className={styles.aiActions}>
                <button type="button" onClick={generateAiBriefing} disabled={aiLoading || !aiConfigured}>{aiLoading ? "Analyzing matchup…" : !aiConfigured ? "Analyst setup required" : aiBriefing ? "Refresh analyst briefing" : "Generate analyst briefing"}</button>
                <small>{aiConfigured ? "Official SBI analysis built from the deterministic matchup numbers above." : "Add OPENAI_API_KEY in Vercel Production Environment Variables and redeploy to enable the SBI Match Analyst."}</small>
              </div>
              {aiError ? <div className={styles.aiError}>{aiError} The SBI analyst briefing above remains available.</div> : null}
            </div>

            <div className={styles.breakdownCard}>
              <div className={styles.sectionTitle}><span>02</span><div><p>Handicap Breakdown</p><h2>Where the strokes fall</h2></div></div>
              <div className={styles.playerTable}>
                <div className={styles.tableHead}><span>Player</span><span>Tournament</span><span>Course</span><span>Playing</span></div>
                {details.map((player, index) => <div key={player.id}><strong>{player.name}</strong><span>{player.tournamentHandicap.toFixed(1)}</span><span>{Math.round(player.courseHandicap)}</span><b>{netForPlayer(index)}</b></div>)}
              </div>
              <div className={styles.strokeEdgeCard}>
                <span>Match Stroke Edge</span>
                {edgeAmount ? <><strong>+{edgeAmount}</strong><b>{edgeTeam}</b></> : <><strong>Even</strong><b>No net stroke edge</b></>}
                <small>{play.strokesA} vs {play.strokesB} {playingLabel}</small>
              </div>
              <div className={styles.teamHandicapGrid}>
                <div className={styles.teamHandicapCard}>
                  <div className={styles.teamHandicapHeader}><span>{teams.team1.name}</span><strong>{play.strokesA}</strong></div>
                  {team1Rows.map((player) => <div key={player.id}><span>{player.name}</span><b>{player.playingHandicap === "—" ? "—" : `+${player.playingHandicap}`}</b></div>)}
                  <small>{playingLabel}</small>
                </div>
                <div className={styles.teamHandicapCard}>
                  <div className={styles.teamHandicapHeader}><span>{teams.team2.name}</span><strong>{play.strokesB}</strong></div>
                  {team2Rows.map((player) => <div key={player.id}><span>{player.name}</span><b>{player.playingHandicap === "—" ? "—" : `+${player.playingHandicap}`}</b></div>)}
                  <small>{playingLabel}</small>
                </div>
              </div>
              {effectiveStrokeMaps ? <div className={styles.nineEdge}><span>Front 9 edge: <b>{frontEdge === 0 ? "Even" : `${frontEdge > 0 ? teams.team1.name : teams.team2.name} +${Math.abs(frontEdge)}`}</b></span><span>Back 9 edge: <b>{backEdge === 0 ? "Even" : `${backEdge > 0 ? teams.team1.name : teams.team2.name} +${Math.abs(backEdge)}`}</b></span></div> : null}
              {holes.length === 18 ? (
                <div className={styles.holeDetails}><button type="button" onClick={() => setShowHoleDetails((value) => !value)}>{showHoleDetails ? "Hide hole details" : "View hole-by-hole stroke allocation"}</button>{showHoleDetails ? <div className={styles.holeGrid}>{holes.map((hole, index) => {
                  const strokesHere = formatCode(format) === "SC"
                    ? [
                        { player: { id: "team1", name: teams.team1.name }, strokes: effectiveStrokeMaps?.team1?.[index] || 0 },
                        { player: { id: "team2", name: teams.team2.name }, strokes: effectiveStrokeMaps?.team2?.[index] || 0 },
                      ].filter((row) => row.strokes)
                    : details.map((player, playerIndex) => ({ player, strokes: playerStrokeMaps?.[playerIndex]?.[index] || 0 })).filter((row) => row.strokes);
                  return <div key={index}><span>{pick(hole, "Hole", "Hole Number") || index + 1}</span><small>SI {pick(hole, "Stroke Index", "Handicap", "HCP")}</small><b className={styles.holeStrokes}>{strokesHere.length ? strokesHere.map(({ player }) => <span key={player.id}>{formatCode(format) === "SC" ? player.name : compactPlayerName(player.name)}</span>) : <span>—</span>}</b></div>;
                })}</div> : null}</div>
              ) : <p className={styles.noHoles}>Hole details are hidden because this tee does not yet have all 18 Course Holes rows.</p>}
            </div>
          </>
        )}
      </section>
    </>
  );
}
