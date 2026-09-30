import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "../../components.js";
import {
  authorizePreviewDirector,
  productionDirectorEntitlementEnvironment,
} from "../../../lib/preview-director-authorization.js";
import { productionDirectorSection } from "../../../lib/production-director-console.js";
import CanonicalDirectorConsole from "./CanonicalDirectorConsole.js";
import ProductionDirectorConsole from "./ProductionDirectorConsole.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournament Director | Sandbagger Invitational", robots: { index: false, follow: false } };

export default async function DirectorPage({ searchParams }) {
  const production = productionDirectorEntitlementEnvironment();
  if (production.production && !production.enabled) redirect("/");
  const store = await cookies();
  const result = await authorizePreviewDirector({
    cookieStore: store,
    allowBootstrap: !production.production,
  });
  if (result.status === "inactive" || result.status === "forbidden") redirect("/");
  if (production.production) {
    const query = await searchParams;
    return <main><Header /><ProductionDirectorConsole
      directorName={result.identity?.actor?.name || "Tournament Director"}
      initialSection={productionDirectorSection(query?.section)}
    /></main>;
  }
  return <main><Header /><CanonicalDirectorConsole directorName={result.identity?.actor?.name || "Tournament Director"} /></main>;
}
