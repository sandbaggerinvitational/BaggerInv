import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Match Control | Sandbagger Invitational" };

export default async function LiveMatchControlPage({ searchParams }) {
  const query = await searchParams;
  const tournament = query?.tournament ? `&tournament=${encodeURIComponent(query.tournament)}` : "";
  redirect(`/admin?tab=live-matches${tournament}`);
}
