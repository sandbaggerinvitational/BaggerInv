import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Header } from "../../../components.js";
import { authorizePreviewDirector } from "../../../../lib/preview-director-authorization.js";
import CompletedHistoryClient from "./CompletedHistoryClient.js";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Completed History Foundation | Sandbagger Invitational",
  robots: { index: false, follow: false },
};

export default async function CompletedHistoryPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const store = await cookies();
  const result = await authorizePreviewDirector({ cookieStore: store, allowBootstrap: false });
  if (result.status !== "active") redirect("/home");
  return <main><Header homeHref="/home" /><CompletedHistoryClient /></main>;
}
