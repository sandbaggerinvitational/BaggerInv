import { leaderboardsCoreDataFromSupabaseView, readLeaderboardsCoreView } from "./leaderboards-core-supabase.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { ODDS_ENGINE_VERSION, ODDS_PHASES, ODDS_PUBLICATION_CONTRACT_VERSION, ODDS_SIMULATION_SEED_VERSION } from "./tournament-odds.js";

const clean = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function buildOddsInputProjection({ tournamentId, tournamentYear, sourceWorkbookId, settings = [], historical = {}, requestedBy = "" } = {}) {
  const canonicalSettings = [...settings].map((row) => ({ ...row })).sort((a, b) => clean(a.Setting).localeCompare(clean(b.Setting)));
  const canonicalHistorical = Object.fromEntries(Object.entries(historical).sort(([a], [b]) => a.localeCompare(b)).map(([playerId, stats]) => [playerId, {
    sandbaggerRatings: Object.fromEntries(Object.entries(stats?.sandbaggerRatings || {}).sort(([a], [b]) => a.localeCompare(b))),
  }]));
  const settingsFingerprint = scoringShadowPayloadHash(canonicalSettings);
  const ratingsFingerprint = scoringShadowPayloadHash(canonicalHistorical);
  return {
    environment: "PREVIEW", tournament_id: clean(tournamentId), tournament_year: number(tournamentYear),
    source_workbook_id: clean(sourceWorkbookId), requested_by: clean(requestedBy || "Odds input projection"),
    settings: canonicalSettings, historical_ratings: canonicalHistorical,
    settings_fingerprint: settingsFingerprint, ratings_fingerprint: ratingsFingerprint,
    pairing_fingerprint: "canonical-current-supabase",
    bundle_fingerprint: scoringShadowPayloadHash({ tournamentId: clean(tournamentId), tournamentYear: number(tournamentYear), settingsFingerprint, ratingsFingerprint }),
  };
}

export const importOddsInputProjection = (input, options = {}) => scoringShadowRpc("import_preview_championship_odds_inputs", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const readOddsInputBundle = (tournamentId = "", options = {}) => scoringShadowRpc("read_championship_odds_inputs", { target_tournament_id: clean(tournamentId) }, { ...options, timeoutMs: options.timeoutMs || 10_000 });
export const publishSupabaseOddsSnapshot = (input, options = {}) => scoringShadowRpc("publish_preview_championship_odds", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });
export const completeSupabaseOddsGoogleMirror = (input, options = {}) => scoringShadowRpc("complete_preview_championship_odds_google_mirror", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });

function matchRows(view = {}, calculated = {}) {
  const liveMatches = (calculated.rounds || []).flatMap((round) => round.matches || []);
  return (view.matches || []).map((entry) => {
    const match = entry.match || {};
    const live = liveMatches.find((row) => clean(row.id) === clean(match.match_id)) || {};
    const row = {
      Year: number(view.tournament?.tournament_year), Round: number(match.round_number), Format: clean(match.format),
      "Match ID": clean(match.match_id), "Team 1 Points": live.team1Points, "Team 2 Points": live.team2Points,
    };
    for (const participant of entry.participants || []) row[`Team ${number(participant.team_side)} Player ${number(participant.player_slot)}`] = clean(participant.player_id);
    return row;
  });
}

export function oddsEngineInputsFromBundle(bundle = {}) {
  const core = bundle.current_state || {};
  const calculated = leaderboardsCoreDataFromSupabaseView(core);
  const year = number(core.tournament?.tournament_year);
  const teams = core.teams || [];
  const players = core.players || [];
  const rounds = core.rounds || [];
  const sheets = {
    tournaments: [{ Year: year, "Tournament ID": clean(core.tournament?.tournament_id) }],
    liveTournaments: [{ Year: year, "Team 1 Name": clean(teams.find((row) => number(row.team_side) === 1)?.name), "Team 2 Name": clean(teams.find((row) => number(row.team_side) === 2)?.name) }],
    players: players.map((row) => ({ "Player ID": clean(row.player_id), "Display Name": clean(row.display_name) })),
    handicaps: players.map((row) => ({ Year: year, "Player ID": clean(row.player_id), "Team Side": `Team ${number(row.team_side)}`, "Tournament Handicap": row.tournament_source_payload?.["Tournament Handicap"] ?? row.source_payload?.["Tournament Handicap"] ?? "" })),
    teamNames: teams.map((row) => ({ Year: year, "Team Side": `Team ${number(row.team_side)}`, "Team Names": clean(row.name) })),
    tournamentRules: rounds.map((row) => ({ Year: year, Round: number(row.round_number), Format: clean(row.format), "Points Available": number(row.source_payload?.["Points Available"], 3) })),
    matches: matchRows(core, calculated),
    projectionMatchSource: "Supabase scoring authority",
  };
  return { sheets, historical: bundle.input_configuration?.historical_ratings || {}, metadata: {
    sourceRevision: core.source_revision || {},
    sourceFingerprint: scoringShadowPayloadHash(core.source_revision || {}),
    settingsFingerprint: clean(bundle.input_configuration?.settings_fingerprint),
    ratingsFingerprint: clean(bundle.input_configuration?.ratings_fingerprint),
    pairingFingerprint: scoringShadowPayloadHash(sheets.matches.map((row) => ({ id: row["Match ID"], round: row.Round, a1: row["Team 1 Player 1"], a2: row["Team 1 Player 2"], b1: row["Team 2 Player 1"], b2: row["Team 2 Player 2"] }))),
    configurationRevision: number(bundle.input_configuration?.configuration_revision),
  } };
}

export async function loadSupabaseOddsInputs(tournamentId = "") {
  const result = await readOddsInputBundle(tournamentId);
  if (!result.payload?.ok) throw Object.assign(new Error("Championship Odds inputs are unavailable."), { code: result.payload?.code || "ODDS_INPUTS_UNAVAILABLE" });
  return { ...oddsEngineInputsFromBundle(result.payload.data), diagnostics: { queryMs: number(result.payload.data.query_ms), serviceMs: number(result.durationMs) } };
}

export function logicalOddsResult(snapshot = {}) {
  const { publishedAt: _publishedAt, ...logical } = snapshot;
  return logical;
}

function legacyComparableOddsResult(snapshot = {}) {
  const { publishedAt: _publishedAt, engineVersion: _engineVersion, publicationContractVersion: _publicationContractVersion,
    deterministicSeed: _deterministicSeed, ...logical } = snapshot;
  return {
    ...logical,
    teams: (logical.teams || []).map(({ rawProbability: _rawProbability, ...team }) => team)
      .sort((left, right) => number(left.side) - number(right.side)),
    players: (logical.players || []).map(({ rawProbability: _rawProbability, rank: _rank, ...player }) => player)
      .sort((left, right) => clean(left.id).localeCompare(clean(right.id))),
  };
}

export function compareOddsDeterministicParity(expected = {}, actual = {}) {
  const left = logicalOddsResult(expected); const right = logicalOddsResult(actual);
  const exact = scoringShadowPayloadHash(left) === scoringShadowPayloadHash(right);
  const crossContract = clean(expected.publicationContractVersion) !== clean(actual.publicationContractVersion);
  const valueParity = crossContract && scoringShadowPayloadHash(legacyComparableOddsResult(expected)) === scoringShadowPayloadHash(legacyComparableOddsResult(actual));
  const pass = exact || valueParity;
  return { pass, exact, valueParity, rankingContractChanged: pass && !exact,
    expectedHash: scoringShadowPayloadHash(left), actualHash: scoringShadowPayloadHash(right),
    ...(pass ? {} : { expected: left, actual: right }) };
}

export function buildSupabaseOddsPublication({ snapshot, tournamentId, actorId, metadata = {} } = {}) {
  if (!ODDS_PHASES.includes(clean(snapshot?.phase))) throw Object.assign(new Error("Invalid official phase."), { code: "INVALID_ODDS_MILESTONE" });
  if (clean(snapshot?.engineVersion) !== ODDS_ENGINE_VERSION || clean(snapshot?.publicationContractVersion) !== ODDS_PUBLICATION_CONTRACT_VERSION) {
    throw Object.assign(new Error("The Odds snapshot does not use the current prospective publication contract."), { code: "ODDS_PUBLICATION_CONTRACT_UNSUPPORTED" });
  }
  const logicalPayloadHash = scoringShadowPayloadHash(logicalOddsResult(snapshot));
  return { environment: "PREVIEW", tournament_id: clean(tournamentId || snapshot.year), milestone: clean(snapshot.phase),
    actor_id: clean(actorId), published_payload: snapshot, payload_hash: scoringShadowPayloadHash(snapshot), logical_payload_hash: logicalPayloadHash,
    source_revision: metadata.sourceRevision || {},
    source_fingerprint: clean(metadata.sourceFingerprint), settings_fingerprint: clean(metadata.settingsFingerprint),
    ratings_fingerprint: clean(metadata.ratingsFingerprint), pairing_fingerprint: clean(metadata.pairingFingerprint),
    engine_version: ODDS_ENGINE_VERSION, deterministic_seed: clean(snapshot.deterministicSeed) || `${snapshot.year}|${snapshot.phase}|${ODDS_SIMULATION_SEED_VERSION}`,
    simulation_metadata: { iterations: number(snapshot.iterations), totalPointsAvailable: number(snapshot.totalPointsAvailable), phaseOrder: number(snapshot.phaseOrder),
      publicationContractVersion: ODDS_PUBLICATION_CONTRACT_VERSION, probabilityPrecision: "full simulation precision before presentation rounding" },
  };
}
