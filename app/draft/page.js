export const dynamic = "force-dynamic";

import { Header, Footer } from "../components";
import DraftExperience from "./DraftExperience";
import { getCurrentDraft, getDrafts } from "../../lib/draft";
import { pageMetadata } from "../../lib/seo";
import { getDraftAnalysis } from "../../lib/draft-analysis";
import { loadDraftRuntime } from "../../lib/draft-runtime";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";

export const metadata = pageMetadata({
  title: "Sandbagger Draft",
  description:
    "Follow the current Sandbagger Invitational Draft order, live selections, and completed team rosters.",
  path: "/draft",
});

export default async function DraftPage() {
  const env = await applicationPageEnvironment();
  const runtime = await loadDraftRuntime({ env });
  const [draft, drafts] = await Promise.all([
    getCurrentDraft(runtime.draftOptions),
    getDrafts(runtime.draftOptions),
  ]);
  const analysis = draft ? await getDraftAnalysis(draft, runtime.analysisOptions) : null;

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
        readSource={runtime.source.resolved}
      />
      <Footer />
    </main>
  );
}
