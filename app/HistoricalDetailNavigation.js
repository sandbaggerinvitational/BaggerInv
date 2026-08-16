import HistoryNavigation from "./history/HistoryNavigation";

export default function HistoricalDetailNavigation({
  backHref,
  backLabel,
  previousHref,
  previousLabel,
  nextHref,
  nextLabel,
  position = "bottom",
}) {
  return (
    <HistoryNavigation
      ariaLabel="Historical round navigation"
      center={{ href: backHref, label: backLabel, ariaLabel: backLabel }}
      left={previousHref && previousLabel ? {
        href: previousHref,
        label: "Previous Round",
        detail: previousLabel,
        direction: "left",
        ariaLabel: `Previous Round, ${previousLabel}`,
      } : null}
      placement={position === "top" ? "embedded" : "standalone"}
      right={nextHref && nextLabel ? {
        href: nextHref,
        label: "Next Round",
        detail: nextLabel,
        direction: "right",
        ariaLabel: `Next Round, ${nextLabel}`,
      } : null}
      surface="round"
    />
  );
}
