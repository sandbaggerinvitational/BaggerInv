import styles from "./war-room.module.css";

function ProbabilityRows({ probabilities, teamNames }) {
  const rows = [
    [teamNames[0], probabilities.teamA, "A"],
    ["Halved", probabilities.halve, "H"],
    [teamNames[1], probabilities.teamB, "B"],
  ];

  return (
    <div className={styles.simProbabilityRows}>
      {rows.map(([label, value, side]) => (
        <div key={side} data-side={side}>
          <span>{label}</span>
          <div><i style={{ width: `${value}%` }} /></div>
          <strong>{value.toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
}

export default function SimulationResults({ simulation, format, teamNames }) {
  return (
    <div className={styles.simResults}>
      <div className={styles.dashboardHeader}>
        <span>10K</span>
        <div><p>SBI Match Simulation</p><h2>10,000 possible outcomes</h2></div>
        <small>Seeded · Model v1</small>
      </div>

      {format !== "SI" ? (
        <div className={styles.simSegments}>
          {[["Front 9", "front"], ["Back 9", "back"], ["Overall — 18 Holes", "overall"]].map(([label, key]) => (
            <section key={key}>
              <h3>{label}</h3>
              <ProbabilityRows probabilities={simulation.segmentProbabilities[key]} teamNames={teamNames} />
            </section>
          ))}
        </div>
      ) : (
        <section className={styles.simOverall}>
          <h3>Overall — 18 Holes</h3>
          <ProbabilityRows probabilities={simulation.winProbability} teamNames={teamNames} />
        </section>
      )}

      <div className={styles.simSummaryGrid}>
        <section className={styles.simExpected}>
          <span>Expected Points</span>
          <h3>Out of {simulation.maximumPoints.toFixed(2)}</h3>
          <div><b>{teamNames[0]}</b><strong>{simulation.expectedPoints.teamA.toFixed(2)}</strong></div>
          <div><b>{teamNames[1]}</b><strong>{simulation.expectedPoints.teamB.toFixed(2)}</strong></div>
        </section>
        <section className={styles.simLikely}>
          <span>{format === "SI" ? "Most Likely Results" : "Most Likely Points Results"}</span>
          <h3>Outcome distribution</h3>
          {simulation.likelyResults.map((row) => (
            <div key={row.key}>
              <b>{row.label}</b>
              <i><em style={{ width: `${row.probability}%` }} /></i>
              <strong>{row.probability.toFixed(1)}%</strong>
            </div>
          ))}
        </section>
      </div>

      <section className={styles.simVolatility}>
        <span>How the overall match finishes</span>
        <div>
          <p><strong>{simulation.volatility.on18.toFixed(1)}%</strong><small>Decided on 18</small></p>
          <p><strong>{simulation.volatility.before17.toFixed(1)}%</strong><small>Closed on 16 or 17</small></p>
          <p><strong>{simulation.volatility.early.toFixed(1)}%</strong><small>Closed by 15</small></p>
          <p><strong>{simulation.volatility.halved.toFixed(1)}%</strong><small>Halved</small></p>
        </div>
      </section>
    </div>
  );
}
