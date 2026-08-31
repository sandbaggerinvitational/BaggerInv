import { MOBILE_API_VERSION, MobileApiError } from "./mobile-api-v1.js";
import { readMobilePreviewParticipantContent } from "./mobile-v1-participant-content-authority.js";
import { projectionPresentationLabel } from "./projection-phases.js";
import { scoringShadowPayloadHash } from "./scoring-shadow.js";
import { ODDS_PHASES } from "./tournament-odds.js";

const clean = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const MOBILE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const AMERICAN_ODDS = /^(?:[+-][0-9]{1,6}|[+-]∞)$/;
const EXPECTED_RECORD = /^\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?$/;
export const MOBILE_ODDS_LIMITS = Object.freeze({ responseBytes: 262_144 });

function unavailable() {
  return new MobileApiError("MOBILE_API_UNAVAILABLE");
}

function requireValue(condition) {
  if (!condition) throw unavailable();
}

function boundedList(value, maximum, minimum = 0) {
  const result = list(value);
  requireValue(result.length >= minimum && result.length <= maximum);
  return result;
}

function hasNumericValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return clean(value) !== "";
  return typeof value === "number";
}

function finite(value, { minimum = null, maximum = null } = {}) {
  requireValue(hasNumericValue(value));
  const result = Number(value);
  requireValue(Number.isFinite(result));
  if (minimum !== null) requireValue(result >= minimum);
  if (maximum !== null) requireValue(result <= maximum);
  return result;
}

function integer(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  requireValue(hasNumericValue(value));
  const result = Number(value);
  requireValue(Number.isSafeInteger(result) && result >= minimum && result <= maximum);
  return result;
}

function dateTime(value) {
  const result = clean(value);
  requireValue(result && result.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) &&
    Number.isFinite(Date.parse(result)));
  return result;
}

function timestamp(now) {
  return dateTime((now instanceof Date ? now : new Date(now || Date.now())).toISOString());
}

function teamDto(value = {}) {
  const side = integer(value.side, { minimum: 1 });
  const name = clean(value.name);
  const americanOdds = clean(value.americanOdds);
  const teamId = clean(value.id || value.teamId) || null;
  requireValue([1, 2].includes(side) && name && name.length <= 160 &&
    (!teamId || MOBILE_ID.test(teamId)) && AMERICAN_ODDS.test(americanOdds));
  return {
    side,
    teamId,
    name,
    probability: finite(value.probability, { minimum: 0, maximum: 100 }),
    americanOdds,
    expectedPoints: finite(value.expectedPoints, { minimum: 0 }),
  };
}

function playerDto(value = {}, fallbackRank) {
  const playerId = clean(value.id || value.playerId);
  const displayName = clean(value.name || value.displayName);
  const teamSide = integer(value.teamSide, { minimum: 1 });
  const rank = value.rank === null || value.rank === undefined
    ? fallbackRank : integer(value.rank, { minimum: 1, maximum: 64 });
  const americanOdds = clean(value.americanOdds);
  const expectedRecord = clean(value.expectedRecord);
  requireValue(MOBILE_ID.test(playerId) && displayName && displayName.length <= 160 &&
    [1, 2].includes(teamSide) && AMERICAN_ODDS.test(americanOdds) &&
    expectedRecord.length <= 64 && EXPECTED_RECORD.test(expectedRecord));
  return {
    rank,
    playerId,
    displayName,
    teamSide,
    probability: finite(value.probability, { minimum: 0, maximum: 100 }),
    americanOdds,
    expectedPoints: finite(value.expectedPoints, { minimum: 0 }),
    expectedRecord,
    averageFinish: finite(value.averageFinish, { minimum: 1 }),
  };
}

function snapshotDto(value = {}) {
  const payload = value.payload || {};
  const phase = clean(payload.phase || value.milestone);
  const phaseOrder = integer(payload.phaseOrder ?? value.phase_order, { maximum: 4 });
  const publishedAt = dateTime(payload.publishedAt || value.published_at);
  requireValue(ODDS_PHASES[phaseOrder] === phase && clean(value.milestone || phase) === phase &&
    Date.parse(value.published_at || publishedAt) === Date.parse(publishedAt) &&
    value.publication_verified !== false);
  const teams = boundedList(payload.teams, 2, 2).map(teamDto);
  const players = boundedList(payload.players, 64, 1)
    .map((player, index) => playerDto(player, index + 1));
  requireValue(teams.length === 2 && new Set(teams.map((team) => team.side)).size === 2 &&
    players.length > 0 && players.length <= 64 &&
    new Set(players.map((player) => player.playerId)).size === players.length);
  return {
    phase,
    phaseOrder,
    label: projectionPresentationLabel(phase),
    isCurrent: value.is_current_official === true,
    publishedAt,
    iterations: integer(payload.iterations, { minimum: 1, maximum: 100_000_000 }),
    totalPointsAvailable: finite(payload.totalPointsAvailable, { minimum: 0 }),
    teams,
    players,
  };
}

export function mobileOddsDataFromView(value = {}) {
  const publication = value.publication || {};
  const state = clean(publication.state).toUpperCase();
  requireValue(["UNPUBLISHED", "PUBLISHED"].includes(state));
  const revision = integer(publication.revision);
  if (state === "UNPUBLISHED") {
    return {
      publication: {
        state,
        revision,
        publishedAt: null,
        currentPhase: null,
      },
      snapshots: [],
    };
  }
  const publishedAt = dateTime(publication.published_at ?? publication.publishedAt);
  const currentPhase = clean(publication.current_milestone ?? publication.currentMilestone);
  requireValue(ODDS_PHASES.includes(currentPhase));
  const snapshots = boundedList(value.snapshots, ODDS_PHASES.length, 1).map(snapshotDto)
    .sort((left, right) => left.phaseOrder - right.phaseOrder);
  const current = snapshots.filter((snapshot) => snapshot.isCurrent);
  requireValue(snapshots.length > 0 && snapshots.length <= ODDS_PHASES.length &&
    current.length === 1 && current[0].phase === currentPhase &&
    new Set(snapshots.map((snapshot) => snapshot.phase)).size === snapshots.length);
  return {
    publication: { state, revision, publishedAt, currentPhase },
    snapshots,
  };
}

export function mobileOddsRepresentationRevision(data = {}) {
  return scoringShadowPayloadHash({ product: "mobile-published-odds-v1", data });
}

export async function mobileOddsResult(identity, { env = process.env, now, dependencies = {} } = {}) {
  const readProduct = dependencies.readMobilePreviewParticipantContent || readMobilePreviewParticipantContent;
  let read;
  try {
    read = await readProduct("ODDS", identity, { env, dependencies });
  } catch {
    throw unavailable();
  }
  requireValue(clean(read?.payload?.data?.tournament_id) === clean(identity.tournamentId));
  const data = mobileOddsDataFromView(read.payload.data);
  const revision = mobileOddsRepresentationRevision(data);
  const body = {
    ok: true,
    apiVersion: MOBILE_API_VERSION,
    data,
    meta: { generatedAt: timestamp(now), revision },
  };
  requireValue(Buffer.byteLength(JSON.stringify(body), "utf8") <=
    MOBILE_ODDS_LIMITS.responseBytes);
  return {
    status: 200,
    revision,
    body,
  };
}

export const mobileOddsTestSupport = Object.freeze({ snapshotDto, teamDto, playerDto });
