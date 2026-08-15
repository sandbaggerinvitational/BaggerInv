import { ScreenSkeleton } from "../ui/StatePrimitives";

export default function HistoryLoading() {
  return <ScreenSkeleton label="Opening Tournament History" cards={4} />;
}
