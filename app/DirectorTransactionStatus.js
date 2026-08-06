"use client";

import { useDirectorTransactionPhase } from "../lib/director-client-transaction";

export default function DirectorTransactionStatus() {
  const phase = useDirectorTransactionPhase();
  if (phase === "idle") return null;
  const copy = {
    verifying: ["Verifying Director", "Confirming your secure session…"],
    reconnecting: ["Reconnecting Automatically…", "Director verification is recovering…"],
    updating: ["Updating Tournament…", "Please wait…"],
    verifyingChanges: ["Verifying Changes", "Confirming the tournament update…"],
    updated: ["Tournament Updated", "Ready"],
  }[phase] || ["Updating Tournament…", "Please wait…"];
  return <div className="directorTransactionLock" role="status" aria-live="assertive" aria-busy="true">
    <div><strong>{copy[0]}</strong><span>{copy[1]}</span></div>
  </div>;
}
