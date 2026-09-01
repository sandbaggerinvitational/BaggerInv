import "server-only";

import { cache } from "react";

import { readPreviewSecondaryHistoryPlayers } from "./player-public-profile-projection.js";

const clean = (value) => String(value ?? "").trim();

function rpcData(read) {
  const payload = read?.payload || read || {};
  if (payload?.ok !== true || !payload?.data) {
    const error = new Error("Canonical Player presentation is temporarily unavailable.");
    error.code = clean(payload?.code || "PLAYER_PUBLIC_PRESENTATION_UNAVAILABLE");
    error.status = 503;
    throw error;
  }
  return payload.data;
}

export function canonicalPlayerPresentationRows(payload = {}) {
  return (Array.isArray(payload.players) ? payload.players : [])
    .map((row) => {
      const profile = row?.public_profile || {};
      return Object.freeze({
        id: clean(row?.player_id || profile["Player ID"]),
        name: clean(profile["Display Name"] || row?.canonical_display_name || row?.player_id),
        slug: clean(profile.Slug || profile.slug).toLowerCase(),
        photo: clean(profile["Photo Filename"] || profile.Photo),
      });
    })
    .filter((row) => row.id);
}

async function loadUncached(options = {}) {
  const env = options.env || process.env;
  const reader = options.dependencies?.readPlayerPresentation || readPreviewSecondaryHistoryPlayers;
  const read = await reader({ env, timeoutMs: options.timeoutMs || 10_000 });
  const data = rpcData(read);
  const players = canonicalPlayerPresentationRows(data);
  if (!players.length || new Set(players.map((row) => row.id)).size !== players.length) {
    const error = new Error("Canonical Player presentation identities are incomplete.");
    error.code = "PLAYER_PUBLIC_PRESENTATION_IDENTITY_INVALID";
    error.status = 503;
    throw error;
  }
  return Object.freeze({
    source: "supabase",
    players: Object.freeze(players),
    diagnostics: Object.freeze({
      playerCount: players.length,
      requestMs: Number(read?.durationMs) || 0,
      googleForegroundRequests: 0,
    }),
  });
}

const loadCached = cache((env, timeoutMs) =>
  loadUncached({ env, ...(timeoutMs ? { timeoutMs } : {}) })
);

/** One cached Supabase profile-projection read; never a per-row lookup. */
export async function loadCanonicalPlayerPresentation(options = {}) {
  if (options.dependencies) return loadUncached(options);
  return loadCached(options.env || process.env, options.timeoutMs || 0);
}
