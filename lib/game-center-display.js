export function liveProgressLabel(state, throughValue) {
  if (state !== "live") return "";
  const through = Math.max(0, Math.min(18, Number(throughValue) || 0));
  if (!through) return "Match in progress";
  const remaining = 18 - through;
  return `Through ${through} • ${remaining} Hole${remaining === 1 ? "" : "s"} Remaining`;
}
