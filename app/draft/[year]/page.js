export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import DraftExperience from "../DraftExperience";
import { getDraftByYear, getDrafts } from "../../../lib/draft";
import { refreshHistoricalData } from "../../../lib/stats";
import { pageMetadata } from "../../../lib/seo";
import { getDraftAnalysis } from "../../../lib/draft-analysis";

export async function generateMetadata({ params }) {
  const { year } = await params;
  return pageMetadata({
    title: `${year} Sandbagger Draft`,
    description: `Review the complete ${year} Sandbagger Draft order, selections, and final rosters.`,
    path: `/draft/${year}`,
  });
}

export default async function HistoricalDraftPage({ params }) {
  await refreshHistoricalData();
  const { year } = await params;
  const draft = await getDraftByYear(year);
  if (!draft) notFound();
  const drafts = await getDrafts();
  const analysis = await getDraftAnalysis(draft);

  return (
    <main>
      <Header />
      <DraftExperience
        draft={draft}
        analysis={analysis}
        previousDrafts={drafts.filter((item) => item.year < draft.year)}
      />
      <Footer />
    </main>
  );
}
