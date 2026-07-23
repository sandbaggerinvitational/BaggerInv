const clean = (value) => String(value ?? "").trim();

export function historicalCaptainReference(team = {}) {
  return {
    id: clean(team["Captain Player ID"] || team["Captain ID"] || team.Captain) || null,
    name: clean(team["Captain Name"]) || "",
  };
}

export function resolveHistoricalCaptain(team = {}, playerMap = {}) {
  const reference = historicalCaptainReference(team);
  if (reference.id) return playerMap[reference.id] || null;
  if (!reference.name) return null;
  return Object.values(playerMap).find(
    (player) => clean(player?.["Display Name"]).toLowerCase() === reference.name.toLowerCase()
  ) || null;
}
