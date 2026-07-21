import { Header, Footer } from "../../components";
import { getTournaments, refreshHistoricalData } from "../../../lib/stats";
import GuideEditor from "./GuideEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Guide Editor | Sandbagger Invitational" };

export default async function GuideEditorPage() {
  await refreshHistoricalData();
  const tournaments = getTournaments().map((item) => ({ id: item.id, year: item.year, label: item.editionTitle || `${item.year} Sandbagger Invitational` }));
  return <main><Header /><GuideEditor tournaments={tournaments} /><Footer /></main>;
}
