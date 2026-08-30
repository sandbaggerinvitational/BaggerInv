import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_TOURNAMENT_ID,
} from "./production-foundation-resource-contract.js";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const truthy = (value) => value === true || /^(?:1|true|yes|on|enabled)$/i.test(clean(value));

export const PRODUCTION_DIRECTOR_SECTIONS = Object.freeze([
  Object.freeze({ id: "overview", label: "Overview", href: "/admin/director" }),
  Object.freeze({ id: "players-access", label: "Players & Access", href: "/admin/director?section=players-access" }),
  Object.freeze({ id: "handicaps", label: "Handicaps", href: "/admin/director?section=handicaps" }),
  Object.freeze({ id: "tournament-setup", label: "Tournament Setup", href: "/admin/director?section=tournament-setup" }),
  Object.freeze({ id: "tournament-day", label: "Tournament Day", href: "/admin/director?section=tournament-day" }),
  Object.freeze({ id: "odds-side-games", label: "Odds & Side Games", href: "/admin/director?section=odds-side-games" }),
  Object.freeze({ id: "draft-guide", label: "Draft & Guide", href: "/admin/director?section=draft-guide" }),
  Object.freeze({ id: "system-audit", label: "System / Audit", href: "/admin/director?section=system-audit" }),
]);

export function productionDirectorSection(value) {
  const selected = clean(value).toLowerCase();
  return PRODUCTION_DIRECTOR_SECTIONS.some((section) => section.id === selected)
    ? selected
    : "overview";
}

export function productionDirectorAuthorizationFailure(authorization = {}) {
  if (authorization.status === "unavailable") {
    return Object.freeze({
      status: 503,
      code: "DIRECTOR_AUTHORIZATION_UNAVAILABLE",
      message: "Director access could not be verified right now. Please try again.",
      retryable: true,
    });
  }
  return Object.freeze({
    status: 403,
    code: "DIRECTOR_AUTHORIZATION_REQUIRED",
    message: "Active Tournament Director access is required.",
    retryable: false,
  });
}

function productionDirectorDataError(error) {
  const result = new Error("Production tournament data is temporarily unavailable.");
  result.code = "DIRECTOR_DATA_UNAVAILABLE";
  result.status = 503;
  result.causeCode = clean(error?.code || error?.causeCode || "PRODUCTION_DIRECTOR_READ_FAILED");
  return result;
}

function resultPayload(result) {
  if (!result || typeof result !== "object") return null;
  return result.payload?.data ?? result.payload ?? result.data ?? result;
}

function successfulPayload(result) {
  const payload = resultPayload(result);
  if (!payload || typeof payload !== "object") return null;
  if (result?.payload && result.payload.ok !== true) return null;
  if (Object.hasOwn(payload, "ok") && payload.ok !== true) return null;
  return payload;
}

function optionalRead(settled) {
  if (settled?.status !== "fulfilled") return { available: false, data: null };
  const data = successfulPayload(settled.value);
  return { available: Boolean(data), data };
}

function stateValue(source, ...keys) {
  for (const key of keys) if (source && Object.hasOwn(source, key)) return source[key];
  return undefined;
}

function rosterCount(view = {}, enrollment = null) {
  const enrolledTotal = stateValue(enrollment, "activeRosterCount", "active_roster_count");
  if (Number.isFinite(Number(enrolledTotal))) return Number(enrolledTotal);
  return (view.players || []).filter((player) =>
    upper(player.participation_status || player.status || "ACTIVE") === "ACTIVE").length;
}

function currentRound(live = {}) {
  const numberValue = number(live.tournament?.currentRound, 0);
  const round = (live.rounds || []).find((item) => number(item.number) === numberValue) || null;
  return {
    number: numberValue || null,
    label: clean(round?.label || (numberValue ? `Round ${numberValue}` : "Not started")),
    status: upper(round?.status || live.tournament?.status || "UPCOMING"),
    format: clean(round?.format),
  };
}

function authorityModel(readState = {}, workers = null) {
  const scoring = upper(stateValue(readState, "scoring_authority", "scoringAuthority"));
  const reads = upper(stateValue(readState, "current_tournament_read_authority", "currentTournamentReadAuthority"));
  const identity = upper(stateValue(readState, "participant_identity_authority", "participantIdentityAuthority"));
  const workerIngress = stateValue(workers, "ingress") || {};
  const ingress = upper(workerIngress.state || stateValue(readState, "scoring_ingress_state", "scoringIngressState") ||
    (truthy(stateValue(readState, "scoring_ingress_enabled", "scoringIngressEnabled")) ? "OPEN" : "PAUSED"));
  const activation = upper(stateValue(readState, "activation_state", "activationState"));
  const maintenance = upper(stateValue(readState, "maintenance_state", "maintenanceState"));
  const maintenanceNormal = maintenance === "NORMAL" || (!maintenance && ingress === "OPEN" &&
    (!activation || ["ACTIVE", "OBSERVATION", "SCORING_COMMITTED"].includes(activation)));
  return {
    scoring: { value: scoring || "UNAVAILABLE", label: scoring === "SUPABASE" ? "Supabase" : "Needs attention" },
    reads: { value: reads || "UNAVAILABLE", label: reads === "SUPABASE" ? "Supabase" : "Needs attention" },
    identity: { value: identity || "UNAVAILABLE", label: identity === "SUPABASE" ? "Supabase" : "Needs attention" },
    ingress: { value: ingress || "UNAVAILABLE", label: ingress === "OPEN" ? "Open" : "Paused" },
    maintenance: {
      value: maintenanceNormal ? "NORMAL" : "ATTENTION",
      label: maintenanceNormal ? "Normal" : "Attention",
    },
    phase: clean(stateValue(readState, "read_cutover_phase", "readCutoverPhase")),
  };
}

function enrollmentModel(enrollment = null, view = {}) {
  if (!enrollment) {
    const total = rosterCount(view, null);
    return { available: false, total, enrolled: 0, pending: total, invalid: 0, state: "UNAVAILABLE" };
  }
  const total = number(stateValue(enrollment, "activeRosterCount", "active_roster_count"));
  const enrolled = number(stateValue(enrollment, "enrolledCount", "enrolled_count"));
  const pending = number(stateValue(enrollment, "notEnrolledCount", "not_enrolled_count"), Math.max(0, total - enrolled));
  const invalid = number(stateValue(enrollment, "invalidEnrolledCount", "invalid_enrolled_count"));
  return {
    available: true,
    total,
    enrolled,
    pending,
    invalid,
    state: invalid > 0 ? "ATTENTION" : pending > 0 ? "IN_PROGRESS" : "READY",
  };
}

function workerModel(readState = {}, workers = null) {
  if (!workers) return { available: false, enabled: false, healthy: false, state: "UNAVAILABLE", items: [], pending: 0 };
  const controls = stateValue(workers, "worker_controls", "workerControls") || {};
  const items = Object.entries(controls).map(([id, control]) => ({
    id: clean(id),
    enabled: control?.enabled === true,
    scheduled: control?.scheduler_installed === true || control?.schedulerInstalled === true,
  }));
  const outboxCounts = stateValue(workers, "outbox_counts", "outboxCounts") || {};
  const archiveCounts = stateValue(workers, "archive_counts", "archiveCounts") || {};
  const nonTerminal = (counts, terminal) => Object.entries(counts).reduce((total, [status, amount]) =>
    terminal.includes(upper(status)) ? total : total + number(amount), 0);
  const pending = nonTerminal(outboxCounts, ["DELIVERED"]) +
    nonTerminal(archiveCounts, ["VERIFIED", "SUPERSEDED", "COMPLETE", "COMPLETED"]);
  const globallyEnabled = truthy(stateValue(readState, "workers_enabled", "workersEnabled"));
  const enabled = globallyEnabled && items.length > 0 && items.every((item) => item.enabled);
  return {
    available: true,
    enabled,
    healthy: enabled && pending === 0,
    state: !enabled ? "ATTENTION" : pending > 0 ? "WORKING" : "HEALTHY",
    items,
    pending,
    queues: {
      outbox: Object.fromEntries(Object.entries(outboxCounts).map(([key, value]) => [upper(key), number(value)])),
      archive: Object.fromEntries(Object.entries(archiveCounts).map(([key, value]) => [upper(key), number(value)])),
    },
  };
}

function oddsModel(odds = null) {
  if (!odds) return { available: false, state: "UNAVAILABLE", label: "Unavailable", publishedAt: "" };
  if (odds.publication_revision !== undefined || odds.publicationRevision !== undefined) {
    const state = upper(stateValue(odds, "state", "publication_state", "publicationState") || "UNPUBLISHED");
    return {
      available: true,
      state,
      label: state === "PUBLISHED" ? "Published" : state === "STALE" ? "Needs review" : "Not published",
      publishedAt: clean(stateValue(odds, "published_at", "publishedAt")),
      revision: number(stateValue(odds, "publication_revision", "publicationRevision")),
      snapshotId: clean(stateValue(odds, "published_snapshot_id", "snapshot_id", "snapshotId")),
      freshness: upper(stateValue(odds, "freshness") || (state === "PUBLISHED" ? "CURRENT" : "UNPUBLISHED")),
      authority: upper(stateValue(odds, "publication_authority", "authority")),
      stale: odds.stale === true,
    };
  }
  const rows = Array.isArray(odds.snapshots) ? odds.snapshots : [];
  const current = rows.find((row) => row?.is_current_official === true) || null;
  return {
    available: true,
    state: current ? "PUBLISHED" : rows.length ? "ATTENTION" : "NOT_PUBLISHED",
    label: current ? "Published" : rows.length ? "Review required" : "Not published",
    publishedAt: clean(current?.published_at || current?.payload?.publishedAt),
    milestone: clean(current?.milestone || current?.payload?.phase),
  };
}

function permissionState(match = {}, permissions = [], expectedPlayers = []) {
  const currentRevision = number(match.permission_revision ?? match.permissionRevision, -1);
  const expectedIds = new Set(expectedPlayers.map((player) => clean(player.player_id || player.id)).filter(Boolean));
  const rows = permissions.filter((row) => clean(row.match_id || row.matchId) === clean(match.match_id || match.id));
  const current = rows.filter((row) => number(row.permission_revision ?? row.permissionRevision, -2) === currentRevision);
  const currentIds = new Set(current.map((row) => clean(row.player_id || row.playerId)).filter(Boolean));
  const complete = expectedIds.size > 0 && expectedIds.size === currentIds.size &&
    [...expectedIds].every((id) => currentIds.has(id));
  const active = current.filter((row) => row.can_score === true && !clean(row.revoked_at || row.revokedAt));
  const state = !complete ? "NEEDS_SETUP" : active.length === current.length ? "ACTIVE" : active.length === 0 ? "REVOKED" : "MIXED";
  return { state, complete, activeCount: active.length, expectedCount: expectedIds.size, permissionCount: current.length };
}

export function productionMatchControlActions(match = {}) {
  const status = upper(match.status);
  const final = status === "FINAL";
  const locked = match.scoringLocked === true;
  const access = upper(match.accessState);
  const permissionComplete = match.permissionComplete === true;
  const actions = [];
  if (status === "UPCOMING" && match.scoringReady === true) actions.push("mark-live");
  if (!final && !locked) actions.push("scoring-lock");
  if (!final && locked && permissionComplete) actions.push("scoring-unlock");
  if (!final && !locked && permissionComplete && access !== "ACTIVE") actions.push("access-activate");
  if (!final && ["ACTIVE", "MIXED"].includes(access)) actions.push("access-revoke");
  if (!final && !locked && match.scorecardComplete === true && number(match.scoredHoles) === 18 &&
      number(match.unresolvedMutations) === 0 && clean(match.resultWinner)) actions.push("finalize");
  if (final) actions.push("reopen");
  return actions;
}

export function buildProductionTournamentDay({ live = {}, view = {}, scoringState = null, mutationContract = null } = {}) {
  const canonicalMatches = new Map((scoringState?.matches || []).map((match) => [clean(match.match_id), match]));
  const permissions = scoringState?.permissions || [];
  const entries = new Map((view.matches || []).map((entry) => [clean(entry.match?.match_id), entry]));
  const rounds = (live.rounds || []).map((round) => ({
    number: number(round.number),
    label: clean(round.label || `Round ${round.number}`),
    format: clean(round.format),
    status: upper(round.status),
    matches: (round.matches || []).map((display) => {
      const entry = entries.get(clean(display.id)) || {};
      const canonical = canonicalMatches.get(clean(display.id)) || entry.match || {};
      const participants = entry.participants || [];
      const access = permissionState(canonical, permissions, participants);
      const model = {
        id: clean(display.id || canonical.match_id),
        roundNumber: number(display.round || canonical.round_number || round.number),
        matchNumber: clean(display.match || entry.presentation?.display_match_number || canonical.match_number || display.id),
        format: clean(display.formatName || display.format || canonical.format),
        teamOne: (display.team1Players || []).map((player) => ({ id: clean(player.id), name: clean(player.name) })),
        teamTwo: (display.team2Players || []).map((player) => ({ id: clean(player.id), name: clean(player.name) })),
        course: clean(display.course?.name || display.course?.id),
        tee: clean(display.course?.tee),
        teeTime: clean(display.teeTime),
        startingHole: clean(display.startingHole),
        status: upper(canonical.status || display.status),
        currentHole: number(canonical.current_hole ?? display.currentHole),
        scoredHoles: number(canonical.scored_holes ?? display.scoredHoles),
        holesRemaining: number(canonical.holes_remaining ?? display.holesRemaining, 18),
        result: clean(canonical.running_result || canonical.result_winner || display.liveStatusText || display.finalResult),
        resultWinner: clean(canonical.result_winner || display.matchupWinner),
        scoringLocked: canonical.scoring_locked === true || display.scoringLocked === true,
        accessState: access.state,
        permissionComplete: access.complete,
        activePermissionCount: access.activeCount,
        expectedPermissionCount: access.expectedCount,
        matchRevision: number(canonical.match_revision ?? display.matchRevision),
        permissionRevision: number(canonical.permission_revision),
        scorecardComplete: canonical.scorecard_complete === true,
        unresolvedMutations: number(canonical.unresolved_mutations),
        scoringReady: canonical.scoring_ready === true,
        scoringReadinessReasons: Array.isArray(canonical.scoring_readiness_reasons)
          ? canonical.scoring_readiness_reasons.map(clean).filter(Boolean)
          : [],
        finalizedAt: clean(canonical.finalized_at || display.finalizedAt),
        updatedAt: clean(canonical.updated_at || canonical.authority_updated_at || display.updatedAt),
      };
      return { ...model, actions: productionMatchControlActions(model), warnings: [
        model.status === "UPCOMING" && !model.scoringReady
          ? model.scoringReadinessReasons[0] || "Scoring readiness must be verified before this match can be marked Live."
          : "",
        !model.permissionComplete ? "Participant scoring access needs setup." : "",
        model.unresolvedMutations > 0 ? `${model.unresolvedMutations} scoring ${model.unresolvedMutations === 1 ? "update needs" : "updates need"} resolution.` : "",
        model.status !== "FINAL" && model.scoredHoles === 18 && !model.scorecardComplete ? "The scorecard is not yet complete." : "",
      ].filter(Boolean) };
    }),
  }));
  return {
    available: Boolean(scoringState && mutationContract),
    mutationContract,
    rounds,
    matchCount: rounds.reduce((total, round) => total + round.matches.length, 0),
  };
}

function projectionModel({ prediction = null, draft = null, guide = null } = {}) {
  const currentDraft = draft?.drafts?.[0] || null;
  const picks = currentDraft?.picks || currentDraft?.draftPicks || [];
  return {
    predictionSettings: prediction ? {
      available: true,
      revision: number(prediction.revision),
      validation: upper(prediction.validationStatus || prediction.projectionStatus || "VALID"),
      synchronizedAt: clean(prediction.synchronizedAt),
      freshness: "UNKNOWN",
    } : { available: false, revision: null, validation: "UNAVAILABLE", synchronizedAt: "", freshness: "UNKNOWN" },
    draft: currentDraft ? {
      available: true,
      revision: number(currentDraft.projection?.revision),
      synchronizedAt: clean(currentDraft.projection?.synchronizedAt),
      year: number(currentDraft.year),
      state: upper(currentDraft.state || currentDraft.status || currentDraft.configuration?.status || "CONFIGURED"),
      pickCount: Array.isArray(picks) ? picks.length : number(currentDraft.pickCount),
      freshness: "UNKNOWN",
    } : { available: false, revision: null, synchronizedAt: "", year: null, state: "UNAVAILABLE", pickCount: 0, freshness: "UNKNOWN" },
    guide: guide ? {
      available: true,
      revision: number(guide.metadata?.revision || guide.revision),
      synchronizedAt: clean(guide.metadata?.publishedAt || guide.synchronizedAt),
      state: "READY",
      freshness: "UNKNOWN",
    } : { available: false, revision: null, synchronizedAt: "", state: "UNAVAILABLE", freshness: "UNKNOWN" },
  };
}

function sideGameModel(result, property) {
  if (!result) return { available: false, state: "UNAVAILABLE", label: "Unavailable" };
  const state = upper(result[property]?.state || "UNAVAILABLE");
  const labels = {
    NOT_CONFIGURED: "Not configured",
    CONFIGURED: "Configured",
    IN_PROGRESS: "In progress",
    OFFICIAL: "Official",
    PUBLISHED: "Published",
    OPEN: "Open",
    CLOSED: "Closed",
    SETTLED: "Settled",
    UNAVAILABLE: "Unavailable",
  };
  return {
    available: result[property]?.available !== false && state !== "UNAVAILABLE",
    state,
    label: labels[state] || state.toLowerCase().replaceAll("_", " "),
    stale: result[property]?.stale === true,
  };
}

function netSkinsModel(result = null) {
  const summary = sideGameModel(result, "netSkinsState");
  const state = result?.netSkinsState || {};
  const rounds = result?.netSkins?.rounds || [];
  return {
    ...summary,
    configurationRevision: number(state.configurationRevision),
    resultRevision: number(state.resultRevision),
    stale: state.stale === true,
    configuredRounds: rounds.map((round) => number(round.round)).filter(Boolean),
    rounds: rounds.map((round) => ({
      round: number(round.round),
      format: clean(round.format),
      state: upper(round.resultState || round.state || "UNAVAILABLE"),
      eligibleCount: number(round.eligibleCount || round.eligiblePlayerCount),
    })),
  };
}

function calcuttaModel(result = null) {
  if (!result) return { available: false, state: "UNAVAILABLE", label: "Unavailable" };
  if (result.calcuttaState) {
    const summary = sideGameModel(result, "calcuttaState");
    return {
      ...summary,
      publicationState: upper(result.calcuttaState.publicationState || "UNPUBLISHED"),
      published: result.calcuttaState.published === true,
      configurationRevision: number(result.calcuttaState.configurationRevision),
      auctionRevision: number(result.calcuttaState.auctionRevision),
      publicationRevision: number(result.calcuttaState.publicationRevision),
      resultRevision: result.calcuttaState.resultRevision == null ? null : number(result.calcuttaState.resultRevision),
    };
  }
  const state = upper(result.state || "UNAVAILABLE");
  const labels = { NOT_CONFIGURED: "Not configured", CONFIGURED: "Configured", AUCTION_COMPLETE: "Auction complete", IN_PROGRESS: "In progress", OFFICIAL: "Official", UNAVAILABLE: "Unavailable" };
  return {
    available: state !== "UNAVAILABLE",
    state,
    label: labels[state] || prettyState(state),
    publicationState: upper(result.publication_state || "UNPUBLISHED"),
    published: result.published === true,
    configurationRevision: number(result.configuration_revision),
    configurationFingerprint: clean(result.configuration_fingerprint),
    auctionRevision: number(result.auction_revision),
    auctionFingerprint: clean(result.auction_fingerprint),
    publicationRevision: number(result.publication_revision),
    resultRevision: result.result_revision == null ? null : number(result.result_revision),
    stale: result.stale === true,
  };
}

function prettyState(value) {
  return clean(value).toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function privateJobModel(row = {}) {
  return {
    domain: upper(row.domain),
    round: row.round == null ? null : number(row.round),
    status: upper(row.status || "UNAVAILABLE"),
    configurationRevision: number(row.configuration_revision),
    auctionRevision: row.auction_revision == null ? null : number(row.auction_revision),
    resultRevision: row.result_revision == null ? null : number(row.result_revision),
    requestedAt: clean(row.requested_at),
    startedAt: clean(row.started_at),
    completedAt: clean(row.completed_at),
    updatedAt: clean(row.updated_at),
    failureDescription: clean(row.failure_description),
    retryEligible: row.retry_eligible === true,
  };
}

function privateOperationsModel(value = null) {
  if (!value || clean(value.contract_version) !==
      "production-director-private-operations-v1") {
    return {
      available: false,
      contractVersion: "production-director-private-operations-v1",
      calcutta: null,
      netSkins: null,
      auditTimeline: [],
    };
  }
  const calcutta = value.calcutta || {};
  const configuration = calcutta.configuration || null;
  const auction = calcutta.auction || null;
  const netSkins = value.net_skins || {};
  const readiness = netSkins.readiness || {};
  return {
    available: true,
    contractVersion: clean(value.contract_version),
    calcutta: {
      state: upper(calcutta.state || "UNAVAILABLE"),
      publicationState: upper(calcutta.publication_state || "UNPUBLISHED"),
      currencyCode: clean(calcutta.currency_code || "USD"),
      configurationRevision: number(calcutta.configuration_revision),
      auctionRevision: number(calcutta.auction_revision),
      publicationRevision: number(calcutta.publication_revision),
      resultRevision: calcutta.result_revision == null ? null : number(calcutta.result_revision),
      configuration: configuration ? {
        revision: number(configuration.revision),
        configuredAt: clean(configuration.configured_at),
        validationStatus: upper(configuration.validation_status || "ATTENTION"),
        currencyCode: clean(configuration.currency_code || "USD"),
        pointStructure: Array.isArray(configuration.point_structure)
          ? configuration.point_structure.map((row) => ({
            place: number(row.place),
            round1Award: number(row.round_1_award),
            round2Award: number(row.round_2_award),
            round3Award: number(row.round_3_award),
          })) : [],
        payoutStructure: Array.isArray(configuration.payout_structure)
          ? configuration.payout_structure.map((row) => ({
            place: number(row.place),
            round1Fraction: clean(row.round_1_fraction),
            round2Fraction: clean(row.round_2_fraction),
            round3Fraction: clean(row.round_3_fraction),
            overallFraction: clean(row.overall_fraction),
          })) : [],
        rules: {
          auctionUnit: clean(configuration.rules?.auction_unit),
          auctionWorkflow: clean(configuration.rules?.auction_workflow),
          potRule: clean(configuration.rules?.pot_rule),
          tieRule: clean(configuration.rules?.tie_rule),
          payoutRounding: clean(configuration.rules?.payout_rounding),
          scrambleAsset: clean(configuration.rules?.scramble_asset),
          completionRule: clean(configuration.rules?.completion_rule),
          settlementTracking: clean(configuration.rules?.settlement_tracking),
        },
      } : null,
      auction: auction ? {
        revision: number(auction.revision),
        recordedAt: clean(auction.recorded_at),
        currencyCode: clean(auction.currency_code || "USD"),
        pot: clean(auction.pot),
        purchaseCount: number(auction.purchase_count),
        ownerCount: number(auction.owner_count),
        ownershipRowCount: number(auction.ownership_row_count),
        reconciliationStatus: upper(auction.reconciliation_status || "ATTENTION"),
        potReconciled: auction.pot_reconciled === true,
        ownershipComplete: auction.ownership_complete === true,
        activePlayersComplete: auction.active_players_complete === true,
        purchases: Array.isArray(auction.purchases) ? auction.purchases.map((purchase) => ({
          player: {
            id: clean(purchase.player?.player_id),
            name: clean(purchase.player?.display_name),
          },
          purchasePrice: clean(purchase.purchase_price),
          owners: Array.isArray(purchase.owners) ? purchase.owners.map((owner) => ({
            player: {
              id: clean(owner.player?.player_id),
              name: clean(owner.player?.display_name),
            },
            ownershipFraction: clean(owner.ownership_fraction),
          })) : [],
        })) : [],
      } : null,
      publication: {
        revision: number(calcutta.publication?.revision),
        state: upper(calcutta.publication?.state || "UNPUBLISHED"),
        publishedAt: clean(calcutta.publication?.published_at),
      },
      result: calcutta.result ? {
        revision: calcutta.result.revision == null ? null : number(calcutta.result.revision),
        state: upper(calcutta.result.state || "NOT_CALCULATED"),
        completedRounds: Array.isArray(calcutta.result.completed_rounds)
          ? calcutta.result.completed_rounds.map((item) => number(item)).filter(Boolean)
          : [],
        calculatedAt: clean(calcutta.result.calculated_at),
        freshness: upper(calcutta.result.freshness || "MISSING"),
        recalculationRequired: calcutta.result.recalculation_required === true,
        validationStatus: upper(calcutta.result.validation_status || "NOT_APPLICABLE"),
      } : null,
      jobs: Array.isArray(calcutta.jobs) ? calcutta.jobs.map(privateJobModel) : [],
    },
    netSkins: {
      state: upper(netSkins.state || "UNAVAILABLE"),
      configurationRevision: number(netSkins.configuration_revision),
      resultRevision: netSkins.result_revision == null ? null : number(netSkins.result_revision),
      readiness: {
        state: upper(readiness.state || "UNAVAILABLE"),
        canConfigure: readiness.can_configure === true,
        totalMatches: number(readiness.total_matches),
        readyMatches: number(readiness.ready_matches),
        issues: Array.isArray(readiness.issues) ? readiness.issues.map((issue) => ({
          code: upper(issue.code),
          label: clean(issue.label),
          affectedMatches: number(issue.affected_matches),
          missingCount: number(issue.missing_count),
          summary: clean(issue.summary),
          byRound: Array.isArray(issue.by_round) ? issue.by_round.map((round) => ({
            round: number(round.round),
            affectedMatches: number(round.affected_matches),
            missingCount: number(round.missing_count),
          })) : [],
        })) : [],
      },
      jobs: Array.isArray(netSkins.jobs) ? netSkins.jobs.map(privateJobModel) : [],
    },
    auditTimeline: Array.isArray(value.audit_timeline) ? value.audit_timeline.map((event) => ({
      id: `director-audit-${number(event.sequence)}`,
      category: upper(event.category),
      action: upper(event.action),
      title: clean(event.title),
      summary: clean(event.summary),
      status: upper(event.status || "INFO"),
      actorName: clean(event.actor?.display_name || "System"),
      occurredAt: clean(event.occurred_at),
      context: {
        tournamentId: clean(event.context?.tournament_id),
        roundNumber: event.context?.round_number == null
          ? null : number(event.context.round_number),
        displayMatchNumber: clean(event.context?.display_match_number),
      },
    })) : [],
  };
}

function recentActivity(view = {}) {
  return (view.matches || []).flatMap((entry) => {
    const match = entry.match || {};
    const updatedAt = clean(match.updated_at || match.finalized_at || match.started_at);
    if (!updatedAt) return [];
    return [{
      id: clean(match.match_id || `${match.round_number || "round"}-${match.match_number || "match"}`),
      label: `Round ${number(match.round_number)} · Match ${clean(match.match_number || match.match_id || "updated")}`,
      status: upper(match.status || "UPDATED"),
      updatedAt,
    }];
  }).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 6);
}

function readinessIssues({ authority, enrollment, workers, optional }) {
  const issues = [];
  for (const [key, title] of [["scoring", "Scoring authority"], ["reads", "Tournament reads"], ["identity", "Participant identity"]]) {
    if (authority[key].value !== "SUPABASE") issues.push({ id: `authority-${key}`, level: "action", title, message: "This Production authority needs attention before tournament operations continue." });
  }
  if (authority.ingress.value !== "OPEN") issues.push({ id: "ingress", level: "action", title: "Scoring is paused", message: "Scoring ingress is not open. Review System / Audit before tournament play." });
  if (!enrollment.available) issues.push({ id: "enrollment-unavailable", level: "warning", title: "Enrollment summary unavailable", message: "Participant enrollment could not be loaded. Tournament data remains available." });
  else if (enrollment.invalid > 0) issues.push({ id: "enrollment-invalid", level: "action", title: "Enrollment needs review", message: `${enrollment.invalid} participant enrollment ${enrollment.invalid === 1 ? "record needs" : "records need"} attention.` });
  else if (enrollment.pending > 0) issues.push({ id: "enrollment-pending", level: "info", title: "Participant enrollment in progress", message: `${enrollment.pending} of ${enrollment.total} active participants ${enrollment.pending === 1 ? "has" : "have"} not enrolled yet.` });
  if (!workers.available) issues.push({ id: "workers-unavailable", level: "warning", title: "Worker status unavailable", message: "Background processing status could not be confirmed." });
  else if (!workers.enabled) issues.push({ id: "workers-disabled", level: "action", title: "Background workers need attention", message: "One or more required Production workers are not enabled." });
  else if (workers.pending > 0) issues.push({ id: "workers-pending", level: "info", title: "Background work in progress", message: `${workers.pending} background ${workers.pending === 1 ? "item is" : "items are"} pending.` });
  for (const [id, label] of [["odds", "Odds publication"], ["netSkins", "Net Skins"], ["calcutta", "Calcutta"]]) {
    if (!optional[id].available) issues.push({ id: `${id}-unavailable`, level: "warning", title: `${label} unavailable`, message: `${label} status could not be loaded. Other Director data remains available.` });
  }
  return issues;
}

export function buildProductionDirectorOverview({
  view = {},
  live = {},
  readState = {},
  enrollment = null,
  workers = null,
  odds = null,
  netSkins = null,
  calcutta = null,
  handicaps = null,
  scoringState = null,
  mutationContract = null,
  oddsPublication = null,
  predictionSettings = null,
  draft = null,
  guide = null,
  privateOperations = null,
} = {}) {
  const authority = authorityModel(readState, workers);
  const enrollmentSummary = enrollmentModel(enrollment, view);
  const workerSummary = workerModel(readState, workers);
  const optional = {
    odds: oddsModel(oddsPublication || odds),
    netSkins: netSkinsModel(netSkins),
    calcutta: calcuttaModel(calcutta),
  };
  const round = currentRound(live);
  const privateSummary = privateOperationsModel(privateOperations);
  return {
    mode: "production",
    navigation: PRODUCTION_DIRECTOR_SECTIONS,
    tournament: {
      id: clean(live.tournament?.id || view.tournament?.tournament_id || PRODUCTION_TOURNAMENT_ID),
      year: number(live.tournament?.year || view.tournament?.tournament_year),
      name: clean(live.tournament?.name || view.tournament?.name || "Sandbagger Invitational"),
      destination: clean(live.tournament?.location),
      dates: clean(live.tournament?.dates),
      status: upper(live.tournament?.status || "UPCOMING"),
      rosterCount: rosterCount(view, enrollment),
      currentRound: round,
    },
    authority,
    enrollment: enrollmentSummary,
    workers: workerSummary,
    handicaps: {
      available: Boolean(handicaps),
      currentRevision: handicaps
        ? number(stateValue(handicaps, "current_revision", "revision_number", "revision"), 0) || null
        : null,
    },
    publications: optional,
    tournamentDay: buildProductionTournamentDay({ live, view, scoringState, mutationContract }),
    projections: projectionModel({ prediction: predictionSettings, draft, guide }),
    privateOperations: privateSummary,
    readinessIssues: readinessIssues({ authority, enrollment: enrollmentSummary, workers: workerSummary, optional }),
    recentActivity: recentActivity(view),
    capabilities: {
      legacyProductionEditors: false,
      previewTools: false,
      productionOverview: true,
      handicapManagement: true,
      privateOperations: privateSummary.available,
    },
  };
}

async function defaultDependencies() {
  const [tournament, identity, readControl, scoring, odds, oddsPublication, netSkins, calcutta, handicaps,
    mutationAuthority, prediction, draft, guide, guideAdapter, privateOperations] = await Promise.all([
    import("./tournament-live-supabase.js"),
    import("./participant-identity-supabase.js"),
    import("./production-cutover-read-control.js"),
    import("./production-scoring-operations-server.js"),
    import("./published-odds-supabase.js"),
    import("./production-odds-publication-server.js"),
    import("./production-net-skins-v1.js"),
    import("./production-calcutta-server.js"),
    import("./production-handicap-management-server.js"),
    import("./scoring-mutation-authority-server.js"),
    import("./prediction-settings-supabase.js"),
    import("./draft-service.js"),
    import("./guide-supabase.js"),
    import("./guide-participant-adapter.js"),
    import("./production-director-private-operations.js"),
  ]);
  return {
    readTournamentLiveView: tournament.readTournamentLiveView,
    tournamentLiveDataFromSupabaseView: tournament.tournamentLiveDataFromSupabaseView,
    inspectEnrollment: identity.inspectProductionParticipantIdentityEnrollment,
    inspectReadState: readControl.inspectProductionCutoverReadState,
    inspectWorkers: (options) => scoring.productionScoringOperationsRpc("inspect_production_scoring_workers", {}, options),
    readScoringState: (options) => scoring.productionScoringOperationsRpc("read_production_scoring_authority", { mode: "CURRENT_STATE" }, options),
    readMutationContract: mutationAuthority.currentScoringMutationAuthorityContract,
    readOdds: odds.readPublishedOddsView,
    readOddsPublication: oddsPublication.readProductionOddsPublicationState,
    readNetSkins: netSkins.currentProductionNetSkinsV1,
    readCalcutta: calcutta.inspectProductionCalcuttaV1,
    readHandicaps: handicaps.readProductionHandicapCurrent,
    readPredictionSettings: prediction.loadCurrentPredictionSettings,
    readDraft: (options) => draft.loadDraftProjection({ scope: "CURRENT", ...options }),
    readGuide: async (options) => guideAdapter.guideParticipantProjection(await guide.readGuideProjection({ surface: "guide", ...options })),
    readPrivateOperations: privateOperations.readProductionDirectorPrivateOperations,
  };
}

function completeDependencies(dependencies = {}) {
  return [
    "readTournamentLiveView",
    "tournamentLiveDataFromSupabaseView",
    "inspectEnrollment",
    "inspectReadState",
    "inspectWorkers",
    "readOdds",
    "readNetSkins",
    "readCalcutta",
  ].every((name) => typeof dependencies[name] === "function");
}

/**
 * Reads the Production console only from the current Supabase read, identity,
 * and runtime contracts. Optional status panels fail independently so a side
 * game outage does not hide the active tournament.
 */
export async function readProductionDirectorOverview({
  env = process.env,
  dependencies = {},
  actorAuthUserId,
  actorPlayerId,
  request,
} = {}) {
  const adapters = completeDependencies(dependencies)
    ? dependencies
    : { ...(await defaultDependencies()), ...dependencies };
  const settled = await Promise.allSettled([
    adapters.readTournamentLiveView(PRODUCTION_TOURNAMENT_ID, { env }),
    adapters.inspectReadState({ env }),
    adapters.inspectEnrollment({ env }),
    adapters.inspectWorkers({ env }),
    adapters.readOdds({ tournamentId: PRODUCTION_TOURNAMENT_ID, sourceWorkbookId: PRODUCTION_GOOGLE_WORKBOOK_ID }, { env }),
    adapters.readNetSkins({ env }),
    adapters.readCalcutta({ env }),
    typeof adapters.readHandicaps === "function"
      ? adapters.readHandicaps({ actorAuthUserId, actorPlayerId }, { env })
      : Promise.resolve(null),
    typeof adapters.readScoringState === "function"
      ? adapters.readScoringState({ env })
      : Promise.resolve(null),
    typeof adapters.readMutationContract === "function" && request
      ? adapters.readMutationContract({ request, env })
      : Promise.resolve(null),
    typeof adapters.readOddsPublication === "function"
      ? adapters.readOddsPublication({ env })
      : Promise.resolve(null),
    typeof adapters.readPredictionSettings === "function"
      ? adapters.readPredictionSettings(PRODUCTION_TOURNAMENT_ID, { env })
      : Promise.resolve(null),
    typeof adapters.readDraft === "function"
      ? adapters.readDraft({ env })
      : Promise.resolve(null),
    typeof adapters.readGuide === "function"
      ? adapters.readGuide({ env })
      : Promise.resolve(null),
    typeof adapters.readPrivateOperations === "function"
      ? adapters.readPrivateOperations({
        actorAuthUserId,
        actorPlayerId,
        env,
      })
      : Promise.resolve(null),
  ]);
  const [liveRead, readStateRead, enrollmentRead, workersRead, oddsRead, netSkinsRead, calcuttaRead, handicapRead,
    scoringStateRead, mutationContractRead, oddsPublicationRead, predictionRead, draftRead, guideRead,
    privateOperationsRead] = settled;
  if (liveRead.status !== "fulfilled" || readStateRead.status !== "fulfilled") {
    throw productionDirectorDataError(liveRead.reason || readStateRead.reason);
  }
  const view = successfulPayload(liveRead.value);
  const readState = successfulPayload(readStateRead.value);
  if (!view || !readState) throw productionDirectorDataError({ code: "PRODUCTION_DIRECTOR_CORE_READ_INCOMPLETE" });
  let live;
  try {
    live = adapters.tournamentLiveDataFromSupabaseView(view);
  } catch (error) {
    throw productionDirectorDataError(error);
  }
  return buildProductionDirectorOverview({
    view,
    live,
    readState,
    enrollment: optionalRead(enrollmentRead).data,
    workers: optionalRead(workersRead).data,
    odds: optionalRead(oddsRead).data,
    netSkins: netSkinsRead.status === "fulfilled" ? netSkinsRead.value : null,
    calcutta: calcuttaRead.status === "fulfilled" ? calcuttaRead.value : null,
    handicaps: optionalRead(handicapRead).data,
    scoringState: optionalRead(scoringStateRead).data,
    mutationContract: mutationContractRead.status === "fulfilled" ? mutationContractRead.value : null,
    oddsPublication: oddsPublicationRead.status === "fulfilled" ? oddsPublicationRead.value : null,
    predictionSettings: predictionRead.status === "fulfilled" ? predictionRead.value : null,
    draft: draftRead.status === "fulfilled" ? draftRead.value : null,
    guide: guideRead.status === "fulfilled" ? guideRead.value : null,
    privateOperations: privateOperationsRead.status === "fulfilled"
      ? privateOperationsRead.value
      : null,
  });
}
