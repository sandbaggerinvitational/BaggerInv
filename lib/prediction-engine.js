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

export function settingsMap(rows) {
  return Object.fromEntries(rows.map((row) => [c(pick(row, "Setting", "Name", "Key")), pick(row, "Value", "Setting Value")]).filter(([k]) => k));
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
  const playerScore = (team) => average(team.map((player) => {
    const stat = historical[player.id] || {};
    const formatRecord = stat.records?.[code] || {};
    return pct(formatRecord) * .35 + pct(stat.records?.overall) * .25 + Math.min(100, ppm(stat.records?.overall) * 100) * .10 + Math.min(100, (stat.records?.overall?.points || 0) * 1.5) * .05 + 50 * .25;
  }));
  const pa = playerScore(teamA), pb = playerScore(teamB);
  const experienceScore = (team) => average(team.map((player) => Math.min(100, (historical[player.id]?.appearances?.length || 0) * 12.5)));
  const experienceProfileA = experienceScore(teamA), experienceProfileB = experienceScore(teamB);
  const experienceA = Math.max(0, Math.min(100, 50 + (experienceProfileA - experienceProfileB) / 2));
  const experienceB = 100 - experienceA;
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
  const ha = Math.max(10, Math.min(90, 50 + strokeDiff * 6)); const hb = 100-ha;
  const category = {
    handicap: n(setting(settings,"Handicap Category Weight",30),30), player:n(setting(settings,"Player Category Weight",30),30),
    team:n(setting(settings,"Team Category Weight",20),20), opponent:n(setting(settings,"Opponent Category Weight",15),15), tournament:n(setting(settings,"Tournament Category Weight",5),5),
  };
  const total = Object.values(category).reduce((a,b)=>a+b,0) || 100;
  const rawA=(ha*category.handicap+pa*category.player+ta*category.team+oa*category.opponent+experienceA*category.tournament)/total;
  const edge=rawA-50;
  const tie=Math.max(6,Math.min(18,14-Math.abs(edge)*.35));
  const max=n(setting(settings,"Maximum Win Probability",90),90); const min=n(setting(settings,"Minimum Win Probability",10),10);
  let a=Math.max(min,Math.min(max,50+edge*(100-tie)/100)); let b=100-tie-a;
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
  return {teamA:roundedA,teamB:roundedB,tie:100-roundedA-roundedB,confidence,factors,components:componentMetrics,contributions,teamVibes:{teamA:vibesA,teamB:vibesB},rawScoreA:rawA,model:setting(settings,"Prediction Model","SBI v1.0")};
}
