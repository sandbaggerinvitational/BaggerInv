import { Footer, Header } from "../../components";
import LiveMatchControl from "./LiveMatchControl";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Match Control | Sandbagger Invitational" };

export default function LiveMatchControlPage() {
  return <main><Header /><LiveMatchControl /><Footer /></main>;
}
