export const PLAYER_ROLES = Object.freeze(["PLAYER", "DIRECTOR"]);

export function normalizePlayerRole(value) {
  return String(value || "").trim().toUpperCase() === "DIRECTOR" ? "DIRECTOR" : "PLAYER";
}

export function isTournamentDirector(identity) {
  return normalizePlayerRole(identity?.player?.role || identity?.role) === "DIRECTOR";
}

export function isTournamentDirectorActor(identity) {
  return normalizePlayerRole(identity?.actor?.role || identity?.player?.role || identity?.role) === "DIRECTOR";
}
