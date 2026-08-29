import { notFound, redirect } from "next/navigation";
import GuideDetailPage from "../GuideDetailPage";

export const dynamic = "force-dynamic";
const sections = new Set(["schedule", "rules", "dining", "getting-around", "contacts"]);

export default async function TournamentGuideDetailRoute({ params, participantPresentation = false }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  if (!participantPresentation) {
    redirect(`/tournament-guide#${section === "getting-around" ? "local-guide" : section}`);
  }
  return <GuideDetailPage section={section} participantPresentation={participantPresentation} />;
}
