import styles from "./war-room.module.css";

const formatName = (code) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[code] || code;
const recordText = (record) => record?.matches ? `${record.wins}-${record.losses}-${record.halves}` : "no recorded matches";

function edgeLabel(edge) {
  if (edge < 3) return "Toss-up";
  if (edge < 8) return "Slight edge";
  if (edge < 16) return "Clear edge";
  if (edge < 26) return "Strong favorite";
  return "Heavy favorite";
}

function evidenceLabel(matches) {
  if (!matches) return "No reliable sample";
  if (matches < 3) return "Limited evidence";
  if (matches < 7) return "Moderate evidence";
  return "Strong evidence";
}

function playerProfile(player, historical, format) {
  const stats = historical[player.id] || {};
  const overall = stats.sandbaggerRatings?.OVERALL || {};
  const byFormat = stats.sandbaggerRatings?.[format] || {};
  const formatMatches = byFormat.matches || stats.records?.[format]?.matches || 0;
  const reliability = Math.min(1, formatMatches / 6);
  const rating = (overall.rating || 1500) + reliability * ((byFormat.rating || overall.rating || 1500) - (overall.rating || 1500));
  return {
    ...player,
    rating,
    overallRating: overall.rating || 1500,
    formatRating: byFormat.rating || overall.rating || 1500,
    formatMatches,
    appearances: stats.appearances?.length || 0,
    record: stats.records?.[format] || stats.records?.overall,
  };
}

function AnalystSection({ title, children, open = false }) {
  return (
    <details className={styles.analystSection} open={open}>
      <summary>{title}<span>+</span></summary>
      <div>{children}</div>
    </details>
  );
}

export default function MatchAnalyst({
  prediction,
  simulation,
  teamNames,
  players,
  historical,
  partnerships,
  format,
  pointsAvailable,
  play,
  strokeMaps,
  holes,
  courseName,
  tee,
  aiBriefing,
  aiError,
  aiLoading,
  aiConfigured,
  onGenerate,
}) {
  const slots = format === "SI" ? 1 : 2;
  const teamPlayers = [players.slice(0, slots), players.slice(slots)];
  const profiles = players.map((player) => playerProfile(player, historical, format));
  const teamProfiles = [profiles.slice(0, slots), profiles.slice(slots)];
  const favoriteIndex = prediction.teamA >= prediction.teamB ? 0 : 1;
  const underdogIndex = 1 - favoriteIndex;
  const probabilities = [prediction.teamA, prediction.teamB];
  const probabilityEdge = Math.abs(prediction.teamA - prediction.teamB);
  const favorite = teamNames[favoriteIndex];
  const underdog = teamNames[underdogIndex];
  const favoriteExpected = simulation
    ? [simulation.expectedPoints.teamA, simulation.expectedPoints.teamB][favoriteIndex]
    : ((probabilities[favoriteIndex] + prediction.tie * .5) / 100) * pointsAvailable;
  const strokeDifference = play.strokesA - play.strokesB;
  const strokeTeamIndex = strokeDifference > 0 ? 0 : strokeDifference < 0 ? 1 : null;
  const volatilityValue = simulation
    ? simulation.volatility.on18 + simulation.volatility.halved
    : prediction.tie;
  const volatility = volatilityValue >= 32 ? "High" : volatilityValue >= 20 ? "Moderate" : "Controlled";

  const rankedDrivers = [...prediction.contributions]
    .filter((driver) => format !== "SI" || driver.id !== "team")
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const factorByLabel = Object.fromEntries((prediction.factors || []).map((factor) => [factor.category.toLowerCase(), factor]));
  const driverEvidence = (driver) => {
    if (driver.id === "team") {
      const matches = prediction.teamVibes.teamA.matches + prediction.teamVibes.teamB.matches;
      return evidenceLabel(matches);
    }
    if (driver.id === "opponent") {
      const detail = factorByLabel["head-to-head"]?.detail || "";
      return /no prior/i.test(detail) ? "No reliable sample" : "Moderate evidence";
    }
    if (driver.id === "player") return evidenceLabel(profiles.reduce((sum, player) => sum + player.formatMatches, 0));
    if (driver.id === "tournament") return evidenceLabel(profiles.reduce((sum, player) => sum + player.appearances, 0));
    return Math.abs(strokeDifference) ? "Strong evidence" : "No net edge";
  };
  const driverSentence = (driver) => {
    const gap = Math.abs(driver.teamA - driver.teamB);
    if (driver.id === "team" && !prediction.teamVibes.teamA.known && !prediction.teamVibes.teamB.known) return "Neither pairing has a recorded shared-match sample.";
    if (driver.id === "opponent" && driverEvidence(driver) === "No reliable sample") return "No dependable direct-matchup history is available.";
    if (gap < .5) return "The available evidence does not separate the two sides.";
    const beneficiary = driver.teamA > driver.teamB ? teamNames[0] : teamNames[1];
    const strength = gap >= 24 ? "strong" : gap >= 12 ? "moderate" : "slight";
    return `${beneficiary} holds a ${strength} ${driver.label.toLowerCase()} advantage.`;
  };

  const strongest = [...profiles].sort((a, b) => b.rating - a.rating)[0];
  const counter = [...teamProfiles[underdogIndex]].sort((a, b) => b.rating - a.rating)[0];
  const uncertainty = [...profiles].sort((a, b) => a.formatMatches - b.formatMatches || a.appearances - b.appearances)[0];
  const strongestTeam = teamProfiles.findIndex((team) => team.includes(strongest));
  const ratingGap = strongest && counter ? Math.round(strongest.rating - counter.rating) : 0;

  const chemistry = teamPlayers.map((pair, index) => {
    if (format === "SI") return null;
    const key = pair.map((player) => player.id).sort().join("|");
    const history = partnerships[key];
    const vibes = index === 0 ? prediction.teamVibes.teamA : prediction.teamVibes.teamB;
    return { pair, history, vibes };
  });

  const netStrokeHoles = strokeMaps
    ? holes.map((hole, index) => ({
        hole: Number(hole.Hole || hole["Hole Number"] || index + 1),
        difference: (strokeMaps.team1?.[index] || 0) - (strokeMaps.team2?.[index] || 0),
      })).filter((hole) => hole.difference)
    : [];
  const frontDifference = netStrokeHoles.filter((hole) => hole.hole <= 9).reduce((sum, hole) => sum + hole.difference, 0);
  const backDifference = netStrokeHoles.filter((hole) => hole.hole > 9).reduce((sum, hole) => sum + hole.difference, 0);
  const strokeHoles = netStrokeHoles.map((hole) => hole.hole).join(", ");

  const favoriteDrivers = rankedDrivers.filter((driver) => driver.side === (favoriteIndex === 0 ? "A" : "B"));
  const opponentDrivers = rankedDrivers.filter((driver) => driver.side === (favoriteIndex === 0 ? "B" : "A"));
  const leadReason = favoriteDrivers.slice(0, 2).map((driver) => driver.label.toLowerCase()).join(" and ") || "the combined weighted profile";
  const counterReason = opponentDrivers.slice(0, 2).map((driver) => driver.label.toLowerCase()).join(" and ");

  return (
    <div className={styles.analystReport}>
      <div className={styles.sectionTitle}><span>SBI</span><div><p>SBI Match Analyst</p><h2>The official scouting report</h2></div></div>

      <div className={styles.analystKeyNumbers}>
        <span>Key Numbers</span>
        <dl>
          <div><dt>Favorite</dt><dd>{favorite}</dd></div>
          <div><dt>Win probability</dt><dd>{probabilities[favoriteIndex].toFixed(1)}%</dd></div>
          <div><dt>Halve probability</dt><dd>{prediction.tie.toFixed(1)}%</dd></div>
          <div><dt>Expected points</dt><dd>{favoriteExpected.toFixed(2)} / {pointsAvailable.toFixed(2)}</dd></div>
          <div><dt>Match stroke edge</dt><dd>{strokeTeamIndex === null ? "Even" : `${teamNames[strokeTeamIndex]} +${Math.abs(strokeDifference)}`}</dd></div>
          <div><dt>Confidence</dt><dd>{prediction.confidence}</dd></div>
          <div><dt>Volatility</dt><dd>{volatility}</dd></div>
        </dl>
      </div>

      <AnalystSection title="The Verdict" open>
        <p><strong>{edgeLabel(probabilityEdge)} — {favorite}.</strong> {favorite} projects at {probabilities[favoriteIndex].toFixed(1)}% against {probabilities[underdogIndex].toFixed(1)}% for {underdog}, with a {prediction.tie.toFixed(1)}% halve probability.</p>
        <p>{counterReason ? `Although ${underdog} owns the better ${counterReason}, ` : ""}{favorite} remains favored because {leadReason} carries more weight in the current calculation. The {probabilityEdge.toFixed(1)}-point win-probability gap is {probabilityEdge < 8 ? "competitive rather than decisive" : probabilityEdge < 16 ? "meaningful without making this a mismatch" : "substantial across the current inputs"}.</p>
      </AnalystSection>

      <AnalystSection title="Why the Model Leans" open>
        <ol className={styles.analystDrivers}>
          {rankedDrivers.map((driver) => (
            <li key={driver.id}>
              <div><strong>{driver.label}</strong><b>{driverEvidence(driver)}</b></div>
              <p>{driverSentence(driver)}</p>
            </li>
          ))}
        </ol>
      </AnalystSection>

      <AnalystSection title="Player Impact">
        <p><strong>{strongest.name}</strong> is the highest-rated player in this matchup and supplies {teamNames[strongestTeam]} with the strongest individual baseline for {formatName(format)}.</p>
        <p><strong>{counter.name}</strong> is {underdog}’s strongest counter{ratingGap > 0 ? `, sitting about ${ratingGap} blended rating points behind the matchup leader` : " on the available blended ratings"}. <strong>{uncertainty.name}</strong> is the biggest uncertainty because {evidenceLabel(uncertainty.formatMatches).toLowerCase()} supports that player’s format profile.</p>
      </AnalystSection>

      {format !== "SI" ? <AnalystSection title="Pairing Chemistry">
        {chemistry.map(({ pair, history, vibes }, index) => (
          <p key={teamNames[index]}><strong>{pair.map((player) => player.name).join(" and ")}</strong> carry a Team Vibes score of {vibes.known ? Math.round(vibes.score) : "unknown"}. {history?.record?.matches ? `Their shared record is ${recordText(history.record)} across ${history.record.matches} matches, with ${vibes.sameFormatMatches} in ${formatName(format)}. ${evidenceLabel(history.record.matches)}.` : "There is no recorded shared-match history, so chemistry is an uncertainty rather than a neutral advantage."}</p>
        ))}
      </AnalystSection> : null}

      <AnalystSection title="Stroke Story">
        <p>{strokeTeamIndex === null ? `The match is played without a net stroke advantage at ${courseName} from the ${tee} tees.` : `${teamNames[strokeTeamIndex]} receive ${Math.abs(strokeDifference)} effective ${Math.abs(strokeDifference) === 1 ? "stroke" : "strokes"}${strokeHoles ? ` on ${strokeHoles.includes(",") ? "holes" : "hole"} ${strokeHoles}` : ""}.`}</p>
        <p>{strokeTeamIndex === null ? "Handicap does not move the projection toward either side." : `${Math.abs(frontDifference)} net ${Math.abs(frontDifference) === 1 ? "stroke falls" : "strokes fall"} on the front nine and ${Math.abs(backDifference)} on the back. ${opponentDrivers.some((driver) => driver.id === "handicap") ? "The stroke allocation improves the underdog’s route into the match but does not erase the favorite’s stronger weighted advantages." : "The allocation reinforces the projected favorite rather than creating the edge by itself."}`}</p>
      </AnalystSection>

      <AnalystSection title="Projected Match Flow">
        {simulation ? <>
          {format !== "SI" ? <p>The front nine gives {simulation.segmentProbabilities.front.teamA >= simulation.segmentProbabilities.front.teamB ? teamNames[0] : teamNames[1]} the higher segment win probability, while the back nine leans {simulation.segmentProbabilities.back.teamA >= simulation.segmentProbabilities.back.teamB ? teamNames[0] : teamNames[1]}.</p> : <p>Across the full 18-hole singles match, {simulation.winProbability.teamA >= simulation.winProbability.teamB ? teamNames[0] : teamNames[1]} owns the higher simulated win rate.</p>}
          <p>The most likely result is <strong>{simulation.likelyResults[0]?.label}</strong>. {simulation.volatility.on18.toFixed(1)}% reach the 18th hole, {simulation.volatility.before17.toFixed(1)}% close on 16 or 17, and {simulation.volatility.halved.toFixed(1)}% finish halved.</p>
        </> : <p>Run the 10,000-match simulation to generate projected match flow, finish-hole outlook, and the most likely result.</p>}
      </AnalystSection>

      <AnalystSection title="Upset Path">
        <p>{underdog}’s clearest path is to press its {opponentDrivers[0]?.label.toLowerCase() || "best available counter-edge"}{strokeTeamIndex === underdogIndex && strokeHoles ? `, convert the stroke opportunity on ${strokeHoles.includes(",") ? "holes" : "hole"} ${strokeHoles}` : ""}, and keep {favorite} from converting its {favoriteDrivers[0]?.label.toLowerCase() || "primary advantage"} into early separation.</p>
        {simulation ? <p>With {simulation.volatility.on18.toFixed(1)}% of simulations reaching 18, extending the match into the closing holes is the higher-variance route.</p> : null}
      </AnalystSection>

      <AnalystSection title="Favorite’s Failure Point">
        <p>{favorite} is most vulnerable if its {favoriteDrivers[0]?.label.toLowerCase() || "leading profile"} fails to translate into won holes while {underdog} converts {opponentDrivers[0]?.label.toLowerCase() || "its strongest counter"}. {prediction.teamVibes?.[favoriteIndex === 0 ? "teamA" : "teamB"]?.known ? "Its pairing history provides some support, but does not remove that pressure point." : "The lack of a reliable shared-match sample adds uncertainty to the favorite’s baseline."}</p>
      </AnalystSection>

      <AnalystSection title="Captain’s Moves" open>
        <div className={styles.captainMoves}>
          <p><strong>Captain’s Move — {teamNames[0]}</strong> Use {teamProfiles[0].sort((a, b) => b.rating - a.rating)[0].name} as the primary {formatName(format)} scoring anchor and manage the match around {rankedDrivers.find((driver) => driver.side === "A")?.label.toLowerCase() || "the side’s strongest measured advantage"}. Do not change the selected lineup without optimizer evidence.</p>
          <p><strong>Captain’s Move — {teamNames[1]}</strong> Build the plan around {teamProfiles[1].sort((a, b) => b.rating - a.rating)[0].name} and protect {rankedDrivers.find((driver) => driver.side === "B")?.label.toLowerCase() || "the side’s strongest measured counter"}. Keep the pairing intact unless the Lineup Optimizer identifies a clearly stronger option.</p>
        </div>
      </AnalystSection>

      <div className={styles.aiActions}>
        <button type="button" onClick={onGenerate} disabled={aiLoading || !aiConfigured}>{aiLoading ? "Analyzing matchup…" : !aiConfigured ? "Analyst setup required" : aiBriefing ? "Refresh analyst briefing" : "Generate analyst briefing"}</button>
        <small>{aiConfigured ? "Generate an additional SBI analytics-desk read from these same verified matchup numbers." : "Add OPENAI_API_KEY in Vercel Production Environment Variables and redeploy to enable generated analyst notes."}</small>
      </div>
      {aiBriefing ? <div className={styles.generatedAnalystNotes}><span>Generated Analyst Notes</span>{aiBriefing.split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div> : null}
      {aiError ? <div className={styles.aiError}>{aiError} The deterministic scouting report remains available.</div> : null}
    </div>
  );
}
