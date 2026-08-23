"use client";

import { ErrorState } from "../ui/StatePrimitives";

export default function DraftError({ reset }) {
  return (
    <main>
      <ErrorState
        title="Draft information is temporarily unavailable."
        message="The current certified Draft projection could not be loaded. Please try again shortly."
        onRetry={reset}
        returnHref="/home"
      />
    </main>
  );
}
