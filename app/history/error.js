"use client";

import { ErrorState } from "../ui/StatePrimitives";

export default function HistoryError({ reset }) {
  return <main><ErrorState title="Tournament History is temporarily unavailable." message="Your tournament and scoring screens are still available." onRetry={reset} returnHref="/home" /></main>;
}
