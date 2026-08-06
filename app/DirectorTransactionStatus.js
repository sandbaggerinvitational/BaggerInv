"use client";

import { useDirectorTransactionPhase } from "../lib/director-client-transaction";

export default function DirectorTransactionStatus() {
  const phase = useDirectorTransactionPhase();
  if (phase === "idle") return null;
  const flow = ["verifying", "loadingWorkbook", "updating", "verifyingChanges", "updated"];
  const copy = {
    verifying: ["Verifying Director", "Confirming your secure session…"],
    loadingWorkbook: ["Loading Workbook", "Preparing official tournament data…"],
    reconnecting: ["Reconnecting Automatically…", "Director verification is recovering…"],
    updating: ["Updating Tournament…", "Please wait…"],
    verifyingChanges: ["Verifying Changes", "Confirming the tournament update…"],
    updated: ["Tournament Updated", "Ready"],
  }[phase] || ["Updating Tournament…", "Please wait…"];
  const activeIndex = flow.indexOf(phase);
  return <div className="directorTransactionLock" role="status" aria-live="assertive" aria-busy="true">
    <div><strong>{copy[0]}</strong><span>{copy[1]}</span>{phase !== "reconnecting" ? <ol>{[["verifying", "Verifying Director"], ["loadingWorkbook", "Loading Workbook"], ["updating", "Updating Tournament"], ["verifyingChanges", "Verifying Changes"], ["updated", "Complete"]].map(([key, label], index) => <li data-state={index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending"} key={key}>{index <= activeIndex ? "●" : "○"} {label}</li>)}</ol> : null}</div>
  </div>;
}
