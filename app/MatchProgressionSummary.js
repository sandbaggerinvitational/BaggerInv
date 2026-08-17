import {
  formatMatchPosition,
  reconstructMatchProgression,
} from "../lib/match-progression";
import styles from "./live/live.module.css";

const MILESTONES = [6, 9, 12, 15];

export default function MatchProgressionSummary({ scorecards = [] }) {
  const progressionScorecards = scorecards.map((scorecard) =>
    scorecard.historyProgressionMatchNetScoring
      ? {
        ...scorecard,
        matchNetScoring: scorecard.historyProgressionMatchNetScoring,
      }
      : scorecard
  );
  const match = reconstructMatchProgression(progressionScorecards);
  if (!match) return null;
  const finalName = match.winnerSide === "A"
    ? match.sideA.teamName
    : match.winnerSide === "B" ? match.sideB.teamName : "";
  const finalLabel = match.winnerSide
    ? `${finalName} wins ${match.finalMargin.label}`
    : "Match Halved";

  return (
    <section className={styles.matchProgression} aria-label="Match progression">
      <div className={styles.matchProgressionHeader}>
        <span>Match Intelligence</span>
        <h3>Match Progression</h3>
      </div>
      <div className={styles.matchProgressionGrid}>
        {MILESTONES.map((holeNumber) => {
          const step = match.progression.find((item) => item.holeNumber === holeNumber);
          return (
            <div key={holeNumber}>
              <span>After {holeNumber}</span>
              <strong>{formatMatchPosition(
                step?.position || 0,
                match.sideA.teamName,
                match.sideB.teamName
              )}</strong>
            </div>
          );
        })}
        <div className={styles.matchProgressionFinal}>
          <span>Final</span>
          <strong>{finalLabel}</strong>
        </div>
      </div>
    </section>
  );
}
