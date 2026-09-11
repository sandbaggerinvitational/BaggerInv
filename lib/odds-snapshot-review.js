// A presentation projection, not a simulator or publication authority.
export function oddsSnapshotReview({ job, snapshot, isolation, alreadyPublished }, setup = {}) {
  const metadata = job.input_snapshot?.metadata || {};
  const sequence = metadata.productionPairingEvidence?.sequence || [];
  const certifiedEngine = snapshot.engineVersion === "tournament-odds.js:odds-v3-nassau-full-precision-rank";
  return {
    jobId: job.job_id, milestone: job.phase, iterations: job.total_iterations,
    completedAt: job.completed_at, checkedAt: new Date().toISOString(),
    freshness: alreadyPublished ? "HISTORICAL" : "CURRENT",
    publicationEligible: !alreadyPublished && isolation.publicationEligible === true,
    // Preserve every persisted output, including raw precision and stored rank.
    snapshot,
    rounds: [1, 2, 3].map((round) => {
      const matches = sequence.filter((match) => Number(match.round_number) === round);
      return { round, total: matches.length, paired: matches.filter((match) => match.participants?.length === (round === 3 ? 2 : 4)).length };
    }),
    singlesBasis: certifiedEngine && job.phase === "Pre-Tournament"
      ? "Pre-Tournament independently shuffles each team's roster into Singles matchups on every iteration, rather than using a fixed Round 3 draw."
      : "This milestone uses the retained inputs under its certified simulation contract; the Pre-Tournament random Singles draw description does not apply.",
    titleBasis: certifiedEngine
      ? "Tied championships split title credit equally. A separate tie probability is not retained."
      : "Only retained probabilities are shown; no separate tie probability is derived.",
    certification: {
      deploymentCommit: job.production_deployment_commit,
      inputFingerprint: job.input_fingerprint, resultFingerprint: job.result_fingerprint,
      pairingFingerprint: metadata.pairingFingerprint || null,
      predictionSettingsRevision: job.source_revision?.configuration_revision ?? null,
      settingsFingerprint: job.source_revision?.effective_settings_fingerprint || null,
      // These are current context only. Legacy jobs did not retain separate
      // Setup / Handicap revision numbers; never invent historical bindings.
      currentSetupRevision: setup.revision ?? null,
      currentHandicapRevision: setup.approvedHandicapRevisionNumber ?? null,
    },
  };
}
