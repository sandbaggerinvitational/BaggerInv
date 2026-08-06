import { getStrokesOnHole } from "./scorecard-net.js";

const clean = (value) => String(value ?? "").trim();
const numeric = (value) => {
  if (value === null || value === undefined || clean(value) === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const eligible = (value) => ["true", "yes", "1", "eligible", "y"].includes(clean(value).toLowerCase());

export const NET_SKINS_RESULT_HEADERS = Object.freeze([
  "Year", "Round", "Hole", "Winner", "Winner Player ID", "Winner Player ID 2",
  "Skin Value", "Round Pot", "Winning Net Score", "Format", "Match",
]);

export function normalizeSkinsFormat(value) {
  const format = clean(value).toUpperCase();
  if (["SC", "SCRAMBLE"].includes(format)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(format)) return "SI";
  if (["BB", "BEST BALL", "BESTBALL"].includes(format)) return "BB";
  return format;
}

export function normalizeNetSkinsEntries(rows = [], activeYear) {
  return rows.flatMap((row, index) => {
    const year = Number(row.Year ?? row.year);
    if (activeYear && year && year !== Number(activeYear)) return [];
    if (!eligible(row.Eligible ?? row.eligible)) return [];
    const format = normalizeSkinsFormat(row.Format ?? row.format);
    const playerId1 = clean(row["Player ID 1"] ?? row.playerId1);
    const playerId2 = clean(row["Player ID 2"] ?? row.playerId2);
    const round = Number(row.Round ?? row.round);
    const match = clean(row.Match ?? row.match);
    if (!round || !playerId1 || !["BB", "SC", "SI"].includes(format)) return [];
    return [{
      id: clean(row["Net Skins ID"] ?? row.id) || `${year || activeYear}-R${round}-M${match || "0"}-${playerId1}${playerId2 ? `-${playerId2}` : ""}-${index}`,
      year: year || Number(activeYear) || null,
      round,
      match,
      format,
      playerId1,
      playerId2: format === "SC" ? playerId2 : "",
      teamHandicap: format === "SC" ? numeric(row["Team Handicap"] ?? row.teamHandicap) : null,
      buyIn: format === "SC" ? 50 : 25,
    }];
  });
}

function scoreRowFor(entry, scoreRows) {
  const roundRows = scoreRows.filter((row) => Number(row.round) === entry.round);
  if (entry.format === "SC") {
    const wanted = [entry.playerId1, entry.playerId2].filter(Boolean).sort().join("|");
    return roundRows.find((row) => row.entityType === "PAIRING" && (row.playerIds || []).map(clean).filter(Boolean).sort().join("|") === wanted && (!entry.match || !clean(row.match) || clean(row.match) === entry.match || clean(row.id).includes(`R${entry.round}`))) || null;
  }
  return roundRows.find((row) => row.entityType !== "PAIRING" && clean(row.id) === entry.playerId1) || null;
}

function participant(entry, scoreRows) {
  const score = scoreRowFor(entry, scoreRows);
  const scorecard = (score?.scorecard || []).filter((hole) => !entry.match || !clean(hole.match) || clean(hole.match) === entry.match);
  return {
    ...entry,
    name: clean(score?.name) || (entry.format === "SC" ? [entry.playerId1, entry.playerId2].filter(Boolean).join(" / ") : entry.playerId1),
    playerIds: [entry.playerId1, entry.playerId2].filter(Boolean),
    scorecard,
    scores: new Map(scorecard.map((hole) => {
      const gross = numeric(hole.gross);
      const strokeIndex = numeric(hole.strokeIndex);
      const net = entry.format === "SC" && entry.teamHandicap !== null && gross !== null && strokeIndex !== null
        ? gross - getStrokesOnHole(entry.teamHandicap, strokeIndex)
        : numeric(hole.net);
      return [Number(hole.hole), net];
    }).filter(([, net]) => net !== null)),
  };
}

function competitionRank(rows) {
  let priorSkins;
  let priorWinnings;
  let priorRank = 0;
  return rows.map((row, index) => {
    const tied = index > 0 && row.skinsWon === priorSkins && row.totalWinnings === priorWinnings;
    const rank = tied ? priorRank : index + 1;
    priorSkins = row.skinsWon;
    priorWinnings = row.totalWinnings;
    priorRank = rank;
    return { ...row, rank, displayRank: tied || rows[index + 1]?.skinsWon === row.skinsWon && rows[index + 1]?.totalWinnings === row.totalWinnings ? `T-${rank}` : String(rank) };
  });
}

export function calculateNetSkins({ entries = [], scoreRows = [], activeYear } = {}) {
  const configured = normalizeNetSkinsEntries(entries, activeYear);
  const rounds = [...new Set(configured.map((entry) => entry.round))].sort((a, b) => a - b).map((round) => {
    const roundEntries = configured.filter((entry) => entry.round === round);
    const participants = roundEntries.map((entry) => participant(entry, scoreRows));
    const format = roundEntries[0]?.format || "";
    const pot = roundEntries.reduce((sum, entry) => sum + entry.buyIn, 0);
    const completedHoles = [];
    const provisionalSkins = [];
    for (let hole = 1; hole <= 18; hole += 1) {
      const field = participants.map((entrant) => ({ entrant, net: entrant.scores.get(hole) })).filter((item) => item.net !== undefined);
      if (field.length !== participants.length || !participants.length) continue;
      completedHoles.push(hole);
      const low = Math.min(...field.map((item) => item.net));
      const winners = field.filter((item) => item.net === low);
      if (winners.length === 1) provisionalSkins.push({ hole, entrant: winners[0].entrant, winningNetScore: low });
    }
    const skinValue = provisionalSkins.length ? pot / provisionalSkins.length : 0;
    const skins = provisionalSkins.map(({ hole, entrant, winningNetScore }) => ({
      year: entrant.year,
      round,
      hole,
      winner: entrant.name,
      winnerPlayerId: entrant.playerId1,
      winnerPlayerId2: entrant.playerId2,
      skinValue,
      roundPot: pot,
      winningNetScore,
      format,
      match: entrant.match,
    }));
    const leaders = participants.map((entrant) => {
      const wins = skins.filter((skin) => skin.winnerPlayerId === entrant.playerId1 && skin.winnerPlayerId2 === entrant.playerId2);
      const holeResults = completedHoles.map((hole) => {
        const score = entrant.scorecard.find((item) => Number(item.hole) === hole);
        const field = participants.map((item) => item.scores.get(hole));
        const low = Math.min(...field);
        const tiedLow = field.filter((value) => value === low).length > 1 && entrant.scores.get(hole) === low;
        const wonSkin = wins.some((skin) => skin.hole === hole);
        return {
          hole,
          gross: numeric(score?.gross),
          net: entrant.scores.get(hole),
          par: numeric(score?.par),
          wonSkin,
          tiedLow,
        };
      });
      return {
        id: entrant.id,
        name: entrant.name,
        playerIds: entrant.playerIds,
        format,
        skinsWon: wins.length,
        totalWinnings: wins.reduce((sum, skin) => sum + skin.skinValue, 0),
        winningHoles: wins,
        holeResults,
      };
    }).sort((left, right) => right.skinsWon - left.skinsWon || right.totalWinnings - left.totalWinnings || left.name.localeCompare(right.name));
    return {
      round,
      format,
      matches: [...new Set(roundEntries.map((entry) => entry.match).filter(Boolean))],
      pot,
      eligibleCount: participants.length,
      completedHoles: completedHoles.length,
      complete: completedHoles.length === 18,
      skinsAwarded: skins.length,
      skinValue,
      skins,
      leaderboard: competitionRank(leaders),
    };
  });
  return {
    year: Number(activeYear) || configured[0]?.year || null,
    rounds,
    results: rounds.flatMap((round) => round.skins),
  };
}

export function netSkinsResultRecords(model = {}) {
  return (model.results || []).map((skin) => ({
    Year: skin.year,
    Round: skin.round,
    Hole: skin.hole,
    Winner: skin.winner,
    "Winner Player ID": skin.winnerPlayerId,
    "Winner Player ID 2": skin.winnerPlayerId2,
    "Skin Value": skin.skinValue,
    "Round Pot": skin.roundPot,
    "Winning Net Score": skin.winningNetScore,
    Format: skin.format,
    Match: skin.match,
  }));
}
