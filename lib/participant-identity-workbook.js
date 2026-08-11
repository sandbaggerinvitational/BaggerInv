export const PARTICIPANT_IDENTITY_CONFIGURATION_HEADERS = Object.freeze([
  "Tournament ID", "Player ID", "Email", "Identity Active", "Configuration Revision",
  "Verified By", "Verified At", "Updated At", "Updated By",
]);

const clean = (value) => String(value ?? "").trim();

export function isRecoverableParticipantIdentityConfigurationSheet({ headers = [], records = [] } = {}) {
  return !headers.some((header) => clean(header)) && records.length === 0;
}

export function participantIdentityConfigurationSeedRows({ tournamentId, players = [], updatedBy, updatedAt = new Date().toISOString() } = {}) {
  const canonicalTournamentId = clean(tournamentId);
  if (!canonicalTournamentId) throw new Error("A canonical tournament ID is required to initialize participant identity configuration.");
  const activePlayers = players
    .filter((player) => clean(player.participationStatus || player.participation_status || "ACTIVE").toUpperCase() === "ACTIVE")
    .map((player) => clean(player.playerId || player.player_id || player.id))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  if (!activePlayers.length) throw new Error("No active canonical tournament players are available for identity configuration.");
  if (new Set(activePlayers).size !== activePlayers.length) throw new Error("Canonical tournament player IDs must be unique before identity configuration is initialized.");
  return activePlayers.map((playerId) => [
    canonicalTournamentId, playerId, "", "FALSE", 1, "", "", updatedAt, clean(updatedBy),
  ]);
}

export function participantIdentityConfigurationValuesRequest(seedRows = []) {
  if (!seedRows.length) throw new Error("Participant identity configuration requires at least one active player row.");
  const range = `Participant Identity Configuration!A1:I${seedRows.length + 1}`;
  const query = new URLSearchParams({ valueInputOption: "RAW" });
  return {
    path: `/values/${encodeURIComponent(range)}?${query.toString()}`,
    options: {
      method: "PUT",
      body: JSON.stringify({
        range,
        majorDimension: "ROWS",
        values: [[...PARTICIPANT_IDENTITY_CONFIGURATION_HEADERS], ...seedRows],
      }),
    },
  };
}
