import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { authorizePreviewDirector } from "../../../lib/preview-director-authorization.js";
import {
  productionGoogleWriterFenceRehearsalEnvironment,
  PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR,
} from "../../../lib/production-google-writer-fence-rehearsal-server.js";
import WriterFenceClient from "./WriterFenceClient.js";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Step 11.6 Google Writer Fence | Bagger Invitational",
  robots: { index: false, follow: false },
};

export default async function Step116GoogleWriterFencePage() {
  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const host = String(
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "",
  ).split(",")[0].trim();
  const proto = String(headerStore.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const request = {
    method: "GET",
    url: `${proto}://${host}/admin/step11-6-production-google-writer-fence`,
    headers: headerStore,
  };
  const [director, environment] = await Promise.all([
    authorizePreviewDirector({
      request,
      cookieStore,
      env: process.env,
      allowBootstrap: false,
    }),
    Promise.resolve(productionGoogleWriterFenceRehearsalEnvironment(process.env)),
  ]);
  const playerId = String(
    director?.identity?.actor?.id || director?.identity?.player?.id || "",
  ).trim();
  const tournamentId = String(
    director?.identity?.tournamentId || director?.identity?.session?.tournamentId || "",
  ).trim();
  if (!environment.allowed || director?.status !== "active" ||
      director?.source !== "production-shadow-entitlement" ||
      director?.identity?.impersonating === true ||
      playerId !== PRODUCTION_GOOGLE_WRITER_FENCE_DIRECTOR || tournamentId !== "2026") {
    notFound();
  }

  return <WriterFenceClient environment={{
    contractVersion: environment.contractVersion,
    resources: environment.resources,
    credentials: environment.credentials,
    safety: environment.safety,
  }} />;
}
