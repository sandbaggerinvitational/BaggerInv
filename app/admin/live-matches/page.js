import { redirect } from "next/navigation";
import { privatePageMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata("Live Match Control | Sandbagger Invitational");

export default async function LiveMatchControlPage({ searchParams }) {
  const query = await searchParams;
  const tournament = query?.tournament ? `&tournament=${encodeURIComponent(query.tournament)}` : "";
  redirect(`/admin?tab=live-matches${tournament}`);
}
