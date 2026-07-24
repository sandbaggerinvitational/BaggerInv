const c = (value) => String(value ?? "").trim();
const n = (value, fallback = null) => {
  const normalized = c(value)
    .replace(/[−–—]/g, "-")
    .replace(/[%,$]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const key = (value) => c(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function pick(row, ...names) {
  if (!row) return "";
  const entries = Object.entries(row);
  const normalized = Object.fromEntries(entries.map(([k, v]) => [key(k), v]));
  const compact = Object.fromEntries(entries.map(([k, v]) => [key(k).replace(/\s+/g, ""), v]));
  for (const name of names) {
    const normalizedName = key(name);
    const value = normalized[normalizedName] ?? compact[normalizedName.replace(/\s+/g, "")];
    if (c(value)) return value;
  }
  return "";
}

const SETTING_ALIASES = {
  "Format Win Percentage": "Player - Format Win Percentage Weight",
  "Overall Win Percentage": "Player - Overall Win Percentage Weight",
  "Recent Form": "Player - Recent Form Weight",
  "Average Points Per Match": "Player - Average Points Per Match Weight",
  "Career Points": "Player - Career Points Weight",
  "Tournament Experience": "Player - Tournament Experience Weight",
  "Sandbagger Rating": "Player - Sandbagger Rating Weight",
  "Net Stroke Advantage": "Handicap - Net Stroke Advantage Weight",
  "Front 9 Stroke Advantage": "Handicap - Front 9 Stroke Advantage Weight",
  "Back 9 Stroke Advantage": "Handicap - Back 9 Stroke Advantage Weight",
  "Stroke Hole Distribution": "Handicap - Stroke Hole Distribution Weight",
};

export function settingsMap(rows) {
  const mapped = Object.fromEntries(rows.map((row) => [c(pick(row, "Setting", "Name", "Key")), pick(row, "Value", "Setting Value")]).filter(([k]) => k));
  for (const [canonical, sheetName] of Object.entries(SETTING_ALIASES)) {
    if (!c(mapped[canonical]) && c(mapped[sheetName])) mapped[canonical] = mapped[sheetName];
  }
  const legacyProfile = [
    ["Handicap Category Weight", 15],
    ["Player Category Weight", 35],
    ["Team Category Weight", 30],
    ["Opponent Category Weight", 15],
    ["Tournament Category Weight", 5],
    ["Better Player Handicap Difference", 2],
    ["Lesser Player Handicap Difference", 2],
  ].every(([name, value]) => n(mapped[name]) === value);
  if (legacyProfile) {
    for (const [name, value] of Object.entries(PREDICTION_SETTING_DEFAULTS)) mapped[name] = value;
    mapped["Prediction Calibration Profile"] = "Recalibrated v2";
  }
  return mapped;
}
export function setting(settings, name, fallback) {
  const value = settings[name];
  const numeric = n(value);
  return numeric === null ? (c(value) || fallback) : numeric;
}
export function courseHandicap(index, rating, slope, par) {
  const i = n(index, 0), r = n(rating, 0), s = n(slope, 113), p = n(par, 72);
  const rounded = Math.round(i * (s / 113) + (r - p));
  return Object.is(rounded, -0) ? 0 : rounded;
}
export function formatCode(value) {
  const v = c(value).toUpperCase();
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(v)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(v)) return "SC";
  return "SI";
}
export function playingHandicaps(format, handicaps) {
  const code = formatCode(format);
  if (code === "SC") {
    const team = (pair) => Math.round(Math.min(...pair) * .35 + Math.max(...pair) * .15);
    const a = team(handicaps.slice(0, 2)); const b = team(handicaps.slice(2, 4)); const low = Math.min(a, b);
    return { raw: handicaps, teamA: a, teamB: b, strokesA: a - low, strokesB: b - low, playerStrokes: [0,0,0,0] };
  }
  if (code === "SI") {
    const low = Math.min(handicaps[0], handicaps[1]);
    return { raw: handicaps, teamA: handicaps[0], teamB: handicaps[1], strokesA: handicaps[0]-low, strokesB: handicaps[1]-low, playerStrokes: [handicaps[0]-low, handicaps[1]-low] };
  }
  const low = Math.min(...handicaps);
  const playerStrokes = handicaps.map((hcp) => Math.round((hcp - low) * .9));
  // In four-ball, each player receives strokes individually and only the best
  // net ball counts. Summing both partners inflates the apparent team edge.
  // Use the strongest active stroke profile on each side for prediction and
  // front/back edge summaries, while preserving every player's allocation.
  const effectiveA = Math.max(playerStrokes[0], playerStrokes[1]);
  const effectiveB = Math.max(playerStrokes[2], playerStrokes[3]);
  return { raw: handicaps, teamA: effectiveA, teamB: effectiveB, strokesA: effectiveA, strokesB: effectiveB, playerStrokes };
}
export function allocateStrokes(strokes, holes) {
  const count = Math.max(0, Math.round(n(strokes, 0)));
  const result = Array(18).fill(0);
  const ordered = [...holes].sort((a,b) => n(pick(a,"Stroke Index","Handicap","HCP"),99)-n(pick(b,"Stroke Index","Handicap","HCP"),99));
  for (let pass = 0; pass < Math.ceil(count / 18); pass += 1) {
    for (let i = 0; i < Math.min(18, count - pass * 18); i += 1) {
      const hole = n(pick(ordered[i], "Hole", "Hole Number"), i + 1) - 1;
      if (hole >= 0 && hole < 18) result[hole] += 1;
    }
  }
  return result;
}
const pct = (record) => record?.matches ? ((record.wins + record.halves * .5) / record.matches) * 100 : 50;
const ppm = (record) => record?.matches ? record.points / record.matches : .5;
const average = (values) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 50;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const PREDICTION_SETTING_DEFAULTS = Object.freeze({
  "Handicap Category Weight": 12,
  "Player Category Weight": 42,
  "Team Category Weight": 28,
  "Opponent Category Weight": 13,
  "Tournament Category Weight": 5,
  "Format Win Percentage": 28,
  "Overall Win Percentage": 22,
  "Recent Form": 15,
  "Average Points Per Match": 10,
  "Career Points": 5,
  "Tournament Experience": 5,
  "Sandbagger Rating": 15,
  "Net Stroke Advantage": 20,
  "Front 9 Stroke Advantage": 27,
  "Back 9 Stroke Advantage": 27,
  "Stroke Hole Distribution": 26,
  "Better Player Handicap Difference": 5,
  "Lesser Player Handicap Difference": 1,
  "Underlying Skill Points Per Handicap": .5,
  "Maximum Underlying Skill Adjustment": 8,
});

function configuredWeight(settings, name) {
  return n(setting(settings, name, PREDICTION_SETTING_DEFAULTS[name]), PREDICTION_SETTING_DEFAULTS[name]);
}

function pairedScore(valueA, valueB, smoothing = 0) {
  const a = Math.max(0, n(valueA, 0)) + smoothing;
  const b = Math.max(0, n(valueB, 0)) + smoothing;
  return a + b ? (a / (a + b)) * 100 : 50;
}

function recentForm(stats) {
  const seasons = (stats?.seasons || [])
    .filter((season) => season?.overall?.matches)
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 2);
  if (!seasons.length) return pct(stats?.records?.overall);
  const combined = seasons.reduce((record, season) => ({
    matches: record.matches + season.overall.matches,
    wins: record.wins + season.overall.wins,
    halves: record.halves + season.overall.halves,
  }), { matches: 0, wins: 0, halves: 0 });
  return pct(combined);
}

function teamMetric(team, historical, metric) {
  return average(team.map((player) => metric(historical[player.id] || {})));
}

function sideUnderlyingHandicap(values, betterWeight, lesserWeight) {
  const valid = values.map((value) => n(value)).filter((value) => value !== null).sort((a, b) => a - b);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  const total = betterWeight + lesserWeight;
  return total ? (valid[0] * betterWeight + valid.at(-1) * lesserWeight) / total : average(valid);
}

export function underlyingSkillAdjustment(handicap, settings = {}) {
  const raw = Array.isArray(handicap?.raw) ? handicap.raw : [];
  const split = raw.length > 2 ? Math.ceil(raw.length / 2) : 1;
  const betterWeight = configuredWeight(settings, "Better Player Handicap Difference");
  const lesserWeight = configuredWeight(settings, "Lesser Player Handicap Difference");
  const teamAIndex = sideUnderlyingHandicap(raw.slice(0, split), betterWeight, lesserWeight);
  const teamBIndex = sideUnderlyingHandicap(raw.slice(split), betterWeight, lesserWeight);
  if (teamAIndex === null || teamBIndex === null) {
    return { teamAIndex, teamBIndex, handicapDifference: 0, teamA: 0 };
  }
  const difference = teamBIndex - teamAIndex;
  const pointsPerIndex = configuredWeight(settings, "Underlying Skill Points Per Handicap");
  const cap = Math.abs(configuredWeight(settings, "Maximum Underlying Skill Adjustment"));
  return {
    teamAIndex,
    teamBIndex,
    handicapDifference: difference,
    teamA: clamp(difference * pointsPerIndex, -cap, cap),
  };
}

export function teamVibesForPlayers(format, playerIds, partnership) {
  const code = formatCode(format);
  if (code === "SI" || playerIds.length < 2) {
    return { score: 50, known: false, matches: 0, sameFormatMatches: 0, overallScore: 50, sameFormatScore: 50 };
  }
  const history = partnership[[...playerIds].sort().join("|")];
  const overall = history?.record;
  const sameFormat = history?.byFormat?.[code];
  const overallMatches = overall?.matches || 0;
  const sameFormatMatches = sameFormat?.matches || 0;
  const overallScore = pct(overall);
  const sameFormatScore = pct(sameFormat);
  let score = 50;
  if (sameFormatMatches && overallMatches) score = sameFormatScore * .65 + overallScore * .35;
  else if (sameFormatMatches) score = sameFormatScore;
  else if (overallMatches) score = overallScore;
  return {
    score,
    known: overallMatches > 0,
    matches: overallMatches,
    sameFormatMatches,
    overallScore,
    sameFormatScore,
  };
}

export function teamVibesTier(vibes) {
  if (!vibes?.known) return { label: "Unknown", icon: "🤔" };
  if (vibes.score >= 85) return { label: "Elite", icon: "🔥" };
  if (vibes.score >= 65) return { label: "Good", icon: "🙂" };
  if (vibes.score >= 45) return { label: "Developing", icon: "😐" };
  return { label: "Risky", icon: "⚠️" };
}

export function predict({ format, players, historical, partnership, headToHead, handicap, settings, teamNames = ["Team 1", "Team 2"] }) {
  const code = formatCode(format);
  const teamA = code === "SI" ? players.slice(0,1) : players.slice(0,2);
  const teamB = code === "SI" ? players.slice(1,2) : players.slice(2,4);
  const sandbaggerScore = (team) => average(team.map((player) => {
    const ratings = historical[player.id]?.sandbaggerRatings || {};
    const overall = ratings.OVERALL?.rating || 1500;
    const formatRating = ratings[code];
    const reliability = Math.min(1, (formatRating?.matches || 0) / 6);
    const blended = overall + reliability * ((formatRating?.rating || overall) - overall);
    return 100 / (1 + Math.pow(10, (1500 - blended) / 400));
  }));
  const sbrA = sandbaggerScore(teamA), sbrB = sandbaggerScore(teamB);
  const averageAppearances = (team) => average(team.map((player) => historical[player.id]?.appearances?.length || 0));
  const appearancesA = averageAppearances(teamA), appearancesB = averageAppearances(teamB);
  const experienceA = Math.max(0, Math.min(100, 50 + (50 * (appearancesA - appearancesB)) / (appearancesA + appearancesB + 4)));
  const experienceB = 100 - experienceA;
  const playerComponents = {
    formatWinPercentage: pairedScore(
      teamMetric(teamA, historical, (stats) => pct(stats.records?.[code])),
      teamMetric(teamB, historical, (stats) => pct(stats.records?.[code]))
    ),
    overallWinPercentage: pairedScore(
      teamMetric(teamA, historical, (stats) => pct(stats.records?.overall)),
      teamMetric(teamB, historical, (stats) => pct(stats.records?.overall))
    ),
    recentForm: pairedScore(
      teamMetric(teamA, historical, recentForm),
      teamMetric(teamB, historical, recentForm)
    ),
    averagePointsPerMatch: pairedScore(
      teamMetric(teamA, historical, (stats) => ppm(stats.records?.overall)),
      teamMetric(teamB, historical, (stats) => ppm(stats.records?.overall)),
      .25
    ),
    careerPoints: pairedScore(
      teamMetric(teamA, historical, (stats) => stats.records?.overall?.points || 0),
      teamMetric(teamB, historical, (stats) => stats.records?.overall?.points || 0),
      3
    ),
    tournamentExperience: experienceA,
    sandbaggerRating: pairedScore(sbrA, sbrB),
  };
  const playerWeights = {
    formatWinPercentage: configuredWeight(settings, "Format Win Percentage"),
    overallWinPercentage: configuredWeight(settings, "Overall Win Percentage"),
    recentForm: configuredWeight(settings, "Recent Form"),
    averagePointsPerMatch: configuredWeight(settings, "Average Points Per Match"),
    careerPoints: configuredWeight(settings, "Career Points"),
    tournamentExperience: configuredWeight(settings, "Tournament Experience"),
    sandbaggerRating: configuredWeight(settings, "Sandbagger Rating"),
  };
  const playerWeightTotal = Object.values(playerWeights).reduce((sum, value) => sum + value, 0) || 100;
  const pa = Object.entries(playerComponents).reduce((sum, [id, value]) => sum + value * playerWeights[id], 0) / playerWeightTotal;
  const pb = 100 - pa;
  const vibesA = teamVibesForPlayers(code, teamA.map(p=>p.id), partnership);
  const vibesB = teamVibesForPlayers(code, teamB.map(p=>p.id), partnership);
  const ta = vibesA.score, tb = vibesB.score;
  const h2hMetric = (aIds,bIds) => {
    const values=[];
    for (const a of aIds) for (const b of bIds) {
      const h = headToHead[[a,b].sort().join("|")]; if (!h) continue;
      const direct = a < b ? pct(h.overall) : 100-pct(h.overall);
      const fr = a < b ? pct(h.byFormat?.[code]) : 100-pct(h.byFormat?.[code]);
      values.push(fr*.65+direct*.35);
    }
    return average(values);
  };
  const oa = h2hMetric(teamA.map(p=>p.id),teamB.map(p=>p.id)); const ob=100-oa;
  const strokeDiff = handicap.strokesA - handicap.strokesB;
  const frontDifference = n(handicap.frontStrokesA, Math.ceil(Math.abs(handicap.strokesA || 0) / 2))
    - n(handicap.frontStrokesB, Math.ceil(Math.abs(handicap.strokesB || 0) / 2));
  const backDifference = n(handicap.backStrokesA, Math.floor(Math.abs(handicap.strokesA || 0) / 2))
    - n(handicap.backStrokesB, Math.floor(Math.abs(handicap.strokesB || 0) / 2));
  const distributionDifference = n(handicap.distributionAdvantageA, strokeDiff);
  const handicapComponents = {
    netStrokeAdvantage: clamp(50 + strokeDiff * 2, 15, 85),
    front9StrokeAdvantage: clamp(50 + frontDifference * 3, 15, 85),
    back9StrokeAdvantage: clamp(50 + backDifference * 3, 15, 85),
    strokeHoleDistribution: clamp(50 + distributionDifference * 1.5, 20, 80),
  };
  const handicapWeights = {
    netStrokeAdvantage: configuredWeight(settings, "Net Stroke Advantage"),
    front9StrokeAdvantage: configuredWeight(settings, "Front 9 Stroke Advantage"),
    back9StrokeAdvantage: configuredWeight(settings, "Back 9 Stroke Advantage"),
    strokeHoleDistribution: configuredWeight(settings, "Stroke Hole Distribution"),
  };
  const handicapWeightTotal = Object.values(handicapWeights).reduce((sum, value) => sum + value, 0) || 100;
  const ha = Object.entries(handicapComponents).reduce((sum, [id, value]) => sum + value * handicapWeights[id], 0) / handicapWeightTotal;
  const hb = 100-ha;
  const category = {
    handicap: configuredWeight(settings, "Handicap Category Weight"),
    player: configuredWeight(settings, "Player Category Weight"),
    team: configuredWeight(settings, "Team Category Weight"),
    opponent: configuredWeight(settings, "Opponent Category Weight"),
    tournament: configuredWeight(settings, "Tournament Category Weight"),
  };
  const total = Object.values(category).reduce((a,b)=>a+b,0) || 100;
  const rawA=(ha*category.handicap+pa*category.player+ta*category.team+oa*category.opponent+experienceA*category.tournament)/total;
  const edge=rawA-50;
  const tie=Math.max(6,Math.min(18,14-Math.abs(edge)*.35));
  const max=n(setting(settings,"Maximum Win Probability",90),90); const min=n(setting(settings,"Minimum Win Probability",10),10);
  const probabilityBeforeSkillAdjustment = 50+edge*(100-tie)/100;
  const skill = underlyingSkillAdjustment(handicap, settings);
  const probabilityAfterSkillAdjustment = probabilityBeforeSkillAdjustment + skill.teamA;
  let a=Math.max(min,Math.min(max,probabilityAfterSkillAdjustment)); let b=100-tie-a;
  if (b<min){b=min;a=100-tie-b;} if(a<min){a=min;b=100-tie-a;}
  const sample = teamA.concat(teamB).reduce((sum,p)=>sum+(historical[p.id]?.records?.overall?.matches||0),0);
  const full=n(setting(settings,"Minimum Matches for Full Confidence",8),8)*players.length;
  const confidence=sample>=full?"High":sample>=full*.5?"Medium":"Low";
  const formatLabel = code === "BB" ? "Best Ball" : code === "SC" ? "Scramble" : "Singles";
  const edgePhrase = (difference) => {
    const gap = Math.abs(difference);
    if (gap < 0.5) return "No measurable edge";
    if (gap < 5) return "Slight edge";
    if (gap < 12) return "Moderate edge";
    return "Strong edge";
  };
  const factors=[
    {category:"Handicap edge", detail:strokeDiff === 0 ? "No net stroke edge" : `${strokeDiff > 0 ? teamNames[0] : teamNames[1]} (+${Math.abs(strokeDiff)} ${Math.abs(strokeDiff) === 1 ? "stroke" : "strokes"})`, side:strokeDiff===0?"neutral":strokeDiff>0?"A":"B"},
    {category:`${formatLabel} history`, detail:Math.abs(pa-pb)<0.5?"No measurable edge":`${pa>=pb?teamNames[0]:teamNames[1]} · ${edgePhrase(pa-pb)}`,side:Math.abs(pa-pb)<0.5?"neutral":pa>=pb?"A":"B"},
    {category:"Head-to-head", detail:Math.abs(oa-ob)<0.5?"No prior or measurable edge":`${oa>=ob?teamNames[0]:teamNames[1]} · ${edgePhrase(oa-ob)}`,side:Math.abs(oa-ob)<0.5?"neutral":oa>=ob?"A":"B"},
  ];
  if(code!=="SI") factors.push({category:"Team Vibes",detail:!vibesA.known&&!vibesB.known?"No pairing history yet":Math.abs(ta-tb)<0.5?"No measurable edge":`${ta>=tb?teamNames[0]:teamNames[1]} · ${edgePhrase(ta-tb)}`,side:Math.abs(ta-tb)<0.5?"neutral":ta>tb?"A":"B"});
  factors.push({category:"Tournament Experience",detail:Math.abs(experienceA-experienceB)<0.5?"Equal recorded appearances":`${experienceA>experienceB?teamNames[0]:teamNames[1]} · ${edgePhrase(experienceA-experienceB)}`,side:Math.abs(experienceA-experienceB)<0.5?"neutral":experienceA>experienceB?"A":"B"});

  const componentMetrics = { handicap:[ha,hb], player:[pa,pb], team:[ta,tb], opponent:[oa,ob], tournament:[experienceA,experienceB] };
  const categoryLabels = { handicap:"Handicap Edge", player:"Player Strength", team:code === "SI" ? "Team Vibes (N/A)" : "Team Vibes", opponent:"Head-to-Head", tournament:"Tournament Experience" };
  const contributions = Object.keys(category).map((id) => {
    const metric = componentMetrics[id][0];
    const impact = ((metric - 50) * category[id]) / total;
    return {
      id,
      label:categoryLabels[id],
      weight:category[id],
      teamA:componentMetrics[id][0],
      teamB:componentMetrics[id][1],
      impact,
      side:Math.abs(impact)<0.05?"neutral":impact>0?"A":"B",
      advantage:Math.abs(impact)<0.05?"Even":impact>0?teamNames[0]:teamNames[1],
    };
  });
  const roundedA = Math.round(a);
  const roundedB = Math.round(b);
  return {
    teamA:roundedA,
    teamB:roundedB,
    tie:100-roundedA-roundedB,
    confidence,
    factors,
    components:componentMetrics,
    componentDetails:{ player:playerComponents, handicap:handicapComponents },
    componentWeights:{ player:playerWeights, handicap:handicapWeights, category },
    contributions,
    teamVibes:{teamA:vibesA,teamB:vibesB},
    rawScoreA:rawA,
    calibration:{
      probabilityBeforeSkillAdjustment,
      underlyingSkillAdjustment:skill.teamA,
      probabilityAfterSkillAdjustment,
      finalCappedProbability:a,
      teamAUnderlyingHandicap:skill.teamAIndex,
      teamBUnderlyingHandicap:skill.teamBIndex,
      handicapDifference:skill.handicapDifference,
    },
    model:setting(settings,"Prediction Model","SBI v1.0"),
  };
}
