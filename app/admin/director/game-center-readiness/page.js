import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "../../../components.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import GameCenterReadinessClient from "./GameCenterReadinessClient.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Game Center Readiness | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function GameCenterReadinessPage() {
  const store = await cookies();
  const result = await authorizePreviewDirector({ cookieStore: store, allowBootstrap: true });
  if (result.status !== "active") redirect("/");
  return <main><Header /><GameCenterReadinessClient /></main>;
}
