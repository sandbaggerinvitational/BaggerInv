const clean = (value) => String(value ?? "").trim();

function numeric(value) {
  const parsed = Number.parseFloat(clean(value).replace(/[$,%]/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fraction(value) {
  const raw = clean(value);
  const parsed = numeric(raw);
  if (!parsed) return 0;
  return raw.includes("%") || parsed > 1 ? parsed / 100 : parsed;
}

const yearRows = (rows, year) => (rows || []).filter((row) => Number(row.Year) === Number(year));
const roundNumber = (value) => Number(clean(value).match(/\d+/)?.[0]);
const rankValue = (value) => Number(clean(value).match(/\d+/)?.[0]);

function awardForPlaces(rows, round, start, count, kind) {
  const field = kind === "points" ? `Round ${round} Award` : `Round ${round} Award %`;
  const byPlace = new Map(rows.map((row) => [rankValue(row.Place), kind === "points" ? numeric(row[field]) : fraction(row[field])]));
  let total = 0;
  for (let place = start; place < start + count; place += 1) total += byPlace.get(place) || 0;
  return total / count;
}

export function rankWithTieAverages(entries, value, direction, award) {
  const factor = direction === "asc" ? 1 : -1;
  const sorted = [...entries].sort((left, right) => (value(left) - value(right)) * factor || clean(left.playerId).localeCompare(clean(right.playerId)));
  const ranked = [];
  for (let index = 0; index < sorted.length;) {
    let end = index + 1;
    while (end < sorted.length && value(sorted[end]) === value(sorted[index])) end += 1;
    const place = index + 1;
    const tied = end - index;
    const averagedAward = award(place, tied);
    for (let cursor = index; cursor < end; cursor += 1) ranked.push({ ...sorted[cursor], place, tieSize: tied, award: averagedAward });
    index = end;
  }
  return ranked;
}

function normalizedPlayer(playerMap, playerId) {
  const player = playerMap[playerId] || {};
  return { id: playerId, name: player.name || playerId, photo: player.photo || "", slug: player.slug || "" };
}

export function deriveCalcuttaRoundResults({ year, roundResults = [], liveRoundHandicaps = [], handicaps = [] }) {
  const liveHandicap = (playerId, round) => {
    const row = yearRows(liveRoundHandicaps, year).find((item) => clean(item["Player ID"] || item.Player) === playerId && roundNumber(item.Round) === round);
    if (row && clean(row["Course Handicap"]) !== "") return numeric(row["Course Handicap"]);
    const fallback = yearRows(handicaps, year).find((item) => clean(item["Player ID"]) === playerId);
    return numeric(fallback?.["Tournament Handicap"]);
  };
  return yearRows(roundResults, year).flatMap((row) => {
    const round = roundNumber(row.Round);
    const format = clean(row.Format);
    const playerIds = clean(row["Player IDs"] || row["Player ID"] || row["Golfer Player ID"]).split(/[,/|]/).map(clean).filter(Boolean);
    if (!round || !playerIds.length) return [];
    const gross = numeric(row["Gross Score"] ?? row.Gross);
    return playerIds.map((playerId) => {
      let fullCourseHandicap = clean(row["Full Course Handicap"]) !== "" ? numeric(row["Full Course Handicap"]) : liveHandicap(playerId, round);
      if (/scramble|^sc$/i.test(format) && playerIds.length === 2 && clean(row["Full Course Handicap"]) === "") {
        const courseHandicaps = playerIds.map((id) => liveHandicap(id, round)).sort((a, b) => a - b);
        fullCourseHandicap = Math.round(courseHandicaps[0] * 0.35 + courseHandicaps[1] * 0.15);
      }
      const net = clean(row["Net Score"] ?? row.Net) !== "" ? numeric(row["Net Score"] ?? row.Net) : gross - fullCourseHandicap;
      return { Year: year, Round: round, Format: format, "Player ID": playerId, "Gross Score": gross, "Net Score": net, "Full Course Handicap": fullCourseHandicap };
    });
  });
}

export function buildCalcuttaModel({ year, players = {}, purchases = [], ownership = [], pointStructure = [], payoutStructure = [], roundResults = [], standings = [], ownerLeaderboard = [] }) {
  const purchasesForYear = yearRows(purchases, year);
  const ownershipForYear = yearRows(ownership, year);
  const pointsForYear = yearRows(pointStructure, year);
  const payoutsForYear = yearRows(payoutStructure, year);
  const resultsForYear = yearRows(roundResults, year);
  const purchaseByPlayer = new Map(purchasesForYear.map((row) => [clean(row["Golfer Player ID"]), numeric(row["Purchase Price"])]));
  const pot = [...purchaseByPlayer.values()].reduce((sum, price) => sum + price, 0);
  const entries = new Map();
  const ensure = (playerId) => {
    if (!entries.has(playerId)) entries.set(playerId, {
      playerId,
      player: normalizedPlayer(players, playerId),
      purchasePrice: purchaseByPlayer.get(playerId) || 0,
      rounds: {}, totalPoints: 0, totalPayoutPercent: 0, currentPayoutValue: 0, roi: 0,
    });
    return entries.get(playerId);
  };
  purchaseByPlayer.forEach((_price, playerId) => ensure(playerId));

  for (const round of [1, 2, 3]) {
    const eligible = resultsForYear.filter((row) => roundNumber(row.Round) === round && clean(row["Player ID"]) && clean(row["Net Score"]) !== "").map((row) => ({
      playerId: clean(row["Player ID"]),
      format: clean(row.Format),
      gross: numeric(row["Gross Score"]),
      net: numeric(row["Net Score"]),
      fullCourseHandicap: numeric(row["Full Course Handicap"]),
    }));
    const pointRanks = rankWithTieAverages(eligible, (entry) => entry.net, "asc", (place, count) => awardForPlaces(pointsForYear, round, place, count, "points"));
    const payoutRanks = rankWithTieAverages(eligible, (entry) => entry.net, "asc", (place, count) => awardForPlaces(payoutsForYear, round, place, count, "payout"));
    const payoutByPlayer = new Map(payoutRanks.map((entry) => [entry.playerId, entry.award]));
    pointRanks.forEach((result) => {
      const entry = ensure(result.playerId);
      entry.rounds[round] = {
        round,
        format: result.format,
        gross: result.gross,
        net: result.net,
        fullCourseHandicap: result.fullCourseHandicap,
        place: result.place,
        tieSize: result.tieSize,
        points: result.award,
        payoutPercent: payoutByPlayer.get(result.playerId) || 0,
      };
      entry.totalPoints += result.award;
      entry.totalPayoutPercent += payoutByPlayer.get(result.playerId) || 0;
    });
  }

  const overallByPlace = new Map(payoutsForYear.map((row) => [rankValue(row.Place), fraction(row["Overall Award %"])]));
  const overall = rankWithTieAverages([...entries.values()], (entry) => entry.totalPoints, "desc", (place, count) => {
    let total = 0;
    for (let rank = place; rank < place + count; rank += 1) total += overallByPlace.get(rank) || 0;
    return total / count;
  });
  overall.forEach((ranked) => {
    const entry = entries.get(ranked.playerId);
    entry.rank = ranked.place;
    entry.tieSize = ranked.tieSize;
    entry.overallPayoutPercent = ranked.award;
    entry.totalPayoutPercent += ranked.award;
    entry.currentPayoutValue = pot * entry.totalPayoutPercent;
    entry.netProfit = entry.currentPayoutValue - entry.purchasePrice;
    entry.roi = entry.purchasePrice ? entry.netProfit / entry.purchasePrice : 0;
  });

  const ownerMap = new Map();
  for (const row of ownershipForYear) {
    const playerId = clean(row["Golfer Player ID"]);
    const ownerId = clean(row["Owner Player ID"]);
    const share = fraction(row["Ownership %"]);
    if (!playerId || !ownerId || !share || !entries.has(playerId)) continue;
    const golfer = entries.get(playerId);
    const owner = ownerMap.get(ownerId) || { ownerId, owner: normalizedPlayer(players, ownerId), investments: [], purchaseCost: 0, currentPayoutValue: 0, netProfit: 0, roi: 0 };
    const investment = {
      playerId,
      player: golfer.player,
      ownership: share,
      purchasePrice: golfer.purchasePrice * share,
      currentPayoutValue: golfer.currentPayoutValue * share,
    };
    investment.netProfit = investment.currentPayoutValue - investment.purchasePrice;
    investment.roi = investment.purchasePrice ? investment.netProfit / investment.purchasePrice : 0;
    owner.investments.push(investment);
    owner.purchaseCost += investment.purchasePrice;
    owner.currentPayoutValue += investment.currentPayoutValue;
    ownerMap.set(ownerId, owner);
    golfer.owners ||= [];
    golfer.owners.push({ ownerId, owner: owner.owner, ownership: share });
  }
  const portfolios = [...ownerMap.values()].map((owner) => ({
    ...owner,
    netProfit: owner.currentPayoutValue - owner.purchaseCost,
    roi: owner.purchaseCost ? (owner.currentPayoutValue - owner.purchaseCost) / owner.purchaseCost : 0,
  })).sort((a, b) => b.currentPayoutValue - a.currentPayoutValue || b.roi - a.roi || a.owner.name.localeCompare(b.owner.name)).map((owner, index) => ({ ...owner, rank: index + 1 }));

  const golfers = [...entries.values()].sort((a, b) => a.rank - b.rank || b.totalPoints - a.totalPoints || a.player.name.localeCompare(b.player.name));
  const byRoi = [...golfers].sort((a, b) => b.roi - a.roi || b.netProfit - a.netProfit);
  const byGain = [...golfers].sort((a, b) => b.netProfit - a.netProfit || b.roi - a.roi);
  const mostExpensive = [...golfers].sort((a, b) => b.purchasePrice - a.purchasePrice)[0];
  const storylines = [];
  if (byRoi[0]?.purchasePrice) storylines.push({ icon: "📈", title: "Highest ROI", subject: byRoi[0].player.name, detail: `${Math.round(byRoi[0].roi * 100)}% return on a ${byRoi[0].purchasePrice.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} purchase.` });
  if (portfolios[0]) storylines.push({ icon: "🏆", title: "Leading Portfolio", subject: portfolios[0].owner.name, detail: `${portfolios[0].currentPayoutValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} in current payout value.` });
  if (mostExpensive?.purchasePrice) storylines.push({ icon: "💰", title: "Most Expensive Purchase", subject: mostExpensive.player.name, detail: mostExpensive.purchasePrice.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) });

  return {
    available: Boolean(purchasesForYear.length || resultsForYear.length || standings.length || ownerLeaderboard.length),
    year,
    pot,
    golfers,
    portfolios,
    storylines,
    hero: { leadingPortfolio: portfolios[0] || null, highestRoi: byRoi[0] || null, bestInvestment: byGain[0] || null },
    source: { purchases: purchasesForYear.length, ownership: ownershipForYear.length, pointStructure: pointsForYear.length, payoutStructure: payoutsForYear.length, roundResults: resultsForYear.length, standings: yearRows(standings, year).length, ownerLeaderboard: yearRows(ownerLeaderboard, year).length },
  };
}
