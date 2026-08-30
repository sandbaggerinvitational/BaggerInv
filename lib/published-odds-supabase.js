import { oddsWorkbookValue } from "./odds-workbook-persistence.js";
import { scoringShadowPayloadHash, scoringShadowRpc } from "./scoring-shadow.js";
import { ODDS_PHASES } from "./tournament-odds.js";

export const PUBLISHED_ODDS_WORKBOOK_TABS = Object.freeze(["Odds Control", "Odds Snapshots", "Odds Team Results", "Odds Player Results"]);
const clean = (value) => String(value ?? "").trim();
const number = (value) => value === null || value === undefined || clean(value) === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const records = (sheet) => (sheet?.records || []).map(({ record }) => record);
const fingerprint = (value) => /^[0-9a-f]{64}$/i.test(clean(value)) ? clean(value).toLowerCase() : "";

function sameInstant(left, right) {
  const leftMs = Date.parse(clean(left));
  const rightMs = Date.parse(clean(right));
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function exactNumber(left, right) {
  return number(left) !== null && number(left) === number(right);
}

// Google may preserve a positive American-odds sign in a reporting cell even
// though the persistence contract intentionally writes a native number.  The
// sign is presentation, not publication data: "+105" and 105 are the same
// finite value.  Non-finite 0%/100% odds are different: oddsWorkbookValue()
// maps only those outcomes to an explicit blank, and reporting parity must
// require that the workbook is blank as well.
function exactWorkbookOdds(left, right) {
  if (clean(right) === "") return clean(left) === "";
  return exactNumber(left, right);
}

function parsePublishedSnapshot(row = {}) {
  let payload;
  try { payload = JSON.parse(clean(row["Snapshot JSON"])); }
  catch { throw Object.assign(new Error("Odds Snapshots contains invalid published JSON."), { code: "INVALID_PUBLISHED_ODDS_JSON" }); }
  const year = number(row.Year);
  const phase = clean(row.Phase);
  const publishedAt = clean(row["Published At"]);
  if (!Number.isInteger(year) || !ODDS_PHASES.includes(phase) || number(payload.year) !== year || clean(payload.phase) !== phase || clean(payload.publishedAt) !== publishedAt) {
    throw Object.assign(new Error(`Published Odds snapshot identity does not match its ${phase || "unknown"} reporting row.`), { code: "PUBLISHED_ODDS_IDENTITY_MISMATCH" });
  }
  if (!Array.isArray(payload.teams) || !payload.teams.length || !Array.isArray(payload.players) || !payload.players.length) {
    throw Object.assign(new Error(`Published Odds snapshot ${phase} is incomplete.`), { code: "INCOMPLETE_PUBLISHED_ODDS_SNAPSHOT" });
  }
  return payload;
}

function teamDivergences(snapshot, rows) {
  const expected = snapshot.teams || [];
  const found = rows.filter((row) => number(row.Year) === number(snapshot.year) && clean(row.Phase) === clean(snapshot.phase));
  const divergences = [];
  if (found.length !== expected.length) divergences.push({ scope: "TEAM", phase: snapshot.phase, code: "ROW_COUNT", expected: expected.length, actual: found.length });
  for (const item of expected) {
    const row = found.find((candidate) => clean(candidate.Team) === clean(item.name));
    const workbookOdds = oddsWorkbookValue(item, { worksheet: "Odds Team Results", identity: { team: item.name, phase: snapshot.phase } });
    if (!row || !exactNumber(row["Win Probability"], item.probability) || !exactWorkbookOdds(row["American Odds"], workbookOdds) || !exactNumber(row["Expected Points"], item.expectedPoints)) {
      divergences.push({ scope: "TEAM", phase: snapshot.phase, identity: clean(item.name), code: "VALUE_DIVERGENCE" });
    }
  }
  return divergences;
}

function playerDivergences(snapshot, rows) {
  const expected = snapshot.players || [];
  const found = rows.filter((row) => number(row.Year) === number(snapshot.year) && clean(row.Phase) === clean(snapshot.phase));
  const divergences = [];
  if (found.length !== expected.length) divergences.push({ scope: "PLAYER", phase: snapshot.phase, code: "ROW_COUNT", expected: expected.length, actual: found.length });
  for (const item of expected) {
    const row = found.find((candidate) => clean(candidate["Player ID"]) === clean(item.id));
    const workbookOdds = oddsWorkbookValue(item, { worksheet: "Odds Player Results", identity: { playerId: item.id, phase: snapshot.phase } });
    if (!row || clean(row.Player) !== clean(item.name) || !exactNumber(row["Top Player Probability"], item.probability)
        || !exactWorkbookOdds(row["American Odds"], workbookOdds) || !exactNumber(row["Expected Points"], item.expectedPoints)
        || clean(row["Expected Record"]) !== clean(item.expectedRecord) || !exactNumber(row["Average Finish"], item.averageFinish)) {
      divergences.push({ scope: "PLAYER", phase: snapshot.phase, identity: clean(item.id), code: "VALUE_DIVERGENCE" });
    }
  }
  return divergences;
}

export function buildPublishedOddsImport({ sheets = {}, tournamentId, tournamentYear, sourceWorkbookId, requestedBy } = {}) {
  const year = number(tournamentYear);
  const snapshotRows = records(sheets["Odds Snapshots"]).filter((row) => number(row.Year) === year);
  const controls = records(sheets["Odds Control"]).filter((row) => number(row.Year) === year);
  if (controls.length !== 1) throw Object.assign(new Error(`Expected one Odds Control row for ${year}; found ${controls.length}.`), { code: "PUBLISHED_ODDS_CONTROL_REQUIRED" });
  const currentPhase = clean(controls[0]["Current Official Phase"]);
  if (!ODDS_PHASES.includes(currentPhase)) throw Object.assign(new Error("Odds Control has no supported current official milestone."), { code: "PUBLISHED_ODDS_CONTROL_INVALID" });
  const parsed = snapshotRows.map((row) => ({ row, payload: parsePublishedSnapshot(row) }));
  if (new Set(parsed.map(({ payload }) => payload.phase)).size !== parsed.length) throw Object.assign(new Error("Odds Snapshots has duplicate logical milestones."), { code: "DUPLICATE_PUBLISHED_ODDS_MILESTONE" });
  if (!parsed.some(({ payload }) => payload.phase === currentPhase)) throw Object.assign(new Error("Odds Control selects an incomplete or missing published milestone."), { code: "CURRENT_PUBLISHED_ODDS_MILESTONE_INCOMPLETE" });
  const teamRows = records(sheets["Odds Team Results"]);
  const playerRows = records(sheets["Odds Player Results"]);
  const snapshots = parsed.sort((a, b) => ODDS_PHASES.indexOf(a.payload.phase) - ODDS_PHASES.indexOf(b.payload.phase)).map(({ row, payload }) => {
    const teamIssues = teamDivergences(payload, teamRows);
    const playerIssues = playerDivergences(payload, playerRows);
    if (teamIssues.length || playerIssues.length) throw Object.assign(new Error(`Published Odds reporting rows diverge at ${payload.phase}.`), {
      code: "PUBLISHED_ODDS_REPORTING_DIVERGENCE", divergences: [...teamIssues, ...playerIssues],
    });
    const phaseTeamRows = teamRows.filter((item) => number(item.Year) === year && clean(item.Phase) === payload.phase);
    const phasePlayerRows = playerRows.filter((item) => number(item.Year) === year && clean(item.Phase) === payload.phase);
    const payloadHash = scoringShadowPayloadHash(payload);
    return {
      milestone: payload.phase,
      phase_order: ODDS_PHASES.indexOf(payload.phase),
      published_at: payload.publishedAt,
      published_payload: payload,
      payload_hash: payloadHash,
      source_fingerprint: clean(payload.sourceFingerprint),
      engine_version: clean(payload.engineVersion),
      engine_metadata: { iterations: number(payload.iterations), totalPointsAvailable: number(payload.totalPointsAvailable), phaseOrder: number(payload.phaseOrder) },
      google_publication_fingerprint: scoringShadowPayloadHash({ snapshotRow: row, teamRows: phaseTeamRows, playerRows: phasePlayerRows }),
      google_publication_reference: { sheets: PUBLISHED_ODDS_WORKBOOK_TABS, year, phase: payload.phase },
      publication_verified: true,
    };
  });
  const canonical = { tournamentId: clean(tournamentId), year, currentPhase, snapshots };
  return { environment: "PREVIEW", tournament_id: clean(tournamentId), source_workbook_id: clean(sourceWorkbookId),
    requested_by: clean(requestedBy || "Published Odds refresh"), current_official_milestone: currentPhase,
    import_fingerprint: scoringShadowPayloadHash(canonical), snapshots };
}

export const replacePublishedOddsSnapshots = (input, options = {}) => scoringShadowRpc("replace_preview_published_odds_snapshots", { input }, { ...options, timeoutMs: options.timeoutMs || 15_000 });

export const readPublishedOddsView = ({ tournamentId, sourceWorkbookId } = {}, options = {}) => scoringShadowRpc("read_published_odds_view", {
  target_tournament_id: clean(tournamentId) || null,
  target_source_workbook_id: clean(sourceWorkbookId) || null,
}, { ...options, timeoutMs: options.timeoutMs || 8_000 });

export function publishedOddsSnapshotsFromView(view = {}) {
  return (view.snapshots || []).map((item) => item.payload).sort((left, right) => number(left.phaseOrder) - number(right.phaseOrder));
}

// Published Odds are immutable milestone snapshots. Freshness means the read
// resolves exactly one verified current-official publication whose stored
// identity still matches its immutable payload. It deliberately does not age
// out because live scoring or a calculation-input configuration later changes;
// only an explicit publication can supersede another publication.
export function publishedOddsFreshness(view = {}) {
  const rows = Array.isArray(view.snapshots) ? view.snapshots : [];
  const control = view.publication && typeof view.publication === "object"
    ? view.publication : {};
  const authority = clean(control.authority || "SUPABASE").toUpperCase();
  const officialRows = rows.filter((item) => item?.is_current_official === true);
  const current = officialRows.length === 1 ? officialRows[0] : null;
  const reasons = [];
  if (!rows.length) reasons.push("PUBLISHED_ODDS_HISTORY_EMPTY");
  if (!officialRows.length) reasons.push("CURRENT_OFFICIAL_SNAPSHOT_MISSING");
  if (officialRows.length > 1) reasons.push("MULTIPLE_CURRENT_OFFICIAL_SNAPSHOTS");
  if (current) {
    if (current.publication_verified !== true) reasons.push("CURRENT_PUBLICATION_UNVERIFIED");
    if (clean(current.milestone) !== clean(current.payload?.phase)) reasons.push("CURRENT_MILESTONE_IDENTITY_MISMATCH");
    const storedOrder = number(current.phase_order);
    const payloadOrder = number(current.payload?.phaseOrder);
    if (storedOrder === null || payloadOrder === null || storedOrder !== payloadOrder) reasons.push("CURRENT_PHASE_ORDER_MISMATCH");
    if (!sameInstant(current.published_at, current.payload?.publishedAt)) reasons.push("CURRENT_PUBLICATION_TIMESTAMP_MISMATCH");
    if (!fingerprint(current.payload_hash)) reasons.push("CURRENT_PAYLOAD_FINGERPRINT_INVALID");
    const storedSource = fingerprint(current.source_fingerprint);
    const payloadSource = fingerprint(current.payload?.sourceFingerprint);
    if (storedSource && payloadSource && storedSource !== payloadSource) reasons.push("CURRENT_SOURCE_FINGERPRINT_MISMATCH");
    if (!Number.isInteger(number(current.publication_revision)) || number(current.publication_revision) < 1) reasons.push("CURRENT_PUBLICATION_REVISION_INVALID");
  }
  if (control.state && clean(control.state).toUpperCase() !== "PUBLISHED") {
    reasons.push("CURRENT_PUBLICATION_STATE_INVALID");
  }
  if (control.stale === true || clean(control.freshness).toUpperCase() === "STALE") {
    reasons.push("CURRENT_PUBLICATION_MARKED_STALE");
  }
  const payload = current?.payload || null;
  const googleFingerprint = fingerprint(current?.google_publication_fingerprint);
  const configurationFingerprint = fingerprint(current?.settings_fingerprint)
    || fingerprint(payload?.configurationFingerprint)
    || fingerprint(payload?.settingsFingerprint);
  const status = reasons.length ? (current ? "STALE" : "UNAVAILABLE") : "CURRENT_OFFICIAL";
  const controlRevision = number(control.publication_revision);
  return {
    status,
    current: status === "CURRENT_OFFICIAL",
    official: Boolean(current && current.publication_verified === true),
    stale: reasons.length > 0,
    reasons,
    currentMilestone: clean(current?.milestone) || null,
    publicationRevision: controlRevision ?? number(current?.publication_revision),
    publishedAt: clean(current?.published_at || payload?.publishedAt) || null,
    payloadFingerprint: fingerprint(current?.payload_hash) || null,
    sourceFingerprint: fingerprint(current?.source_fingerprint) || fingerprint(payload?.sourceFingerprint) || null,
    configurationFingerprint: configurationFingerprint || null,
    configurationVersion: clean(payload?.configurationVersion) || null,
    engineVersion: clean(current?.engine_version || payload?.engineVersion) || null,
    contractVersion: clean(payload?.publicationContractVersion) || "odds-v2-nassau",
    historyCount: number(view.history_count) ?? rows.length,
    publicationAuthority: authority,
    publicationState: clean(control.state) || (current ? "PUBLISHED" : "UNPUBLISHED"),
    publishedSnapshotId: clean(control.snapshot_id) || null,
    authorityEpochId: clean(control.authority_epoch_id) || null,
    resourceBindingFingerprint: fingerprint(control.resource_binding_fingerprint) || null,
    googlePublicationFallback: control.google_publication_fallback === true,
    googleMirror: authority === "SUPABASE" && clean(control.google_mirror).toUpperCase() === "RETIRED"
      ? { status: "RETIRED", fingerprint: null }
      : {
        status: googleFingerprint && !/^0{64}$/.test(googleFingerprint) ? "VERIFIED" : "UNVERIFIED_OR_PENDING",
        fingerprint: googleFingerprint || null,
      },
    semantics: {
      scoringRevisionAffectsFreshness: false,
      calculationInputRevisionAffectsFreshness: false,
      publicationTimestampAloneIsSufficient: false,
      supersededWhenCurrentOfficialIsFalse: true,
    },
  };
}

export function publishedOddsLegacyPublication(snapshots = []) {
  const history = [...snapshots].sort((left, right) => number(left.phaseOrder) - number(right.phaseOrder));
  const current = history.at(-1) || null;
  return {
    status: current ? "CURRENT_OFFICIAL" : "UNAVAILABLE",
    current: Boolean(current),
    official: Boolean(current),
    stale: !current,
    reasons: current ? [] : ["CURRENT_OFFICIAL_SNAPSHOT_MISSING"],
    currentMilestone: clean(current?.phase) || null,
    publicationRevision: null,
    publishedAt: clean(current?.publishedAt) || null,
    payloadFingerprint: current ? scoringShadowPayloadHash(current) : null,
    sourceFingerprint: fingerprint(current?.sourceFingerprint) || null,
    configurationFingerprint: fingerprint(current?.configurationFingerprint)
      || fingerprint(current?.settingsFingerprint) || null,
    configurationVersion: clean(current?.configurationVersion) || null,
    engineVersion: clean(current?.engineVersion) || null,
    contractVersion: clean(current?.publicationContractVersion) || "odds-v2-nassau",
    historyCount: history.length,
    googleMirror: { status: current ? "GOOGLE_AUTHORITY" : "UNAVAILABLE", fingerprint: null },
    semantics: {
      scoringRevisionAffectsFreshness: false,
      calculationInputRevisionAffectsFreshness: false,
      publicationTimestampAloneIsSufficient: false,
      supersededWhenCurrentOfficialIsFalse: true,
    },
  };
}

export function comparePublishedOddsParity(expected = [], actual = []) {
  const normalize = (rows) => rows.map((snapshot) => ({ ...snapshot })).sort((left, right) => number(left.phaseOrder) - number(right.phaseOrder));
  const left = normalize(expected); const right = normalize(actual);
  const pass = scoringShadowPayloadHash(left) === scoringShadowPayloadHash(right);
  return { pass, ...(pass ? {} : { expected: left, actual: right }) };
}
