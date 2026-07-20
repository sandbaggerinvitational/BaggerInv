import { formatCode, pick } from "./prediction-engine.js";
import { currentTournamentYear, getTeamContext } from "./tournament-context.js";

export const ODDS_PHASES = ["Pre-Tournament", "After Round 1", "After Round 2", "Round 3 Pairings Announced", "Final Results"];
const num = (v, f = 0) => { const n = Number.parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : f; };
const rng = (seed) => { let x = 2166136261; for (const c of seed) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return () => ((x = Math.imul(x ^ x >>> 15, 1 | x)) >>> 0) / 4294967296; };
const shuffle = (values, random) => { const result=[...values]; for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];} return result; };
export function americanOdds(probability) { const p = probability / 100; if (p <= 0) return "+∞"; if (p >= 1) return "-∞"; return p > .5 ? String(Math.round(-100 * p / (1 - p))) : `+${Math.round(100 * (1 - p) / p)}`; }

export function validateOpeningMatchups(sheets, year = currentTournamentYear(sheets)) {
  const currentMatches = (sheets.matches || []).filter((match) => num(pick(match, "Year")) === Number(year));
  const teams = getTeamContext(sheets, Number(year));
  const missingRounds = [1, 2].filter((round) => {
    const matches = currentMatches.filter((match) => num(pick(match, "Round")) === round);
    const fieldsComplete = matches.length > 0 && matches.every((match) => {
      const singles = formatCode(pick(match, "Format")) === "SI";
      return [pick(match, "Team 1 Player 1"), pick(match, "Team 2 Player 1"), ...(singles ? [] : [pick(match, "Team 1 Player 2"), pick(match, "Team 2 Player 2")])].every(Boolean);
    });
    const scheduled = (side) => matches.flatMap((match) => [pick(match, `Team ${side} Player 1`), pick(match, `Team ${side} Player 2`)]).filter(Boolean).sort();
    const roster = (side) => (side === 1 ? teams.team1.players : teams.team2.players).map((player) => player.id).sort();
    return !fieldsComplete || JSON.stringify(scheduled(1)) !== JSON.stringify(roster(1)) || JSON.stringify(scheduled(2)) !== JSON.stringify(roster(2));
  });
  return { ready: !missingRounds.length, missingRounds, message: "Tournament odds will display once the Round 1 and Round 2 matchups have been set." };
}

export function validateRoundThreePairings(sheets, year = currentTournamentYear(sheets)) {
  const teams=getTeamContext(sheets,Number(year));
  const matches=(sheets.matches||[]).filter((m)=>num(pick(m,"Year"))===Number(year)&&num(pick(m,"Round"))===3);
  const side=(n)=>matches.map((m)=>pick(m,`Team ${n} Player 1`)).filter(Boolean).sort();
  const roster=(n)=>(n===1?teams.team1.players:teams.team2.players).map((p)=>p.id).sort();
  const ready=JSON.stringify(side(1))===JSON.stringify(roster(1))&&JSON.stringify(side(2))===JSON.stringify(roster(2));
  return {ready,message:"Round 3 odds cannot be published until all official Singles pairings have been entered."};
}

export function simulateTournamentOdds({ sheets, historical = {}, phase = "Pre-Tournament", iterations = 10_000 }) {
  const year = currentTournamentYear(sheets), teams = getTeamContext(sheets, year), random = rng(`${year}|${phase}|odds-v1`);
  const roster = [...teams.team1.players.map((p) => ({ ...p, side: 1 })), ...teams.team2.players.map((p) => ({ ...p, side: 2 }))];
  const names = Object.fromEntries(roster.map((p) => [p.id, p.name]));
  const matches = (sheets.matches || []).filter((m) => num(pick(m, "Year")) === year);
  const rules=(sheets.tournamentRules||[]).filter((r)=>num(pick(r,"Year"))===year);
  const pointsForRound=(round)=>num(pick(rules.find((r)=>num(String(pick(r,"Round")).replace(/\D/g,""))===round),"Points Available"),3);
  const openingMatches=matches.filter((m)=>[1,2].includes(num(pick(m,"Round"))));
  const officialRoundThree=matches.filter((m)=>num(pick(m,"Round"))===3&&pick(m,"Team 1 Player 1")&&pick(m,"Team 2 Player 1"));
  const useOfficialRoundThree=["Round 3 Pairings Announced","Final Results"].includes(phase);
  const totalPointsAvailable=openingMatches.reduce((sum,m)=>sum+pointsForRound(num(pick(m,"Round"))),0)+teams.team1.players.length*pointsForRound(3);
  const player = Object.fromEntries(roster.map((p) => [p.id, { top: 0, points: 0, wins: 0, losses: 0, halves: 0, finish: 0 }]));
  const team = { 1: { wins: 0, points: 0 }, 2: { wins: 0, points: 0 } };
  const completedThrough = phase === "Pre-Tournament" ? 0 : phase === "After Round 1" ? 1 : phase === "After Round 2" || phase === "Round 3 Pairings Announced" || phase === "Final Results" ? 2 : 0;
  const strength = (id,code) => { const ratings=historical[id]?.sandbaggerRatings||{};const overall=ratings.OVERALL?.rating||1500;const specific=ratings[code];const reliability=Math.min(1,(specific?.matches||0)/6);const blended=overall+reliability*((specific?.rating||overall)-overall);return 1/(1+Math.pow(10,(1500-blended)/400)); };
  const idsFor = (m, side) => [pick(m, `Team ${side} Player 1`), pick(m, `Team ${side} Player 2`)].filter(Boolean);
  for (let run = 0; run < iterations; run++) {
    const totals = Object.fromEntries(roster.map((p) => [p.id, 0])), records = Object.fromEntries(roster.map((p) => [p.id, [0, 0, 0]])); let team1 = 0, team2 = 0;
    const a = shuffle(roster.filter((p) => p.side === 1),random), b = shuffle(roster.filter((p) => p.side === 2),random);
    const projectedRoundThree=a.map((p,i)=>({Year:year,Round:3,Format:"SI","Team 1 Player 1":p.id,"Team 2 Player 1":b[i]?.id}));
    const runMatches=[...openingMatches,...(useOfficialRoundThree?officialRoundThree:projectedRoundThree)];
    for (const m of runMatches) {
      const round = num(pick(m, "Round")), a = idsFor(m, 1), b = idsFor(m, 2); if (!a.length || !b.length) continue;
      const code = formatCode(pick(m, "Format")), max = pointsForRound(round);
      let outcome, p1, p2;
      const actual1 = num(pick(m, "Team 1 Points"), NaN), actual2 = num(pick(m, "Team 2 Points"), NaN);
      const useActual = (round <= completedThrough || phase === "Final Results") && Number.isFinite(actual1) && Number.isFinite(actual2);
      if (useActual) { p1 = actual1; p2 = actual2; outcome = p1 === p2 ? 0 : p1 > p2 ? 1 : 2; }
      else { const sa = a.reduce((s, id) => s + strength(id,code), 0) / a.length, sb = b.reduce((s, id) => s + strength(id,code), 0) / b.length; const tie = code === "SI" ? .11 : .09; const pa = (1 - tie) * (.5 + Math.max(-.3, Math.min(.3, (sa - sb) * .7))); const draw = random(); outcome = draw < pa ? 1 : draw < pa + tie ? 0 : 2; p1 = outcome === 1 ? max : outcome === 0 ? max / 2 : 0; p2 = max - p1; }
      team1 += p1; team2 += p2; for (const [sideIds, points, side] of [[a,p1,1],[b,p2,2]]) for (const id of sideIds) { totals[id] += code === "SI" ? points : points / sideIds.length; records[id][outcome === 0 ? 2 : outcome === side ? 0 : 1]++; }
    }
    if(Math.abs(team1+team2-totalPointsAvailable)>.001) throw new Error(`Tournament simulation produced ${team1+team2} of ${totalPointsAvailable} configured points.`);
    team[1].points += team1; team[2].points += team2; if (team1 > team2) team[1].wins++; else if (team2 > team1) team[2].wins++; else { team[1].wins += .5; team[2].wins += .5; }
    const high = Math.max(...Object.values(totals)); const ordered = [...new Set(Object.values(totals))].sort((a,b)=>b-a);
    for (const id of Object.keys(totals)) { const row = player[id]; if (totals[id] === high) row.top++; row.points += totals[id]; row.finish += ordered.indexOf(totals[id]) + 1; row.wins += records[id][0]; row.losses += records[id][1]; row.halves += records[id][2]; }
  }
  const teamRows = [1,2].map((side) => { const probability = team[side].wins / iterations * 100; return { side, name: side === 1 ? teams.team1.name : teams.team2.name, probability:+probability.toFixed(1), americanOdds:americanOdds(probability), expectedPoints:+(team[side].points/iterations).toFixed(2) }; });
  const playerRows = roster.map((p) => { const r=player[p.id], probability=r.top/iterations*100; return { id:p.id, name:names[p.id], teamSide:p.side, probability:+probability.toFixed(1), americanOdds:americanOdds(probability), expectedPoints:+(r.points/iterations).toFixed(2), expectedRecord:`${(r.wins/iterations).toFixed(1)}-${(r.losses/iterations).toFixed(1)}-${(r.halves/iterations).toFixed(1)}`, averageFinish:+(r.finish/iterations).toFixed(1) }; }).sort((a,b)=>b.probability-a.probability);
  return { year, phase, phaseOrder:ODDS_PHASES.indexOf(phase), publishedAt:new Date().toISOString(), iterations, totalPointsAvailable, teams:teamRows, players:playerRows };
}
