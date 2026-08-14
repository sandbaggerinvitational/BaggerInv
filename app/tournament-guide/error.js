"use client";

import { ErrorState } from "../ui/StatePrimitives";

export default function TournamentGuideError({ reset }) {
  return (
    <main><ErrorState title="Tournament Guide is temporarily unavailable." message="Your tournament and scoring screens are still available." onRetry={reset} returnHref="/home" /></main>
  );
}
