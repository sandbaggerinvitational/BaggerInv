import { getTournamentData } from "../app/live/sheetData.js";
import { readPlayerPassportMatches } from "./google-sheets-write.js";
import { isTransientGoogleError } from "./google-api-reliability.js";

const CACHE_TTL = 15_000;
const cache = new Map();
const pending = new Map();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const keyFor = (session) => [session?.tournamentId, session?.playerId, session?.impersonatedPlayerId, session?.deviceId, session?.sessionVersion].join(":");

export function invalidateParticipantInitialization(session) {
  if (!session) {
    cache.clear();
    pending.clear();
    return;
  }
  const key = keyFor(session);
  cache.delete(key);
  pending.delete(key);
}

async function initialize(session) {
  // Establish the normalized tournament snapshot first. Personalized reads then
  // resolve against the same fully initialized tournament rather than racing it.
  const tournamentData = await getTournamentData();
  const personalized = await readPlayerPassportMatches(session);
  return {
    player: personalized.player,
    tournament: tournamentData.tournament,
    personalized,
    initializedAt: new Date().toISOString(),
  };
}

export async function initializeParticipantTournament(session) {
  const key = keyFor(session);
  if (!session?.playerId || !session?.tournamentId || !session?.deviceId) throw new Error("Player Passport is not active.");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached.value;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    const delays = [250, 700, 1400];
    let lastError;
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        const value = await initialize(session);
        cache.set(key, { value, cachedAt: Date.now() });
        return value;
      } catch (error) {
        lastError = error;
        if (!isTransientGoogleError(error) || attempt === delays.length) throw error;
        await wait(delays[attempt]);
      }
    }
    throw lastError;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
