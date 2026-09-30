"use client";

import { useEffect, useMemo, useState } from "react";
import ProductionTournamentSetupPanel from "./ProductionTournamentSetupPanel.js";
import ProductionNetSkinsEntries from "./ProductionNetSkinsEntries.js";
import CalcuttaManagementEditor from "./CalcuttaManagementEditor.js";
import CanonicalDirectorMatchControls from "./CanonicalDirectorMatchControls.js";
import { createCanonicalDirectorOperationsTransport } from "../../../lib/canonical-director-operations-client.js";

export default function CanonicalDirectorOperations() {
  const transport = useMemo(() => createCanonicalDirectorOperationsTransport(), []);
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    transport.read().then(result => { if (active) { setContext(result.context); setError(""); } })
      .catch(failure => { if (active) { setContext(null); setError(failure.message); } });
    return () => { active = false; };
  }, [transport, reload]);
  if (!context) return <section aria-label="Tournament operations">
    <h2>Tournament operations</h2>
    <p role={error ? "alert" : "status"}>{error || "Checking current tournament authority…"}</p>
    {error ? <button type="button" onClick={() => setReload(value => value + 1)}>Retry operation access</button> : null}
  </section>;
  return <section aria-label="Canonical tournament operations">
    <ProductionTournamentSetupPanel request={transport.setupFetch} isolated />
    <CanonicalDirectorMatchControls transport={transport} />
    <ProductionNetSkinsEntries transport={transport.entriesRequest} standalone isolated />
    <CalcuttaManagementEditor transport={transport.calcuttaRequest} auctionOnly />
  </section>;
}
