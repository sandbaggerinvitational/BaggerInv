"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { participantAppShellRoute } from "../lib/participant-shell.js";
import { ErrorState } from "./ui/StatePrimitives";

export default function Error({ error, reset }) {
  const pathname = usePathname();
  const participantPresentation = participantAppShellRoute(pathname);
  useEffect(() => {
    console.error("Tournament page error boundary", {
      message: error?.message || "Unknown rendering error",
      digest: error?.digest || null,
      cause: error?.cause || null,
      stack: error?.stack || null,
      route: window.location.pathname,
    });
  }, [error]);
  if (participantPresentation) return <main>
    <ErrorState title="We couldn’t open this page." message="Check your connection and try again." onRetry={reset} />
  </main>;
  return (
    <main className="appError">
      <div className="errorCard">
        <span>Sandbagger Invitational</span>
        <h1>Unable to load tournament data.</h1>
        <p>The page hit an unexpected problem. Your tournament data has not been changed.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
