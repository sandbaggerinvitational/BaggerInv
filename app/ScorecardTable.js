import Link from "next/link";
import styles from "./scorecard.module.css";

const hasValue = (value) => value !== null && value !== undefined && value !== "";
const toPar = (value) => {
  if (!Number.isFinite(Number(value))) return "";
  if (Number(value) === 0) return "E";
  return Number(value) > 0 ? `+${value}` : String(value);
};

function PlayerLink({ name, slug }) {
  return slug ? <Link href={`/players/${slug}`}>{name}</Link> : <>{name}</>;
}

function Participant({ scorecard }) {
  if (scorecard.scoreType === "TEAM") {
    return (
      <div className={styles.teamParticipant}>
        <strong>{scorecard.teamName || scorecard.teamId || "Team"}</strong>
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

function ScoreCell({ hole }) {
  return (
    <td data-to-par={hole.toPar === null ? "" : hole.toPar}>
      <strong>{hasValue(hole.score) ? hole.score : "—"}</strong>
      {hole.toPar !== null ? <small>{toPar(hole.toPar)}</small> : null}
    </td>
  );
}

export default function ScorecardTable({
  scorecards = [],
  title = "Hole-by-Hole Scorecard",
  compact = false,
}) {
  const available = scorecards.filter((scorecard) => scorecard.status !== "MISSING");
  const partial = available.some((scorecard) => scorecard.status === "PARTIAL");

  return (
    <section className={styles.scorecard} data-compact={compact ? "true" : "false"}>
      <div className={styles.heading}>
        <div>
          <span>Recorded Scorecard</span>
          <h3>{title}</h3>
        </div>
        {available.length ? <b>{available[0].courseId}{available[0].tee ? ` · ${available[0].tee}` : ""}</b> : null}
      </div>

      {!available.length ? (
        <div className={styles.unavailable} role="status">
          <strong>⚠ Hole-by-hole scorecard unavailable.</strong>
          <span>Scorecard unavailable for this historical match.</span>
        </div>
      ) : (
        <>
          {partial ? (
            <div className={styles.partial} role="status">
              Partial historical scorecard. Full-round statistics exclude this scorecard.
            </div>
          ) : null}
          <div className={styles.scroller}>
            <table>
              <thead>
                <tr>
                  <th>Player / Team</th>
                  {Array.from({ length: 9 }, (_, index) => <th key={index + 1}>{index + 1}</th>)}
                  <th>OUT</th>
                  {Array.from({ length: 9 }, (_, index) => <th key={index + 10}>{index + 10}</th>)}
                  <th>IN</th>
                  <th>TOTAL</th>
                  <th>TO PAR</th>
                </tr>
              </thead>
              <tbody>
                {available.map((scorecard) => (
                  <tr key={`${scorecard.matchId}-${scorecard.scoreType}-${scorecard.playerId || scorecard.teamId}`}>
                    <th><Participant scorecard={scorecard} /></th>
                    {scorecard.holes.slice(0, 9).map((hole) => <ScoreCell hole={hole} key={hole.holeNumber} />)}
                    <td className={styles.total}><strong>{scorecard.frontNine ?? "—"}</strong></td>
                    {scorecard.holes.slice(9).map((hole) => <ScoreCell hole={hole} key={hole.holeNumber} />)}
                    <td className={styles.total}><strong>{scorecard.backNine ?? "—"}</strong></td>
                    <td className={styles.total}><strong>{scorecard.total ?? "—"}</strong></td>
                    <td className={styles.total}><strong>{scorecard.totalToPar === null ? "—" : toPar(scorecard.totalToPar)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.legend}>Large number: gross score · Small number: score to par</p>
        </>
      )}
    </section>
  );
}
