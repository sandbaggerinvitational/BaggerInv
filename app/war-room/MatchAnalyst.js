import { buildMatchIntelligence } from "../../lib/match-intelligence";
import styles from "./war-room.module.css";

function AnalystSection({ title, children, open = false }) {
  return (
    <details className={styles.analystSection} open={open}>
      <summary>{title}<span aria-hidden="true">+</span></summary>
      <div>{children}</div>
    </details>
  );
}

function EdgeBadge({ edge, teamNames }) {
  const label = edge === "TEAM_A"
    ? teamNames[0]
    : edge === "TEAM_B" ? teamNames[1] : edge === "TIE" ? "Even" : "Unavailable";
  return <b className={styles.matchIntelEdge} data-edge={edge}>{label}</b>;
}

function EvidenceList({ rows, empty }) {
  if (!rows.length) return <p>{empty}</p>;
  return <ul className={styles.matchIntelEvidence}>{rows.map((row) => <li key={row.id}>{row.text}</li>)}</ul>;
}

export default function MatchAnalyst({
  prediction,
  teamNames,
  players,
  historical,
  partnerships,
  headToHead,
  format,
  pointsAvailable,
  scoringIntelligence,
  matches,
}) {
  const intelligence = buildMatchIntelligence({
    prediction,
    teamNames,
    players,
    historical,
    partnerships,
    headToHead,
    format,
    pointsAvailable,
    scoringIntelligence,
    matches,
  });
  if (!intelligence) return null;
  const overview = intelligence.overview;
  const favoriteIndex = overview.favoriteIndex;
  const score = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—";

  return (
    <div className={styles.analystReport}>
      <div className={styles.sectionTitle}>
        <span>SBI</span>
        <div><p>Official SBI Match Analyst</p><h2>Match Intelligence</h2><small>Deterministic analysis from verified SBI data</small></div>
      </div>

      <section className={styles.matchIntelOverview}>
        <div>
          <span>Projected Edge</span>
          <h3>{overview.favorite}</h3>
          <strong>{overview.probabilities[favoriteIndex]}%</strong>
        </div>
        <dl>
          <div><dt>Expected Points</dt><dd>{score(overview.expectedPoints[favoriteIndex])}</dd></div>
          <div><dt>Confidence</dt><dd>{overview.confidence}</dd></div>
          <div><dt>Prediction Tier</dt><dd>{overview.predictionTier}</dd></div>
          <div><dt>Upset Potential</dt><dd>{overview.upsetPotential}</dd></div>
          <div><dt>Matchup Style</dt><dd>{overview.matchupStyle}</dd></div>
          <div><dt>Halve</dt><dd>{overview.halveProbability}%</dd></div>
        </dl>
      </section>

      <AnalystSection title="Category Breakdown" open>
        <div className={styles.matchIntelCategories}>
          {intelligence.categories.map((item) => (
            <article key={item.id}>
              <div><strong>{item.label}</strong><small>{item.source}</small></div>
              <EdgeBadge edge={item.edge} teamNames={teamNames} />
            </article>
          ))}
        </div>
      </AnalystSection>

      <AnalystSection title="Key Advantages" open>
        <div className={styles.matchIntelTwoColumn}>
          {teamNames.map((name, index) => (
            <article key={name}>
              <h3>{name}</h3>
              <EvidenceList rows={intelligence.advantages[index]} empty="No measurable category advantage." />
            </article>
          ))}
        </div>
      </AnalystSection>

      <AnalystSection title="Key Risks">
        <div className={styles.matchIntelTwoColumn}>
          {teamNames.map((name, index) => (
            <article key={name}>
              <h3>{name}</h3>
              <EvidenceList rows={intelligence.risks[index]} empty="No material risk is supported by the available data." />
            </article>
          ))}
        </div>
      </AnalystSection>

      <AnalystSection title="Swing Factors" open>
        <ol className={styles.analystDrivers}>
          {intelligence.swingFactors.map((factor) => (
            <li key={factor.id}>
              <div><strong>{factor.label}</strong><EdgeBadge edge={factor.edge} teamNames={teamNames} /></div>
              <p>{factor.source} · Projected impact {factor.impact.toFixed(1)} points</p>
            </li>
          ))}
        </ol>
      </AnalystSection>

      <AnalystSection title="Historical Context">
        <dl className={styles.matchIntelHistory}>
          <div><dt>Head-to-head sample</dt><dd>{intelligence.history.headToHeadMatches || "—"}</dd></div>
          <div><dt>Recorded partnerships</dt><dd>{intelligence.history.partnershipRecords.length || "—"}</dd></div>
          <div>
            <dt>Last relevant meeting</dt>
            <dd>{intelligence.history.lastMeeting
              ? `${intelligence.history.lastMeeting.year} · Round ${intelligence.history.lastMeeting.round || "—"} · ${intelligence.history.lastMeeting.result}`
              : "—"}</dd>
          </div>
        </dl>
        {intelligence.history.similarMatch ? (
          <div className={styles.matchIntelSimilar}>
            <span>Most Similar Historical Match</span>
            <strong>{intelligence.history.similarMatch.year} · Round {intelligence.history.similarMatch.round || "—"} · {intelligence.history.similarMatch.format}</strong>
            <p>Winner: {intelligence.history.similarMatch.winner} · Margin: {intelligence.history.similarMatch.margin}</p>
            <small>Historical prediction: {intelligence.history.similarMatch.prediction} · Actual: {intelligence.history.similarMatch.actualResult}</small>
          </div>
        ) : <p>No sufficiently relevant historical match is available.</p>}
      </AnalystSection>

      <AnalystSection title="How We Got Here">
        <p>The values below are the transparent contribution to {teamNames[0]} before the final probability is displayed. Positive values favor {teamNames[0]}; negative values favor {teamNames[1]}.</p>
        <dl className={styles.calibrationGrid}>
          {intelligence.explainPrediction.map((item) => (
            <div key={item.id}><dt>{item.label}</dt><dd>{item.value > 0 ? "+" : ""}{item.value} pts</dd></div>
          ))}
          <div><dt>Final Win Probability</dt><dd>{intelligence.finalProbability}%</dd></div>
        </dl>
      </AnalystSection>

      <AnalystSection title="Official SBI Match Analysis" open>
        <p>{intelligence.analysis}</p>
      </AnalystSection>

      <AnalystSection title="Keys to Victory">
        <div className={styles.matchIntelTwoColumn}>
          {teamNames.map((name, index) => (
            <article key={name}>
              <h3>{name}</h3>
              <ul className={styles.matchIntelEvidence}>
                {intelligence.keysToVictory[index].map((key) => <li key={key}>{key}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </AnalystSection>

      <section className={styles.captainsNotes}>
        <span>Captain&apos;s Notes</span>
        <p>{intelligence.captainsNotes}</p>
      </section>
    </div>
  );
}
