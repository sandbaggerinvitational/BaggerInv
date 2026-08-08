const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const name = (entry, key) => String(entry?.[key]?.name || "");

export function rankCalcuttaGolfers(golfers = []) {
  const officialPointsExist = golfers.some((golfer) => number(golfer.totalPoints) > 0);
  if (!officialPointsExist) return golfers.map((golfer) => ({ ...golfer, displayRank: null }));
  return [...golfers]
    .sort((left, right) => number(right.totalPoints) - number(left.totalPoints)
      || number(right.currentPayoutValue) - number(left.currentPayoutValue)
      || name(left, "player").localeCompare(name(right, "player")))
    .map((golfer, index) => ({ ...golfer, displayRank: index + 1 }));
}

export function rankCalcuttaPortfolios(portfolios = []) {
  return [...portfolios]
    .sort((left, right) => number(right.currentPayoutValue) - number(left.currentPayoutValue)
      || number(right.netProfit) - number(left.netProfit)
      || name(left, "owner").localeCompare(name(right, "owner")))
    .map((portfolio, index) => ({ ...portfolio, displayRank: index + 1 }));
}
