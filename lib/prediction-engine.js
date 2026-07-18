const c = (value) => String(value ?? "").trim();
const n = (value, fallback = null) => {
  const parsed = Number.parseFloat(c(value).replace(/[%,$]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const key = (value) => c(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function pick(row, ...names) {
  if (!row) return "";
  const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [key(k), v]));
  for (const name of names) {
    const value = normalized[key(name)];
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
  return Math.round(i * (s / 113) + (r - p));
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
  return { raw: handicaps, teamA: 0, teamB: 0, strokesA: playerStrokes[0]+playerStrokes[1], strokesB: playerStrokes[2]+playerStrokes[3], playerStrokes };
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

export function predict({ format, players, historical, partnership, headToHead, handicap, settings, teamNames = ["Team 1", "Team 2"] }) {
  const code = formatCode(format);
  const teamA = code === "SI" ? players.slice(0,1) : players.slice(0,2);
  const teamB = code === "SI" ? players.slice(1,2) : players.slice(2,4);
  const playerScore = (team) => average(team.map((player) => {
    const stat = historical[player.id] || {};
    const formatRecord = stat.records?.[code] || {};
    return pct(formatRecord) * .30 + pct(stat.records?.overall) * .20 + Math.min(100, ppm(stat.records?.overall) * 100) * .10 + Math.min(100, (stat.appearances?.length || 0) * 12.5) * .05 + Math.min(100, (stat.records?.overall?.points || 0) * 1.5) * .05 + 50 * .30;
  }));
  const pa = playerScore(teamA), pb = playerScore(teamB);
  const teamMetric = (ids) => {
    if (ids.length < 2) return 50;
    const p = partnership[[...ids].sort().join("|")];
    return p ? pct(p.record) * .60 + Math.min(100, ppm(p.record) * 100) * .40 : 50;
  };
  const ta = teamMetric(teamA.map(p=>p.id)), tb = teamMetric(teamB.map(p=>p.id));
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
  const rawA=(ha*category.handicap+pa*category.player+ta*category.team+oa*category.opponent+50*category.tournament)/total;
  const edge=rawA-50;
  const tie=Math.max(6,Math.min(18,14-Math.abs(edge)*.35));
  const max=n(setting(settings,"Maximum Win Probability",90),90); const min=n(setting(settings,"Minimum Win Probability",10),10);
  let a=Math.max(min,Math.min(max,50+edge*(100-tie)/100)); let b=100-tie-a;
  if (b<min){b=min;a=100-tie-b;} if(a<min){a=min;b=100-tie-a;}
  const sample = teamA.concat(teamB).reduce((sum,p)=>sum+(historical[p.id]?.records?.overall?.matches||0),0);
  const full=n(setting(settings,"Minimum Matches for Full Confidence",8),8)*players.length;
  const confidence=sample>=full?"High":sample>=full*.5?"Medium":"Low";
  const factors=[
    {label: strokeDiff === 0 ? "No net stroke edge" : `Net stroke edge: ${Math.abs(strokeDiff)} to ${strokeDiff > 0 ? teamNames[0] : teamNames[1]}`, side:strokeDiff===0?"neutral":strokeDiff>0?"A":"B"},
    {label:`${code === "BB" ? "Best Ball" : code === "SC" ? "Scramble" : "Singles"} history favors ${pa>=pb?teamNames[0]:teamNames[1]}`,side:pa>=pb?"A":"B"},
    {label:`Head-to-head favors ${oa>=50?teamNames[0]:teamNames[1]}`,side:oa>=50?"A":"B"},
  ];
  if(code!=="SI") factors.push({label: ta===50&&tb===50?"No prior partnership history":"Partnership history favors "+(ta>=tb?teamNames[0]:teamNames[1]),side:ta===tb?"neutral":ta>tb?"A":"B"});
  return {teamA:Math.round(a),teamB:Math.round(b),tie:Math.round(100-a-b),confidence,factors,components:{handicap:[ha,hb],player:[pa,pb],team:[ta,tb],opponent:[oa,ob]},model:setting(settings,"Prediction Model","SBI v1.0")};
}
