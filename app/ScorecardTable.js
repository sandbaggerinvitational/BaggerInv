"use client";

import Link from "next/link";
import { useId, useState } from "react";
import styles from "./scorecard.module.css";
import pairingStyles from "./scorecard-pairing.module.css";
import summaryStyles from "./scorecard-summary.module.css";
import density from "./history/history-density.module.css";

const hasValue = (value) => value !== null && value !== undefined && value !== "";
const toPar = (value) => {
  if (!Number.isFinite(Number(value))) return "";
  if (Number(value) === 0) return "E";
  return Number(value) > 0 ? `+${value}` : String(value);
};
const titleCase = (value) => String(value ?? "")
  .trim()
  .toLowerCase()
  .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

function teeLabel(value) {
  const tee = titleCase(value);
  if (!tee) return "";
  return /\btees?$/i.test(tee) ? tee.replace(/\bTee$/i, "Tees") : `${tee} Tees`;
}

function PlayerLink({ name, slug }) {
  return slug ? <Link href={`/players/${slug}`}>{name}</Link> : <>{name}</>;
}

function Participant({ scorecard, stackPairingIdentities = false }) {
  if (scorecard.scoreType === "TEAM") {
    const participantNames = scorecard.participantNames || [];
    const accessibleName = [participantNames.join(" and "), "Scramble scoring side"]
      .filter(Boolean)
      .join(". ");
    return (
      <div className={`${styles.teamParticipant} ${stackPairingIdentities ? pairingStyles.stackedPairing : ""}`} aria-label={stackPairingIdentities ? accessibleName : undefined}>
        {stackPairingIdentities && participantNames.length ? (
          <div className={pairingStyles.pairingNames}>
            {participantNames.map((name, index) => (
              <strong key={`${scorecard.matchId}-${scorecard.teamId}-${index}`}>
                <PlayerLink name={name} slug={scorecard.participantSlugs?.[index]} />
              </strong>
            ))}
          </div>
        ) : <strong>{scorecard.teamName || "Team"}</strong>}
        {!stackPairingIdentities && participantNames.length ? (
          <small>
            {participantNames.map((name, index) => (
              <span key={`${scorecard.matchId}-${scorecard.teamId}-${index}`}>
                {index ? " + " : ""}
                <PlayerLink name={name} slug={scorecard.participantSlugs?.[index]} />
              </span>
            ))}
          </small>
        ) : null}
      </div>
    );
  }
  return (
    <strong>
      <PlayerLink name={scorecard.playerName || scorecard.playerId || "Player"} slug={scorecard.playerSlug} />
    </strong>
  );
}

function ScoreCell({ hole = {} }) {
  const strokes = Number.isFinite(Number(hole.strokesAllocated)) ? Number(hole.strokesAllocated) : 0;
  return (
    <td data-to-par={hole.toPar === null ? "" : hole.toPar}>
      {strokes > 0 ? (
        <span
          aria-label={`${strokes} handicap ${strokes === 1 ? "stroke" : "strokes"} received`}
          className={styles.strokeDots}
        >
          {"•".repeat(strokes)}
        </span>
      ) : <span aria-hidden="true" className={styles.strokeDots} />}
      <strong>{hasValue(hole.score) ? hole.score : "—"}</strong>
      {hole.toPar !== null ? <small>{toPar(hole.toPar)}</small> : null}
    </td>
  );
}

function NetCell({ hole = {} }) {
  return (
    <td className={styles.netCell}>
      <strong>{hasValue(hole.netScore) ? hole.netScore : "—"}</strong>
      {hole.netToPar !== null ? <small>{toPar(hole.netToPar)}</small> : null}
    </td>
  );
}

function holesFor(scorecards, start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((holeNumber) => scorecards.some((scorecard) =>
      hasValue(scorecard.holes.find((hole) => hole.holeNumber === holeNumber)?.score)
    ));
}

function NetParticipant({ netRow, scorecards, stackPairingIdentities }) {
  const pairingCards = scorecards.filter((scorecard) => Number(scorecard.side) === Number(netRow.side));
  const players = pairingCards
    .flatMap((scorecard) => scorecard.playerName
      ? [{ name: scorecard.playerName, slug: scorecard.playerSlug }]
      : (scorecard.participantNames || []).map((name, index) => ({
        name,
        slug: scorecard.participantSlugs?.[index],
      })))
    .filter((player) => player.name);
  if (!stackPairingIdentities) return <><strong>{netRow.name}</strong><small>{netRow.label}</small></>;

  const participantIdentity = players.map((player) => player.name).join(" and ") || netRow.name;
  return <span className={pairingStyles.derivedRowIdentity}>
    <span aria-hidden="true" className={pairingStyles.derivedRowLabel}>{netRow.label}</span>
    <span className={pairingStyles.visuallyHidden}>{participantIdentity}. {netRow.label}</span>
  </span>;
}

function ScoreGrid({
  scorecards,
  segment = "full",
  stackPairingIdentities = false,
  hideHoleWinnerSummary = false,
}) {
  const start = segment === "back" ? 10 : 1;
  const end = segment === "front" ? 9 : 18;
  const holeNumbers = holesFor(scorecards, start, end);
  const showFront = segment !== "back" && scorecards.some((scorecard) => scorecard.frontNine !== null);
  const showBack = segment !== "front" && scorecards.some((scorecard) => scorecard.backNine !== null);
  const showTotal = segment !== "front" && scorecards.every((scorecard) => scorecard.total !== null);
  const matchNet = scorecards[0]?.matchNetScoring;
  const showNet = Boolean(matchNet?.rows?.some((row) => row.available));
  const ordered = [...scorecards].sort((a, b) =>
    (a.side || 9) - (b.side || 9) ||
    String(a.playerName || a.teamName || "").localeCompare(String(b.playerName || b.teamName || ""))
  );

  const netRowForSide = (side) => matchNet?.rows?.find((row) => row.side === side);
  const winnerForHole = (holeNumber) => matchNet?.holeWinners?.find((hole) => hole.holeNumber === holeNumber);
  const rows = [];
  for (const scorecard of ordered) {
    rows.push(
      <tr key={`${scorecard.matchId}-${scorecard.scoreType}-${scorecard.playerId || scorecard.teamId}`}>
        <th><Participant scorecard={scorecard} stackPairingIdentities={stackPairingIdentities} /></th>
        {holeNumbers.map((holeNumber) => (
          <ScoreCell
            hole={scorecard.holes.find((hole) => hole.holeNumber === holeNumber)}
            key={holeNumber}
          />
        ))}
        {showFront ? <td className={styles.total}><strong>{scorecard.frontNine ?? "—"}</strong></td> : null}
        {showBack ? <td className={styles.total}><strong>{scorecard.backNine ?? "—"}</strong></td> : null}
        {showTotal ? <td className={styles.total}><strong>{scorecard.total}</strong></td> : null}
        {showTotal ? (
          <td className={styles.total}>
            <strong>{scorecard.totalToPar === null ? "—" : toPar(scorecard.totalToPar)}</strong>
          </td>
        ) : null}
        {showNet ? <td className={styles.netTotal}><strong>{scorecard.netTotals?.total ?? "—"}</strong></td> : null}
      </tr>
    );
    const next = ordered[ordered.indexOf(scorecard) + 1];
    if (scorecard.side && next?.side === scorecard.side) continue;
    const netRow = netRowForSide(scorecard.side);
    if (!netRow?.available) continue;
    rows.push(
      <tr className={styles.netRow} key={`${scorecard.matchId}-net-${scorecard.side}`}>
        <th>
          <NetParticipant netRow={netRow} scorecards={ordered} stackPairingIdentities={stackPairingIdentities} />
        </th>
        {holeNumbers.map((holeNumber) => (
          <NetCell hole={netRow.holes.find((hole) => hole.holeNumber === holeNumber)} key={holeNumber} />
        ))}
        {showFront ? <td className={styles.netTotal}><strong>{netRow.netTotals?.frontNine ?? "—"}</strong></td> : null}
        {showBack ? <td className={styles.netTotal}><strong>{netRow.netTotals?.backNine ?? "—"}</strong></td> : null}
        {showTotal ? <td className={styles.netTotal}><strong>{netRow.netTotals?.total ?? "—"}</strong></td> : null}
        {showTotal ? <td className={styles.netTotal}><strong>{toPar(netRow.netTotals?.toPar)}</strong></td> : null}
        {showNet ? <td className={styles.netTotal}><strong>{netRow.netTotals?.total ?? "—"}</strong></td> : null}
      </tr>
    );
  }

  return (
    <div className={styles.scroller}>
      <table>
        <thead>
          <tr>
            <th>Player / Team</th>
            {holeNumbers.map((holeNumber) => <th key={holeNumber}>{holeNumber}</th>)}
            {showFront ? <th>OUT</th> : null}
            {showBack ? <th>IN</th> : null}
            {showTotal ? <th>TOTAL</th> : null}
            {showTotal ? <th>TO PAR</th> : null}
            {showNet ? <th>NET</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows}
          {showNet && matchNet?.holeWinners?.length ? (
            <tr className={styles.winnerRow}>
              <th>
                <strong>Hole Winner</strong>
                {!hideHoleWinnerSummary ? <small>
                  {matchNet.summary.sideAWins}–{matchNet.summary.sideBWins} · {matchNet.summary.halved} halved
                </small> : null}
              </th>
              {holeNumbers.map((holeNumber) => {
                const winner = winnerForHole(holeNumber);
                const label = winner?.winnerType === "HALVED"
                  ? `Hole ${holeNumber} was halved`
                  : winner?.winnerType === "UNAVAILABLE"
                    ? "Hole winner unavailable"
                    : `${winner?.winnerName || winner?.abbreviation} won Hole ${holeNumber}`;
                return (
                  <td aria-label={label} key={holeNumber}>
                    <span title={label}>{winner?.winnerType === "UNAVAILABLE" ? "—" : winner?.abbreviation || "—"}</span>
                  </td>
                );
              })}
              {showFront ? <td>—</td> : null}
              {showBack ? <td>—</td> : null}
              {showTotal ? <td>{matchNet.summary.sideAWins}–{matchNet.summary.sideBWins}</td> : null}
              {showTotal ? <td>{matchNet.summary.halved} H</td> : null}
              {showNet ? <td>—</td> : null}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ScorecardSummary({ scorecards, stackPairingIdentities }) {
  return <div className={summaryStyles.summary} aria-label="Scorecard totals">
    {scorecards.map((scorecard) => (
      <div className={`${summaryStyles.row} ${density.summaryRow}`} key={`${scorecard.matchId}-${scorecard.scoreType}-${scorecard.playerId || scorecard.teamId}`}>
        <span><Participant scorecard={scorecard} stackPairingIdentities={stackPairingIdentities} /></span>
        <dl>
          <div><dt>Gross</dt><dd>{scorecard.total ?? "—"}</dd></div>
          <div><dt>Strokes</dt><dd>{scorecard.strokesReceived ?? "—"}</dd></div>
          <div><dt>Net</dt><dd>{scorecard.netTotals?.total ?? "—"}</dd></div>
        </dl>
      </div>
    ))}
  </div>;
}

export default function ScorecardTable({
  scorecards = [],
  title = "Hole-by-Hole Scorecard",
  compact = false,
  historyDensity = false,
  showSummary = false,
  stackPairingIdentities = false,
}) {
  const accordionId = useId();
  const [open, setOpen] = useState(false);
  const available = scorecards.filter((scorecard) =>
    scorecard.status !== "MISSING" &&
    scorecard.completedHoleCount > 0 &&
    scorecard.holes?.some((hole) => hasValue(hole.score))
  );

  if (!available.length) return null;

  const partial = available.some((scorecard) =>
    scorecard.status === "PARTIAL" || scorecard.completedHoleCount < 18
  );
  const recordedHoles = Math.min(...available.map((scorecard) => scorecard.completedHoleCount));
  const course = available.find((scorecard) => scorecard.courseName)?.courseName || "";
  const tee = teeLabel(available.find((scorecard) => scorecard.tee)?.tee);
  const courseTee = [course, tee].filter(Boolean).join(" · ");
  const hasFront = holesFor(available, 1, 9).length > 0;
  const hasBack = holesFor(available, 10, 18).length > 0;
  const netAvailable = Boolean(available[0]?.matchNetScoring?.available);

  return (
    <section className={styles.scorecard} data-compact={compact ? "true" : "false"}>
      <button
        aria-controls={accordionId}
        aria-expanded={open}
        className={`${styles.toggle} ${historyDensity ? density.scorecardToggle : ""}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <strong>{title}</strong>
          {courseTee ? <small>{courseTee}</small> : null}
          <b>
            {partial ? "Partial Scorecard · " : ""}{recordedHoles} holes recorded
            {" · "}{historyDensity
              ? (netAvailable ? "Gross & Net" : "Gross only")
              : (netAvailable ? "Gross and net scoring available" : "Gross scoring available")}
          </b>
        </span>
        <i aria-hidden="true">⌄</i>
      </button>

      <div
        aria-hidden={!open}
        className={styles.content}
        data-open={open ? "true" : "false"}
        id={accordionId}
        inert={open ? undefined : ""}
      >
        <div>
          {partial ? (
            <div className={styles.partial} role="status">
              Partial Scorecard · Only recorded holes are shown. Full-round statistics exclude this scorecard.
            </div>
          ) : null}

          {showSummary ? <ScorecardSummary scorecards={available} stackPairingIdentities={stackPairingIdentities} /> : null}

          <div className={styles.desktopGrid}>
            <ScoreGrid hideHoleWinnerSummary={historyDensity} scorecards={available} stackPairingIdentities={stackPairingIdentities} />
          </div>

          <div className={`${styles.mobileGrid} ${historyDensity ? density.mobileGrid : ""}`}>
            {hasFront ? <section>
              <header><strong>Front 9</strong><span>Holes 1–9</span></header>
              <ScoreGrid hideHoleWinnerSummary={historyDensity} scorecards={available} segment="front" stackPairingIdentities={stackPairingIdentities} />
            </section> : null}
            {hasBack ? <section>
              <header><strong>Back 9</strong><span>Holes 10–18</span></header>
              <ScoreGrid hideHoleWinnerSummary={historyDensity} scorecards={available} segment="back" stackPairingIdentities={stackPairingIdentities} />
            </section> : null}
          </div>

          {historyDensity ? <details className={density.legendDetails}>
            <summary>How to read this scorecard</summary>
            <p className={density.legend}>
              Large number: gross score · Small number: gross score to par · Gold dot: handicap stroke · Net row: score after handicap strokes
            </p>
          </details> : <p className={styles.legend}>
            Large number: gross score · Small number: gross score to par · Gold dot: handicap stroke · Net row: score after handicap strokes
          </p>}
        </div>
      </div>
    </section>
  );
}
