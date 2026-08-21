"use client";

import { useState } from "react";

import { directorFetch } from "../../../../lib/director-client-transaction.js";

const YEARS = Array.from({ length: 9 }, (_, index) => 2017 + index);

async function responsePayload(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) {
    const error = new Error(payload.error || payload.code || `Request failed (${response.status}).`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

export default function CompletedHistoryClient() {
  const [year, setYear] = useState(2017);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function post(action, targetYear = year) {
    return responsePayload(await directorFetch("/api/director/completed-history", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, year: targetYear }),
    }));
  }

  async function run(label, operation) {
    setBusy(label);
    setResult(null);
    setError(null);
    try { setResult(await operation()); }
    catch (caught) {
      setError({ message: caught?.message || "Completed History operation failed.", payload: caught?.payload || null });
    } finally { setBusy(""); }
  }

  function inspect() {
    return run("diagnostics", async () => responsePayload(await fetch(
      `/api/director/completed-history?year=${year}`,
      { cache: "no-store", credentials: "same-origin" }
    )));
  }

  function certifyYear() {
    return run(`certify-${year}`, async () => {
      const transcript = [];
      transcript.push(await post("validate"));
      transcript.push(await post("import"));
      transcript.push(await post("parity"));
      const idempotency = await post("import");
      if (idempotency.result?.changed !== false || idempotency.result?.duplicate !== true) {
        const failure = new Error(`${year} idempotent re-import did not report an unchanged duplicate.`);
        failure.payload = idempotency;
        throw failure;
      }
      transcript.push(idempotency);
      return { ok: true, action: "certify-year", year, transcript };
    });
  }

  return <section style={{ maxWidth: 980, margin: "0 auto", padding: "2rem 1rem", display: "grid", gap: "1rem" }}>
    <header>
      <p>Preview only · Director authorized</p>
      <h1>Completed History Foundation</h1>
      <p>Validate, import, compare, and idempotently re-import one completed tournament year at a time. Public History reads are not changed here.</p>
    </header>
    <label style={{ display: "grid", gap: ".4rem", maxWidth: 260 }}>
      Tournament year
      <select value={year} disabled={Boolean(busy)} onChange={(event) => setYear(Number(event.target.value))}>
        {YEARS.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
      <button type="button" disabled={Boolean(busy)} onClick={inspect}>Inspect diagnostics</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run(`validate-${year}`, () => post("validate"))}>Validate {year}</button>
      <button type="button" disabled={Boolean(busy)} onClick={certifyYear}>Certify {year}</button>
      <button type="button" disabled={Boolean(busy)} onClick={() => run("shadow", () => post("shadow"))}>Compare derived shadow</button>
    </div>
    {busy ? <p role="status">Running {busy}…</p> : null}
    {error ? <div role="alert"><strong>{error.message}</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(error.payload, null, 2)}</pre></div> : null}
    {result ? <div role="status"><strong>{result.action || "diagnostics"}</strong><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result, null, 2)}</pre></div> : null}
  </section>;
}
