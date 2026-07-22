import { Footer, Header } from "../components";
import { getTournaments, refreshHistoricalData } from "../../lib/stats";
import AdminCenter from "./AdminCenter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin Center | Sandbagger Invitational" };

export default async function AdminPage() {
  await refreshHistoricalData();
  const tournaments = [...getTournaments()].sort((a, b) => b.year - a.year).map((item) => ({
    id: item.id,
    year: item.year,
    label: item.editionTitle || `${item.year} Sandbagger Invitational`,
    status: item.Status || item["Tournament Status"] || "Not set",
    dates: item.Dates || item.Date || "",
    location: item.Location || item.Destination || "",
    logo: item.logoFileName || "",
    hero: item["Hero Image Filename"] || item["Homepage Image"] || "",
    mobileHero: item["Mobile Hero Image Filename"] || item["Mobile Hero Image"] || "",
    currentRound: item["Current Round"] || "",
    teamOne: item.team1?.name || "Team 1",
    teamTwo: item.team2?.name || "Team 2",
    captainOne: item.team1?.captain?.["Display Name"] || "",
    captainTwo: item.team2?.captain?.["Display Name"] || "",
  }));
  return <main><Header /><AdminCenter tournaments={tournaments} /><Footer /></main>;
}
