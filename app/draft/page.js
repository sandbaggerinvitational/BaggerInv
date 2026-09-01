export const dynamic = "force-dynamic";

import { Header, Footer } from "../components";
import DraftExperience from "./DraftExperience";
import { getCurrentDraft, getDrafts } from "../../lib/draft";
import { pageMetadata } from "../../lib/seo";
import { getDraftAnalysis } from "../../lib/draft-analysis";
import { loadDraftRuntime } from "../../lib/draft-runtime";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";
import { withCanonicalDraftTeamAverages } from "../../lib/draft-team-handicap";
import { readTournamentLiveView } from "../../lib/tournament-live-supabase";

export const metadata = pageMetadata({
  title: "Sandbagger Draft",
  description:
    "Follow the current Sandbagger Invitational Draft order, live selections, and completed team rosters.",
  path: "/draft",
});

export default async function DraftPage() {
  const env = await applicationPageEnvironment();
  const runtime = await loadDraftRuntime({ env });
  const tournamentReadPromise = runtime.source.resolved === "supabase"
    ? readTournamentLiveView(runtime.draftOptions.tournamentId, { env })
    : Promise.resolve(null);
  const [storedDraft, drafts, tournamentRead] = await Promise.all([
    getCurrentDraft(runtime.draftOptions),
    getDrafts(runtime.draftOptions),
    tournamentReadPromise,
  ]);
  if (runtime.source.resolved === "supabase" && (!tournamentRead?.payload?.ok || !tournamentRead.payload.data)) {
    const error = new Error("Current tournament roster is temporarily unavailable for the Draft.");
    error.code = tournamentRead?.payload?.code || "DRAFT_CANONICAL_ROSTER_UNAVAILABLE";
    throw error;
  }
  const draft = runtime.source.resolved === "supabase"
    ? withCanonicalDraftTeamAverages(storedDraft, tournamentRead.payload.data.players, {
        tournamentId: runtime.draftOptions.tournamentId,
      })
    : storedDraft;
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
