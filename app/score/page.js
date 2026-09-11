import { notFound } from "next/navigation";
import { privatePageMetadata } from "../../lib/seo";
import { liveTournamentV2Enabled } from "../../lib/spreadsheet-environment";
import ScoreEntry from "./ScoreEntry";
import PreviewModeBadge from "../PreviewModeBadge";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Enter Live Scores | Sandbagger Invitational");

export default function ScorePage() {
  if (!liveTournamentV2Enabled()) notFound();
  const previewMode = process.env.VERCEL_ENV === "preview";
  return <main><PreviewModeBadge visible={previewMode} /><ScoreEntry /></main>;
}
