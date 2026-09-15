// Presentation gating only. SQL remains authoritative and revalidates entry revisions.
export function netSkinsConfigurationReadiness({ phase = "loading", rounds } = {}) {
  const blocked = (label, message) => ({ ready: false, label, message });
  if (phase === "loading") return blocked("Checking Saved Entries…", "Checking saved Round entries before configuration.");
  if (phase !== "ready" || !Array.isArray(rounds)) return blocked("Saved Entries Unavailable", "Saved entries are unavailable. Reload Saved Entries before configuring.");
  const selected = rounds.filter(round => round.configured === true);
  if (!selected.length) return blocked("Save Round Entries First", "Save explicit In entries for at least one Round before configuring.");
  if (selected.some(round => round.state !== "ENTRIES_SAVED" || !Number.isSafeInteger(round.revision) || round.revision < 1
    || !Number.isSafeInteger(round.enteredCount) || round.enteredCount < 1)) {
    return blocked("Review Saved Entries First", "Save and review explicit In entries for each configured Round first.");
  }
  return { ready: true, label: "Configure from Saved Entries", message: "Saved entries are ready. Configuration rechecks their current revisions; it does not publish results.",
    selection: { eligibleRoundNumbers: selected.map(round => round.roundNumber),
      entryRevisions: Object.fromEntries(selected.map(round => [round.roundNumber, round.revision])) } };
}
