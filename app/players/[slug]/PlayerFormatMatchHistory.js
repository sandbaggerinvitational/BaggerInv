"use client";

import Link from "next/link";
import { useId, useState } from "react";
import styles from "../../historical.module.css";

const FORMAT_LABELS = {
  BB: "Best Ball",
  SC: "Scramble",
  SI: "Singles",
};

function resultLabel(outcome) {
  if (outcome === "win") return "WIN";
  if (outcome === "loss") return "LOSS";
  if (outcome === "half") return "HALVE";
  return "PENDING";
}

function winnerColor(match, side) {
  if (side === 1) {
    return match.team.side === "Team 1"
      ? match.team.color
      : match.opposingTeam.color;
  }
  if (side === 2) {
    return match.team.side === "Team 2"
      ? match.team.color
      : match.opposingTeam.color;
  }
  return "#777d79";
}

function MatchRow({ match }) {
  const opponents = match.opponents.map((player) => player.name).join(" + ");
  const partner = match.partner.map((player) => player.name).join(" + ");

  return (
    <article className={styles.profileMatchRow} id={`profile-match-${match.id}`}>
      <div className={styles.profileMatchWhen}>
        <strong>Round {match.round}</strong>
        {match.course?.name ? <span>{match.course.name}</span> : null}
      </div>

      <div className={styles.profileMatchPairing}>
        {partner ? <span>With <strong>{partner}</strong></span> : null}
        <span>vs <strong>{opponents || "Opponent not recorded"}</strong></span>
        <small>Represented {match.team.name}</small>
      </div>

      <div className={styles.profileMatchResults}>
        <span className={styles.profileMatchOutcome} data-outcome={match.outcome}>
          {resultLabel(match.outcome)}
        </span>
        <div className={styles.profileMatchSegments}>
          {match.segments.map((segment) => (
            <span key={segment.label}>
              {segment.label}:{" "}
              <b
                style={{
                  "--historical-result-color": winnerColor(match, segment.side),
                }}
              >
                {segment.winner}
              </b>
            </span>
          ))}
          {!match.segments.length ? <span>Match Winner: {match.winner}</span> : null}
        </div>
      </div>

      {match.href ? (
        <Link className={styles.profileMatchLink} href={match.href}>
          View Match →
        </Link>
      ) : null}
    </article>
  );
}

export default function PlayerFormatMatchHistory({ history }) {
  const accordionId = useId();
  const [open, setOpen] = useState(false);
  const [openYears, setOpenYears] = useState(() =>
    history.latestYear ? new Set([history.latestYear]) : new Set()
  );
  const formatLabel = FORMAT_LABELS[history.format] || history.format;

  if (!history.matches.length) {
    return (
      <p className={styles.profileMatchEmpty}>
        No recorded {formatLabel} matches
      </p>
    );
  }

  function toggleYear(year) {
    setOpenYears((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  return (
    <div className={styles.profileMatchHistory}>
      <button
        type="button"
        className={styles.profileMatchToggle}
        aria-expanded={open}
        aria-controls={accordionId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <strong>View {formatLabel} Matches</strong>
          <small>
            {history.matches.length} {history.matches.length === 1 ? "match" : "matches"}
            {history.firstYear && history.latestYear
              ? ` · ${history.firstYear}${history.firstYear === history.latestYear ? "" : `–${history.latestYear}`}`
              : ""}
          </small>
        </span>
        <b aria-hidden="true">{open ? "⌃" : "⌄"}</b>
      </button>

      <div id={accordionId} hidden={!open}>
        {!history.consistent ? (
          <div className={styles.profileMatchWarning} role="status">
            Data Health warning: this match history does not reconcile with the format summary.
          </div>
        ) : null}

        <div className={styles.profileMatchYears}>
          {history.years.map((group) => {
            const yearId = `${accordionId}-${group.year}`;
            const yearOpen = openYears.has(group.year);
            return (
              <section className={styles.profileMatchYear} key={group.year}>
                <button
                  type="button"
                  aria-expanded={yearOpen}
                  aria-controls={yearId}
                  onClick={() => toggleYear(group.year)}
                >
                  <strong>{group.year}</strong>
                  <span>{group.matches.length} {group.matches.length === 1 ? "match" : "matches"}</span>
                  <b aria-hidden="true">{yearOpen ? "−" : "+"}</b>
                </button>
                <div id={yearId} hidden={!yearOpen}>
                  {group.matches.map((match) => (
                    <MatchRow match={match} key={match.id} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
