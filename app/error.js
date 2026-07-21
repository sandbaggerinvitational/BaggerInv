"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("Tournament page error boundary", {
      message: error?.message || "Unknown rendering error",
      digest: error?.digest || null,
      cause: error?.cause || null,
      stack: error?.stack || null,
      route: window.location.pathname,
    });
  }, [error]);
  return (
    <main className="appError">
      <div className="errorCard">
        <span>Sandbagger Invitational</span>
        <h1>Unable to load tournament data.</h1>
        <p>The page hit an unexpected problem. Your Google Sheet data has not been changed.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
