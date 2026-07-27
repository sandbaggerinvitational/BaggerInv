import { privatePageMetadata } from "../../lib/seo";
import ScoreEntry from "./ScoreEntry";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Enter Live Scores | Sandbagger Invitational");

export default function ScorePage() {
  return <main><ScoreEntry /></main>;
}
