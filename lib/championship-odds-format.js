const MAX_DISPLAYED_POSITIVE_ODDS = 25_000;

export function formatChampionshipOdds(value) {
  if (value === undefined || value === null || value === "") return "—";
  const exact = String(value).trim();
  if (exact === "+∞") return "+25,000+";
  const numeric = Number(exact.replaceAll(",", ""));
  if (!Number.isFinite(numeric)) return exact;
  if (numeric > MAX_DISPLAYED_POSITIVE_ODDS) return "+25,000+";
  return `${numeric >= 0 ? "+" : ""}${numeric.toLocaleString("en-US")}`;
}

export { MAX_DISPLAYED_POSITIVE_ODDS };
