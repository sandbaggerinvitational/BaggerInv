import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Header } from "../../../components.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import GameCenterReadinessClient from "./GameCenterReadinessClient.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Game Center Readiness | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function GameCenterReadinessPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const store = await cookies();
  const result = await authorizePreviewDirector({ cookieStore: store, allowBootstrap: true });
  if (result.status !== "active") redirect("/");
  return <main><Header /><GameCenterReadinessClient /></main>;
}
