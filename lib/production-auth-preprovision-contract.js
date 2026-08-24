import { createHash } from "node:crypto";

import {
  PRODUCTION_GOOGLE_WORKBOOK_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_SUPABASE_URL,
} from "./production-foundation-resource-contract.js";

export const PRODUCTION_AUTH_PREPROVISION_CONTRACT_VERSION =
  "production-auth-preprovision-v1";

export const PRODUCTION_AUTH_PREPROVISION_ACTOR =
  "step10b-production-auth-bootstrap";

const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

export function productionAuthPreprovisionEvidence({
  email,
  playerId,
  tournamentId,
  sourceFingerprint,
  identitySourceFingerprint,
}) {
  const normalized = String(email || "").trim().toLowerCase();
  const targetPlayer = String(playerId || "").trim();
  const targetTournament = String(tournamentId || "").trim();
  const sourceHash = String(sourceFingerprint || "").trim().toLowerCase();
  const identitySourceHash = String(identitySourceFingerprint || "").trim().toLowerCase();
  if (!normalized || !targetPlayer || targetTournament !== "2026" ||
      !/^[0-9a-f]{64}$/.test(sourceHash) || !/^[0-9a-f]{64}$/.test(identitySourceHash)) {
    const error = new Error("Exact Production Auth preprovision evidence is required.");
    error.code = "PRODUCTION_AUTH_PREPROVISION_EVIDENCE_REQUIRED";
    throw error;
  }
  const emailIdentityHash = sha256(normalized);
  const requestFingerprint = sha256([
    PRODUCTION_AUTH_PREPROVISION_CONTRACT_VERSION,
    "PRODUCTION_DIRECTOR_AUTH_PREPROVISION",
    "PRODUCTION",
    PRODUCTION_SUPABASE_PROJECT_REF,
    PRODUCTION_SUPABASE_URL,
    PRODUCTION_GOOGLE_WORKBOOK_ID,
    targetTournament,
    targetPlayer,
    emailIdentityHash,
    sourceHash,
    identitySourceHash,
    PRODUCTION_AUTH_PREPROVISION_ACTOR,
  ].join("\n"));
  return Object.freeze({
    emailIdentityHash,
    requestFingerprint,
    claimInput: Object.freeze({
      contract_version: PRODUCTION_AUTH_PREPROVISION_CONTRACT_VERSION,
      operation: "PRODUCTION_DIRECTOR_AUTH_PREPROVISION",
      environment: "PRODUCTION",
      project_ref: PRODUCTION_SUPABASE_PROJECT_REF,
      project_url: PRODUCTION_SUPABASE_URL,
      source_workbook_id: PRODUCTION_GOOGLE_WORKBOOK_ID,
      tournament_id: targetTournament,
      player_id: targetPlayer,
      email_identity_hash: emailIdentityHash,
      source_fingerprint: sourceHash,
      identity_source_fingerprint: identitySourceHash,
      request_fingerprint: requestFingerprint,
      requested_by: PRODUCTION_AUTH_PREPROVISION_ACTOR,
    }),
  });
}
