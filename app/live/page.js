import { Header, Footer } from "../components";
import MatchCenter from "./MatchCenter";
import { getTournamentData } from "./sheetData";

export const metadata = {
  title: "Match Center | Sandbagger Invitational",
  description: "Round-by-round Sandbagger Invitational results and team scoring.",
};

export default async function LivePage() {
  let data;
  let error = "";

  try {
    data = await getTournamentData();
  } catch (caughtError) {
    console.error(caughtError);
    error =
      "The live results could not be loaded. Confirm the Website Feed tab is publicly viewable.";
  }

  return (
    <main>
      <Header />
      <MatchCenter initialData={data} loadError={error} />
      <Footer />
    </main>
  );
}