"use client";

import Link from "next/link";
import { useId, useState } from "react";
import styles from "./scorecard.module.css";

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

function Participant({ scorecard }) {
  if (scorecard.scoreType === "TEAM") {
    return (
      <div className={styles.teamParticipant}>
        <strong>{scorecard.teamName || "Team"}</strong>
        {scorecard.participantNames?.length ? (
          <small>
            {scorecard.participantNames.map((name, index) => (
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
  return (
    <td data-to-par={hole.toPar === null ? "" : hole.toPar}>
      <strong>{hasValue(hole.score) ? hole.score : "—"}</strong>
      {hole.toPar !== null ? <small>{toPar(hole.toPar)}</small> : null}
    </td>
  );
}

function holesFor(scorecards, start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((holeNumber) => scorecards.some((scorecard) =>
      hasValue(scorecard.holes.find((hole) => hole.holeNumber === holeNumber)?.score)
    ));
}

function ScoreGrid({ scorecards, segment = "full" }) {
  const start = segment === "back" ? 10 : 1;
  const end = segment === "front" ? 9 : 18;
  const holeNumbers = holesFor(scorecards, start, end);
  const showFront = segment !== "back" && scorecards.some((scorecard) => scorecard.frontNine !== null);
  const showBack = segment !== "front" && scorecards.some((scorecard) => scorecard.backNine !== null);
  const showTotal = segment !== "front" && scorecards.every((scorecard) => scorecard.total !== null);

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
          </tr>
        </thead>
        <tbody>
          {scorecards.map((scorecard) => (
            <tr key={`${scorecard.matchId}-${scorecard.scoreType}-${scorecard.playerId || scorecard.teamId}`}>
              <th><Participant scorecard={scorecard} /></th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ScorecardTable({
  scorecards = [],
  title = "Hole-by-Hole Scorecard",
  compact = false,
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

  return (
    <section className={styles.scorecard} data-compact={compact ? "true" : "false"}>
      <button
        aria-controls={accordionId}
        aria-expanded={open}
        className={styles.toggle}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <strong>{title}</strong>
          {courseTee ? <small>{courseTee}</small> : null}
          <b>{partial ? "Partial Scorecard · " : ""}{recordedHoles} holes recorded</b>
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

          <div className={styles.desktopGrid}>
            <ScoreGrid scorecards={available} />
          </div>

          <div className={styles.mobileGrid}>
            {hasFront ? <section>
              <header><strong>Front 9</strong><span>Holes 1–9</span></header>
              <ScoreGrid scorecards={available} segment="front" />
            </section> : null}
            {hasBack ? <section>
              <header><strong>Back 9</strong><span>Holes 10–18</span></header>
              <ScoreGrid scorecards={available} segment="back" />
            </section> : null}
          </div>

          <p className={styles.legend}>Large number: gross score · Small number: score to par</p>
        </div>
      </div>
    </section>
  );
}
