import HistoryNavigation from "./history/HistoryNavigation";

export default function PlayerProfileReturnNavigation({ context }) {
  if (!context) return null;

  return (
    <HistoryNavigation
      ariaLabel={`${context.name} profile return navigation`}
      left={{
        href: context.href,
        label: context.label,
        direction: "left",
        ariaLabel: context.accessibleLabel,
        prefetch: false,
      }}
      surface="player-return"
    />
  );
}
