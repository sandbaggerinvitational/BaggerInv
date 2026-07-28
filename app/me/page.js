import { privatePageMetadata } from "../../lib/seo";
import PreviewModeBadge from "../PreviewModeBadge";
import ParticipantProfile from "./ParticipantProfile";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Me | Sandbagger Invitational");

export default function MePage() {
  return <main>
    <PreviewModeBadge visible={process.env.VERCEL_ENV === "preview"} />
    <ParticipantProfile />
  </main>;
}
