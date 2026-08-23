export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import DraftExperience from "../DraftExperience";
import { getDraftByYear, getDrafts } from "../../../lib/draft";
import { pageMetadata } from "../../../lib/seo";
import { getDraftAnalysis } from "../../../lib/draft-analysis";
import { loadDraftRuntime } from "../../../lib/draft-runtime";

export async function generateMetadata({ params }) {
  const { year } = await params;
  return pageMetadata({
    title: `${year} Sandbagger Draft`,
    description: `Review the complete ${year} Sandbagger Draft order, selections, and final rosters.`,
    path: `/draft/${year}`,
  });
}

export default async function HistoricalDraftPage({ params }) {
  const runtime = await loadDraftRuntime();
  const { year } = await params;
  const [draft, drafts] = await Promise.all([
    getDraftByYear(year, runtime.draftOptions),
    getDrafts(runtime.draftOptions),
  ]);
  if (!draft) notFound();
  const analysis = await getDraftAnalysis(draft, runtime.analysisOptions);

  return (
    <main>
      <Header />
      <DraftExperience
        draft={draft}
        analysis={analysis}
        previousDrafts={drafts.filter((item) => item.year < draft.year)}
        readSource={runtime.source.resolved}
      />
      <Footer />
    </main>
  );
}
