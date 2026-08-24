export const dynamic = "force-dynamic";

import { Header, Footer } from "../../components";
import { getDrafts } from "../../../lib/draft";
import { getHistoricalDraftAnalytics } from "../../../lib/draft-analytics";
import { pageMetadata } from "../../../lib/seo";
import DraftAnalyticsView from "./DraftAnalyticsView";
import { loadDraftRuntime } from "../../../lib/draft-runtime";
import { applicationPageEnvironment } from "../../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Historical Draft Analytics",
  description: "Career draft records, captain performance, Draft Value Score, and historical selection trends from the Sandbagger Invitational.",
  path: "/draft/analytics",
});

export default async function HistoricalDraftAnalyticsPage() {
  const env = await applicationPageEnvironment();
  const runtime = await loadDraftRuntime({ env });
  const analytics = await getHistoricalDraftAnalytics(
    await getDrafts(runtime.draftOptions),
    runtime.analysisOptions
  );
  return <main>
    <Header />
    <DraftAnalyticsView analytics={analytics} readSource={runtime.source.resolved} />
    <Footer />
  </main>;
}
