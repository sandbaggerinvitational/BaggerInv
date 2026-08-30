const clean = (value) => String(value ?? "").trim().toLowerCase();

export function publishedTournamentSecondaryModules(modules = {}) {
  if (!modules || typeof modules !== "object") return [];
  return Object.entries(modules)
    .filter(([name, model]) => clean(name) && model?.available === true)
    .map(([name]) => clean(name));
}

export function calcuttaDestinationAvailable(data = {}) {
  if (data?.calcuttaState && typeof data.calcuttaState === "object") {
    return data.calcuttaState.visible === true;
  }
  if (data?.calcutta?.available === true) return true;
  return (data?.presentation?.secondaryModules || []).some((name) => clean(name) === "calcutta");
}
