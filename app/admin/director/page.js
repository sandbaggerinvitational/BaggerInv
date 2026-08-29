import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "../../components.js";
import { authorizePreviewDirector } from "../../../lib/preview-director-authorization.js";
import DirectorDashboard from "./DirectorDashboard.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournament Director | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function DirectorPage() {
  const store = await cookies();
  const result = await authorizePreviewDirector({ cookieStore: store, allowBootstrap: true });
  if (["inactive", "forbidden"].includes(result.status)) redirect("/");
  return <main><Header /><DirectorDashboard directorName={result.identity?.actor?.name || "Tournament Director"} /></main>;
}
