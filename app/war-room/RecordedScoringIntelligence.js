"use client";

import styles from "./war-room.module.css";

const value = (number, suffix = "") => Number.isFinite(number) ? `${number.toFixed(1)}${suffix}` : "—";
const sample = (profile) => `Based on ${profile.holes} recorded holes · ${profile.rounds} complete round${profile.rounds === 1 ? "" : "s"} · ${profile.yearsLabel}`;

function IntelligenceSection({ title, preview, children, open = false }) {
  return (
    <details className={styles.scoringIntelSection} open={open}>
      <summary>
        <span><b>{title}</b><small>{preview}</small></span>
        <i aria-hidden="true">+</i>
      </summary>
      <div>{children}</div>
    </details>
  );
}

function ProfileCard({ player, data }) {
  const profile = data.profile;
  return (
    <article className={styles.scoringProfileCard}>
      <header><div><span>Recorded Scoring Profile</span><h3>{player.name}</h3></div><b>{profile.confidence}</b></header>
      <div className={styles.scoringMetricGrid}>
        <div><span>Gross average</span><strong>{value(profile.grossScoringAverage)}</strong></div>
        <div><span>Average to par</span><strong>{value(profile.averageRoundToPar)}</strong></div>
        <div><span>Birdie or better</span><strong>{value(profile.birdieOrBetterPercent, "%")}</strong></div>
        <div><span>Par</span><strong>{value(profile.parPercent, "%")}</strong></div>
        <div><span>Bogey</span><strong>{value(profile.bogeyPercent, "%")}</strong></div>
        <div><span>Double+</span><strong>{value(profile.doubleOrWorsePercent, "%")}</strong></div>
        <div><span>Par 3</span><strong>{value(profile.par3.average)}</strong></div>
        <div><span>Par 4</span><strong>{value(profile.par4.average)}</strong></div>
        <div><span>Par 5</span><strong>{value(profile.par5.average)}</strong></div>
        <div><span>Front nine</span><strong>{value(profile.frontNineAverage)}</strong></div>
        <div><span>Back nine</span><strong>{value(profile.backNineAverage)}</strong></div>
        <div><span>Holes 15–18</span><strong>{value(profile.closingAverage)}</strong></div>
        <div><span>Volatility</span><strong>{value(profile.volatility)}</strong></div>
        <div><span>Consistency</span><strong>{profile.consistencyLabel}</strong></div>
        <div><span>Birdie upside</span><strong>{profile.birdieUpside}</strong></div>
        <div><span>Bogey avoidance</span><strong>{value(profile.bogeyAvoidance, "%")}</strong></div>
        <div><span>Double-bogey risk</span><strong>{profile.doubleBogeyRisk}</strong></div>
        <div><span>Best round</span><strong>{value(profile.bestRound)}</strong></div>
        <div><span>Best nine</span><strong>{value(profile.bestNine)}</strong></div>
      </div>
      <footer>{sample(profile)} · Available scorecard history</footer>
    </article>
  );
}

function CourseFitCard({ player, fit }) {
  return (
    <article className={styles.courseFitCard} data-signal={fit.signal}>
      <header><span>{player.name}</span><b>{fit.signal}</b></header>
      <strong>{fit.signal === "Insufficient Data" ? "Recorded profile unavailable" : `${fit.signal} Course Profile`}</strong>
      {fit.reasons.length ? <ul>{fit.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>More recorded hole data is needed for a responsible course-fit signal.</p>}
      {fit.versusRecordedField !== null ? <p><b>Versus Recorded Field:</b> {Math.abs(fit.versusRecordedField).toFixed(2)} {fit.versusRecordedField <= 0 ? "better" : "worse"} per recorded hole on comparable course-and-tee scorecards.</p> : null}
      <small>Confidence: {fit.confidence} · {fit.courseTeeRounds} round{fit.courseTeeRounds === 1 ? "" : "s"} on this course and tee</small>
    </article>
  );
}

function PartnershipCard({ teamName, partnership, format }) {
  return (
    <article className={styles.partnershipScoringCard}>
      <span>{teamName}</span>
      {partnership?.holes ? <>
        <strong>{format === "SC" ? "Scramble Team Performance" : "Recorded Partnership Scoring"}</strong>
        <dl>
          <div><dt>Recorded holes</dt><dd>{partnership.holes}</dd></div>
          <div><dt>Complete rounds</dt><dd>{partnership.rounds}</dd></div>
          <div><dt>{format === "SC" ? "Team scoring average" : "Recorded scoring average"}</dt><dd>{value(partnership.averageRound)}</dd></div>
          <div><dt>Birdie or better</dt><dd>{value(partnership.birdieOrBetterPercent, "%")}</dd></div>
          <div><dt>Bogey avoidance</dt><dd>{value(partnership.bogeyAvoidancePercent, "%")}</dd></div>
          <div><dt>Volatility</dt><dd>{value(partnership.volatility)}</dd></div>
        </dl>
        <small>{format === "SC" ? "Team-only Scramble scoring; not included in individual averages." : "Only rounds in which these players appeared together."}</small>
      </> : <p>No recorded hole-by-hole rounds together</p>}
    </article>
  );
}

export default function RecordedScoringIntelligence({ intelligence, players, teamNames, format }) {
  if (!intelligence?.available) {
    return <div className={styles.scoringIntelUnavailable}>Recorded scoring intelligence is not available for this matchup.</div>;
  }
  return (
    <section className={styles.scoringIntelligence}>
      <div className={styles.sectionTitle}><span>SC</span><div><p>Available Scorecard History</p><h2>Recorded Scoring Intelligence</h2><small>Descriptive analysis only · Not used in the current win probability</small></div></div>
      {intelligence.incompleteComparison ? <p className={styles.scoringIntelNotice}>Only one side has relevant recorded scoring data. Missing data is treated as unknown, not poor performance.</p> : null}

      <IntelligenceSection title="Recorded Course Fit" preview="Course and tee profile" open>
        <div className={styles.scoringComparisonGrid}>
          {intelligence.profiles.map((item, index) => <CourseFitCard key={item.playerId} player={players[index]} fit={item.courseFit} />)}
        </div>
      </IntelligenceSection>

      <IntelligenceSection title="Scoring Comparison" preview="Individual scoring and risk profile">
        <div className={styles.scoringComparisonGrid}>
          {intelligence.profiles.filter((item) => item.profile.holes).map((item) => {
            const index = players.findIndex((player) => player.id === item.playerId);
            return <ProfileCard key={item.playerId} player={players[index]} data={item} />;
          })}
        </div>
      </IntelligenceSection>

      {format !== "SI" ? <IntelligenceSection title={format === "SC" ? "Scramble Team Performance" : "Partnership Scoring"} preview="Same-pairing rounds only">
        <div className={styles.scoringComparisonGrid}>
          {intelligence.partnerships.map((partnership, index) => <PartnershipCard key={teamNames[index]} teamName={teamNames[index]} partnership={partnership} format={format} />)}
        </div>
      </IntelligenceSection> : null}

      <IntelligenceSection title="Detailed Hole Profile" preview="Par, yardage, nine and closing splits">
        <div className={styles.holeProfileTable}>
          <div><b>Player</b><b>Par 3</b><b>Par 4</b><b>Par 5</b><b>Front</b><b>Back</b><b>Closing</b></div>
          {intelligence.profiles.filter((item) => item.profile.holes).map((item) => {
            const player = players.find((candidate) => candidate.id === item.playerId);
            const profile = item.profile;
            return <div key={item.playerId}><strong>{player?.name}</strong>{[profile.par3, profile.par4, profile.par5, profile.front, profile.back, profile.closing].map((metric, index) => <span key={index}>{value(metric.average)}<small>{metric.holes} holes · {metric.confidence}</small></span>)}</div>;
          })}
        </div>
      </IntelligenceSection>

      {intelligence.insights.length ? <div className={styles.scoringInsights}>
        <span>Key Scorecard Insights</span>
        {intelligence.insights.map((insight) => <article key={`${insight.title}-${insight.body}`}><b>{insight.title}</b><p>{insight.body}</p><small>Confidence: {insight.confidence}</small></article>)}
      </div> : null}
    </section>
  );
}
