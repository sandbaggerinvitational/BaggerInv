const clean = (value) => String(value ?? "").trim();
const truthy = (value) => ["true", "yes", "1"].includes(clean(value).toLowerCase());
import { notificationReady, parsePushSubscription } from "./web-push-notifications.js";

function activeDevice(record, tournamentId) {
  if (clean(record["Tournament ID"]) !== clean(tournamentId) || clean(record["Revoked At"])) return false;
  const expires = Date.parse(clean(record["Expires At"]));
  return !Number.isFinite(expires) || expires > Date.now();
}

function playerIdsFromMatches(matches = []) {
  const ids = new Set();
  for (const match of matches) for (const side of [1, 2]) for (const slot of [1, 2]) {
    const id = clean(match[`Team ${side} Player ${slot}`]);
    if (id) ids.add(id);
  }
  return ids;
}

function handicapTeamAssigned(handicaps = [], playerId) {
  const row = handicaps.find((item) => clean(item["Player ID"]) === clean(playerId));
  return Boolean(clean(row?.["Team ID"] || row?.["Team Side"] || row?.Team || row?.["Team Name"]));
}

export function tournamentReadiness({ tournamentId, players = [], passports = [], devices = [], handicaps = [], matches = [] } = {}) {
  const assignedIds = playerIdsFromMatches(matches);
  const rows = players.map((player) => {
    const id = clean(player.id || player["Player ID"]);
    const name = clean(player.name || player["Display Name"] || player.Name || id);
    const playerDevices = devices.filter((record) => clean(record["Player ID"]) === id && activeDevice(record, tournamentId));
    const passport = passports.find((record) => clean(record["Tournament ID"]) === clean(tournamentId) && clean(record["Player ID"]) === id);
    return {
      id,
      name,
      passportActivated: playerDevices.length > 0 || Boolean(clean(passport?.["Activation Used At"])),
      pwaInstalled: playerDevices.some((record) => truthy(record["PWA Installed"])),
      notificationsEnabled: playerDevices.some(notificationReady),
      invalidSubscription: playerDevices.some((record) => clean(record["Notification Permission"]).toLowerCase() === "granted" && !parsePushSubscription(record["Push Subscription"])),
      profilePhotoPresent: Boolean(clean(player.photo || player["Photo Filename"] || player.Photo)),
      teamAssigned: handicapTeamAssigned(handicaps, id) || assignedIds.has(id),
    };
  });
  const definitions = [
    ["passport", "Player Passports Activated", "passportActivated"],
    ["pwa", "PWA Installed", "pwaInstalled"],
    ["notifications", "Notifications Enabled", "notificationsEnabled"],
    ["photos", "Profile Photos Present", "profilePhotoPresent"],
    ["teams", "Players Assigned To Teams", "teamAssigned"],
  ];
  const items = definitions.map(([id, label, field]) => {
    const missing = rows.filter((player) => !player[field]).map(({ id: playerId, name }) => ({ id: playerId, name }));
    const invalid = id === "notifications" ? rows.filter((player) => player.invalidSubscription).map(({ id: playerId, name }) => ({ id: playerId, name })) : [];
    return { id, label, complete: rows.length - missing.length, total: rows.length, missing, invalid };
  });
  const readyPlayers = rows.filter((player) => definitions.every(([, , field]) => player[field])).length;
  return {
    players: rows,
    items,
    readyPlayers,
    totalPlayers: rows.length,
    tournamentReady: rows.length > 0 && readyPlayers === rows.length,
    reminders: Object.fromEntries(items.filter((item) => ["passport", "pwa", "notifications"].includes(item.id)).map((item) => [item.id, item.missing])),
  };
}
