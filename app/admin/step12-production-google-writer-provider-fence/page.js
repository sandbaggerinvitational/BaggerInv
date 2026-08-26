import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { authorizePreviewDirector } from
  "../../../lib/preview-director-authorization.js";
import {
  productionGoogleWriterProviderFenceEnvironment,
  PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR,
} from "../../../lib/production-google-writer-fence-rehearsal-server.js";
import PersistentWriterFenceClient from "./PersistentWriterFenceClient.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Step 12 Persistent Google Writer Fence | Bagger Invitational",
  robots: { index: false, follow: false },
};

export default async function Step12PersistentGoogleWriterFencePage() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const host = String(
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "",
  ).split(",")[0].trim();
  const proto = String(headerStore.get("x-forwarded-proto") || "https")
    .split(",")[0].trim();
  const request = {
    method: "GET",
    url: `${proto}://${host}/admin/step12-production-google-writer-provider-fence`,
    headers: headerStore,
  };
  const [director, environment] = await Promise.all([
    authorizePreviewDirector({
      request,
      cookieStore,
      env: process.env,
      allowBootstrap: false,
    }),
    Promise.resolve(productionGoogleWriterProviderFenceEnvironment(process.env)),
  ]);
  const playerId = String(
    director?.identity?.actor?.id || director?.identity?.player?.id || "",
  ).trim();
  const tournamentId = String(
    director?.identity?.tournamentId || director?.identity?.session?.tournamentId || "",
  ).trim();
  if (!environment.allowed || director?.status !== "active" ||
      director?.source !== "production-director-entitlement" ||
      director?.identity?.impersonating === true ||
      playerId !== PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR ||
      tournamentId !== "2026") notFound();

  return <PersistentWriterFenceClient environment={{
    contractVersion: environment.contractVersion,
    resources: environment.resources,
    credentials: environment.credentials,
    safety: environment.safety,
  }} />;
}
