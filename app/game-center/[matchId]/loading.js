import { ScreenSkeleton } from "../../ui/StatePrimitives";

export default function GameCenterLoading() {
  return <ScreenSkeleton label="Opening Game Center" cards={3} />;
}
