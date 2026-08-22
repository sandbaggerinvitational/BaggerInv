const clean = (value) => String(value ?? "").trim().toLowerCase();

export const WAR_ROOM_INPUT_SOURCES = Object.freeze(["google", "supabase"]);

/**
 * One reversible War Room input boundary. Production is intentionally pinned
 * to the existing Google path; an explicit source override is accepted only
 * by protected Preview diagnostics.
 */
export function resolveWarRoomInputSource(env = process.env, requestedSource = "") {
  const deployment = clean(env.VERCEL_ENV);
  const configured = clean(env.WAR_ROOM_INPUT_SOURCE) || "google";
  const requested = clean(requestedSource);
  const preview = deployment === "preview";
  const production = deployment === "production";

  if (configured && !WAR_ROOM_INPUT_SOURCES.includes(configured)) {
    const error = new Error(`Unsupported WAR_ROOM_INPUT_SOURCE ${configured}.`);
    error.code = "WAR_ROOM_INPUT_SOURCE_INVALID";
    error.status = 503;
    throw error;
  }
  if (requested && !WAR_ROOM_INPUT_SOURCES.includes(requested)) {
    const error = new Error(`Unsupported War Room diagnostic source ${requested}.`);
    error.code = "WAR_ROOM_INPUT_DIAGNOSTIC_SOURCE_INVALID";
    error.status = 400;
    throw error;
  }

  const resolved = production ? "google" : requested && preview ? requested : configured;
  return Object.freeze({
    contract: "war-room-input-source-v1",
    requested: requested || configured,
    configured,
    resolved,
    preview,
    production,
    productionHardResolvedToGoogle: production,
    overrideApplied: Boolean(requested && preview),
    fallbackUsed: false,
  });
}
