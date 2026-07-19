const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function seedNumber(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomGenerator(seed) {
  let state = seedNumber(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function percentage(count, total) {
  return Number(((count / total) * 100).toFixed(1));
}

function segmentOutcome(total) {
  return total > 0 ? "teamA" : total < 0 ? "teamB" : "halve";
}

function addResult(bucket, key) {
  bucket[key] = (bucket[key] || 0) + 1;
}

function finishingMargin(finalLead, closeHole) {
  if (finalLead === 0) return "Halved";
  const lead = Math.abs(finalLead);
  if (closeHole < 18) return `${lead} & ${18 - closeHole}`;
  return lead === 1 ? "1 Up" : `${lead} Up`;
}

function pointsLabel(teamNames, pointsA) {
  const pointsB = 3 - pointsA;
  const display = (value) => Number.isInteger(value) ? String(value) : `${Math.floor(value)}½`;
  if (pointsA === pointsB) return `${display(pointsA)} – ${display(pointsB)} tie`;
  const winner = pointsA > pointsB ? teamNames[0] : teamNames[1];
  return `${winner} ${display(Math.max(pointsA, pointsB))} – ${display(Math.min(pointsA, pointsB))}`;
}

export function simulateMatch({
  format,
  prediction,
  strokeMaps = { teamA: Array(18).fill(0), teamB: Array(18).fill(0) },
  teamNames = ["Team 1", "Team 2"],
  iterations = 10_000,
  seed = "sbi-simulation",
}) {
  const teamFormat = format !== "SI";
  const random = randomGenerator(seed);
  const decisiveTotal = Math.max(1, prediction.teamA + prediction.teamB);
  const predictedShare = prediction.teamA / decisiveTotal;
  const baseHoleShare = clamp(.5 + (predictedShare - .5) * .35, .30, .70);
  const baseLogOdds = Math.log(baseHoleShare / (1 - baseHoleShare));
  const strokeEdges = Array.from({ length: 18 }, (_, index) =>
    (strokeMaps.teamA?.[index] || 0) - (strokeMaps.teamB?.[index] || 0)
  );
  const averageStrokeEdge = strokeEdges.reduce((sum, value) => sum + value, 0) / 18;
  const segmentCounts = {
    front: { teamA: 0, halve: 0, teamB: 0 },
    back: { teamA: 0, halve: 0, teamB: 0 },
    overall: { teamA: 0, halve: 0, teamB: 0 },
  };
  const resultCounts = {};
  const finishCounts = { early: 0, before17: 0, on18: 0, halved: 0 };
  let expectedA = 0;

  for (let simulation = 0; simulation < iterations; simulation += 1) {
    const holeResults = [];
    let overallLead = 0;
    let closeHole = 18;
    let closeLead = 0;

    for (let hole = 0; hole < 18; hole += 1) {
      const centeredStroke = strokeEdges[hole] - averageStrokeEdge;
      const share = 1 / (1 + Math.exp(-(baseLogOdds + centeredStroke * .55)));
      const halveProbability = clamp((teamFormat ? .44 : .40) - Math.abs(centeredStroke) * .08, .22, .52);
      const teamAProbability = (1 - halveProbability) * share;
      const draw = random();
      const result = draw < teamAProbability ? 1 : draw < teamAProbability + halveProbability ? 0 : -1;
      holeResults.push(result);
      overallLead += result;
      const remaining = 17 - hole;
      if (closeHole === 18 && Math.abs(overallLead) > remaining) {
        closeHole = hole + 1;
        closeLead = overallLead;
      }
    }

    const front = holeResults.slice(0, 9).reduce((sum, value) => sum + value, 0);
    const back = holeResults.slice(9).reduce((sum, value) => sum + value, 0);
    const overall = holeResults.reduce((sum, value) => sum + value, 0);
    const frontOutcome = segmentOutcome(front);
    const backOutcome = segmentOutcome(back);
    const overallOutcome = segmentOutcome(overall);
    segmentCounts.front[frontOutcome] += 1;
    segmentCounts.back[backOutcome] += 1;
    segmentCounts.overall[overallOutcome] += 1;

    if (overall === 0) finishCounts.halved += 1;
    else if (closeHole <= 15) finishCounts.early += 1;
    else if (closeHole < 18) finishCounts.before17 += 1;
    else finishCounts.on18 += 1;

    if (teamFormat) {
      const point = (outcome) => outcome === "teamA" ? 1 : outcome === "halve" ? .5 : 0;
      const pointsA = point(frontOutcome) + point(backOutcome) + point(overallOutcome);
      expectedA += pointsA;
      addResult(resultCounts, String(pointsA));
    } else {
      expectedA += overallOutcome === "teamA" ? 1 : overallOutcome === "halve" ? .5 : 0;
      addResult(resultCounts, finishingMargin(closeHole < 18 ? closeLead : overall, closeHole));
    }
  }

  const segmentProbabilities = Object.fromEntries(
    Object.entries(segmentCounts).map(([key, counts]) => [key, {
      teamA: percentage(counts.teamA, iterations),
      halve: percentage(counts.halve, iterations),
      teamB: percentage(counts.teamB, iterations),
    }])
  );
  const expectedPointsA = expectedA / iterations;
  const maximumPoints = teamFormat ? 3 : 1;
  const likelyResults = Object.entries(resultCounts)
    .map(([key, count]) => ({
      key,
      label: teamFormat ? pointsLabel(teamNames, Number(key)) : key,
      probability: percentage(count, iterations),
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 6);

  return {
    iterations,
    format,
    maximumPoints,
    winProbability: segmentProbabilities.overall,
    segmentProbabilities,
    expectedPoints: {
      teamA: Number(expectedPointsA.toFixed(2)),
      teamB: Number((maximumPoints - expectedPointsA).toFixed(2)),
    },
    likelyResults,
    volatility: {
      early: percentage(finishCounts.early, iterations),
      before17: percentage(finishCounts.before17, iterations),
      on18: percentage(finishCounts.on18, iterations),
      halved: percentage(finishCounts.halved, iterations),
    },
  };
}
