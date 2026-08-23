import SourceAuditClient from "./SourceAuditClient.js";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Data Authority Source Audit",
};

export default async function SourceAuditPage({ searchParams }) {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const params = await searchParams;
  return (
    <SourceAuditClient
      requestedOutage={params?.outage}
      requestedSurface={params?.surface}
    />
  );
}
