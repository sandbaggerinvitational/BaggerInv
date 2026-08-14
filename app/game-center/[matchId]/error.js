"use client";

import { ErrorState } from "../../ui/StatePrimitives";

export default function GameCenterError({ reset }) {
  return <main><ErrorState title="Game Center is unavailable." message="Check your connection and try again." onRetry={reset} returnHref="/live" returnLabel="Back to Tournament" /></main>;
}
