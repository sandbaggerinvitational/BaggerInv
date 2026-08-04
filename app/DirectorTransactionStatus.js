"use client";

import { useDirectorTransactionPhase } from "../lib/director-client-transaction";

export default function DirectorTransactionStatus() {
  const phase = useDirectorTransactionPhase();
  if (phase === "idle") return null;
  return <div className="directorTransactionLock" role="status" aria-live="assertive" aria-busy="true">
    <div><strong>{phase === "updated" ? "Tournament Updated" : "Updating Tournament…"}</strong><span>{phase === "updated" ? "Ready" : "Please wait…"}</span></div>
  </div>;
}
