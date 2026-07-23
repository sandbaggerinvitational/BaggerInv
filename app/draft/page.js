export const dynamic = "force-dynamic";

import { Header, Footer } from "../components";
import DraftExperience from "./DraftExperience";
import { getCurrentDraft, getDrafts } from "../../lib/draft";
import { refreshHistoricalData } from "../../lib/stats";
import { pageMetadata } from "../../lib/seo";
import { getDraftAnalysis } from "../../lib/draft-analysis";

export const metadata = pageMetadata({
  title: "Sandbagger Draft",
  description:
    "Follow the current Sandbagger Invitational Draft order, live selections, and completed team rosters.",
  path: "/draft",
});

export default async function DraftPage() {
  await refreshHistoricalData();
  const draft = await getCurrentDraft();
  const drafts = await getDrafts();
  const analysis = draft ? await getDraftAnalysis(draft) : null;

  if (!draft) {
    return (
      <main>
        <Header />
        <section style={{ padding: "90px 7vw" }}>
          <h1>Sandbagger Draft</h1>
          <p>Draft information is coming soon.</p>
        </section>
        <Footer />
      </main>
    );
  }

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
