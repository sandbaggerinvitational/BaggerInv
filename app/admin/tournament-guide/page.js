import { redirect } from "next/navigation";
import { privatePageMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Guide Editor | Sandbagger Invitational");

export default async function GuideEditorPage({ searchParams }) {
  const query = await searchParams;
  const tournament = query?.tournament ? `&tournament=${encodeURIComponent(query.tournament)}` : "";
  redirect(`/admin?tab=guide${tournament}`);
}
