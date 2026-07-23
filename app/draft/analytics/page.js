export const dynamic = "force-dynamic";

import { Header, Footer } from "../../components";
import { getDrafts } from "../../../lib/draft";
import { getHistoricalDraftAnalytics } from "../../../lib/draft-analytics";
import { refreshHistoricalData } from "../../../lib/stats";
import { pageMetadata } from "../../../lib/seo";
import DraftAnalyticsView from "./DraftAnalyticsView";

export const metadata = pageMetadata({
  title: "Historical Draft Analytics",
  description: "Career draft records, captain performance, Draft Value Score, and historical selection trends from the Sandbagger Invitational.",
  path: "/draft/analytics",
});

export default async function HistoricalDraftAnalyticsPage() {
  await refreshHistoricalData();
  const analytics = await getHistoricalDraftAnalytics(await getDrafts());
  return <main>
    <Header />
    <DraftAnalyticsView analytics={analytics} />
    <Footer />
  </main>;
}
