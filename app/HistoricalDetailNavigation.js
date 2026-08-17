import HistoryNavigation from "./history/HistoryNavigation";

export default function HistoricalDetailNavigation({
  backHref,
  backLabel,
  backDetail,
  backAriaLabel,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
  completedYear = false,
  position = "bottom",
}) {
  const tournamentDestination = {
    href: backHref,
    label: backLabel,
    detail: backDetail,
    ariaLabel: backAriaLabel || backLabel,
  };
  const previousDestination = previousHref && previousLabel ? {
    href: previousHref,
    label: "Previous Round",
    detail: previousLabel,
    direction: "left",
    ariaLabel: `Previous Round, ${previousLabel}`,
  } : null;
  const nextDestination = nextHref && nextLabel ? {
    href: nextHref,
    label: "Next Round",
    detail: nextLabel,
    direction: "right",
    ariaLabel: `Next Round, ${nextLabel}`,
  } : null;

  const firstRound = completedYear && !previousDestination && nextDestination;
  const finalRound = completedYear && previousDestination && !nextDestination;

  return (
    <HistoryNavigation
      ariaLabel="Historical round navigation"
      center={!completedYear || (!firstRound && !finalRound)
        ? tournamentDestination
        : null}
      left={firstRound
        ? { ...tournamentDestination, direction: "left" }
        : previousDestination}
      placement={position === "top" ? "embedded" : "standalone"}
      right={finalRound
        ? { ...tournamentDestination, direction: "none" }
        : nextDestination}
      surface="round"
    />
  );
}
