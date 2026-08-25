export function reconcileOddsCenterSelection(snapshots = [], selectedPhase = "", userSelected = false) {
  const latestPhase = snapshots.at(-1)?.phase || "";
  if (!latestPhase) return { phase: "", userSelected: false };
  if (!snapshots.some((snapshot) => snapshot.phase === selectedPhase)) {
    return { phase: latestPhase, userSelected: false };
  }
  return { phase: userSelected ? selectedPhase : latestPhase, userSelected };
}

export function resolveOddsCenterPhase(snapshots = [], selectedPhase = "", userSelected = false) {
  return reconcileOddsCenterSelection(snapshots, selectedPhase, userSelected).phase;
}
