
import { Header, Footer } from "../components";
import MatchCenter from "./MatchCenter";

export const metadata = {
  title: "Live Match Center | Sandbagger Invitational",
  description: "Round-by-round Sandbagger Invitational results and team scoring.",
};

export default function LivePage() {
  return (
    <main>
      <Header />
      <MatchCenter />
      <Footer />
    </main>
  );
}
