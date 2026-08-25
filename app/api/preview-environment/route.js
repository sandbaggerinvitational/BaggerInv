import { NextResponse } from "next/server";
import {
  previewEnvironmentDiagnostic,
} from "../../../lib/spreadsheet-environment";
import { productionShadowCandidateEnvironment } from "../../../lib/production-shadow-candidate.js";
import { productionStep11ScoringRehearsalEnvironment } from "../../../lib/production-step11-scoring-rehearsal.js";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const candidate = productionShadowCandidateEnvironment(process.env);
  const scoringRehearsal = productionStep11ScoringRehearsalEnvironment(process.env);
  return NextResponse.json({
    ...previewEnvironmentDiagnostic(),
    productionShadowCandidate: {
      requested: candidate.requested,
      allowed: candidate.allowed,
      reason: candidate.reason,
      previewDeployment: candidate.previewDeployment,
      hostnameApproved: candidate.hostnameApproved,
      deploymentHostnameApproved: candidate.deploymentHostnameApproved,
      commitApproved: candidate.commitApproved,
      projectIdentityApproved: candidate.projectIdentityApproved,
      foundationEnabled: candidate.foundationEnabled,
      projectRefApproved: candidate.projectRefApproved,
      projectUrlApproved: candidate.projectUrlApproved,
      workbookApproved: candidate.workbookApproved,
      serverCredentialsConfigured: candidate.serverCredentialsConfigured,
      publicAuthUrlApproved: candidate.publicAuthUrlApproved,
      publicAuthKeyConfigured: candidate.publicAuthKeyConfigured,
      authEnabled: candidate.authEnabled,
      scoringAuthorityApproved: candidate.scoringAuthorityApproved,
      identityRequested: candidate.identityRequested,
      captchaRequired: candidate.captchaRequired,
      captchaConfigured: candidate.captchaConfigured,
      captchaSiteKeyConfigured: candidate.captchaSiteKeyConfigured,
      authRateLimitConfigured: candidate.authRateLimitConfigured,
      noAuthoritativeFeatures: candidate.noAuthoritativeFeatures,
    },
    productionStep11ScoringRehearsal: {
      requested: scoringRehearsal.requested,
      allowed: scoringRehearsal.allowed,
      reason: scoringRehearsal.reason,
      previewDeployment: scoringRehearsal.previewDeployment,
      shaApproved: scoringRehearsal.shaApproved,
      hostnameApproved: scoringRehearsal.hostnameApproved,
      projectApproved: scoringRehearsal.projectApproved,
      workbookApproved: scoringRehearsal.workbookApproved,
      runSecretConfigured: scoringRehearsal.runSecretConfigured,
      s3FingerprintApproved: scoringRehearsal.s3FingerprintApproved,
      scoringAuthorityPreserved: scoringRehearsal.scoringAuthorityPreserved,
      identityAuthorityApproved: scoringRehearsal.identityAuthorityApproved,
      shadowCandidateIdentityApproved: scoringRehearsal.shadowCandidateIdentityApproved,
      liveFeaturesDormant: scoringRehearsal.liveFeaturesDormant,
      externalWritesDisabled: scoringRehearsal.externalWritesDisabled,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
