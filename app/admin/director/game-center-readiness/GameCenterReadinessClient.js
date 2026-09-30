"use client";

import CanonicalDirectorConsole from "../CanonicalDirectorConsole.js";

// Legacy workbook refresh/parity commands are maintenance history. Current
// runtime readiness inspects canonical authority and never imports a provider.
export default function GameCenterReadinessClient() {
  return <CanonicalDirectorConsole directorName="Tournament Director · Current readiness" />;
}
