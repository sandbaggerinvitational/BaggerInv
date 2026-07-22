const clean = (value) => String(value ?? "").trim();

export function isValidTournamentYear(value) {
  const raw = clean(value);
  if (!/^\d{4}$/.test(raw)) return false;
  const year = Number(raw);
  return Number.isInteger(year) && year >= 1900 && year <= 2200;
}

export function isValidTournamentId(value) {
  const id = clean(value);
  return Boolean(id) && id !== "0" && id.length <= 100 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}

function inferredYear(record = {}) {
  for (const field of [
    "Tournament ID", "Start Date", "End Date", "Dates", "Annual Image",
    "Hero Image", "Mobile Hero Image", "Annual", "Tournament Name",
  ]) {
    const match = clean(record[field]).match(/(?:19|20|21)\d{2}/g);
    if (!match?.length) continue;
    const candidate = match.at(-1);
    if (isValidTournamentYear(candidate)) return Number(candidate);
  }
  return null;
}

export function tournamentYear(record = {}) {
  if (isValidTournamentYear(record.Year)) return Number(record.Year);
  return inferredYear(record);
}

export function tournamentId(record = {}) {
  const explicit = clean(record["Tournament ID"]);
  if (isValidTournamentId(explicit)) return explicit;
  const year = tournamentYear(record);
  return year ? String(year) : "";
}

export function assertValidTournamentId(value, validIds = null) {
  const id = clean(value);
  if (!isValidTournamentId(id)) throw new Error("Unable to resolve the selected tournament.");
  if (validIds && !new Set([...validIds].map(String)).has(id)) {
    throw new Error("Unable to resolve the selected tournament.");
  }
  return id;
}

export function resolveTournamentSelection(tournaments = [], requestedId = "") {
  const ids = tournaments.map((item) => clean(item?.id ?? tournamentId(item))).filter(isValidTournamentId);
  const requested = clean(requestedId);
  if (isValidTournamentId(requested) && ids.includes(requested)) return requested;
  return ids[0] || "";
}

export function recordBelongsToTournament(record = {}, selectedId, selectedYear) {
  const id = clean(selectedId);
  const explicit = clean(record["Tournament ID"]);
  if (explicit) return explicit === id;
  const year = tournamentYear(record);
  return Boolean(year) && year === Number(selectedYear);
}
