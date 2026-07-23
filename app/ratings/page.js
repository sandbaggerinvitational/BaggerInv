export const dynamic = "force-dynamic";
import { refreshHistoricalData, ELO_K, ELO_START, getSandbaggerRatings } from "../../lib/stats";
import { Header, Footer } from "../components";
import RatingsTable from "./RatingsTable";
import styles from "./ratings.module.css";
import { pageMetadata } from "../../lib/seo";
export const metadata = pageMetadata({
  title: "Sandbagger Ratings | Sandbagger Invitational",
  description: "The official Sandbagger Rating player-strength index across every tournament format.",
  path: "/ratings",
});
export default async function RatingsPage(){await refreshHistoricalData();const ratings=getSandbaggerRatings();return <main><Header/><section className={styles.hero}><p>PLAYER POWER INDEX</p><h1>Sandbagger Rating</h1><span>The official player-strength metric of the Sandbagger Invitational.</span></section><section className={styles.content}><div className={styles.explainer}><h2>The Sandbagger Rating (SBR)</h2><p>The Sandbagger Rating is our proprietary player rating system designed specifically for the Sandbagger Invitational. Ratings use an enhanced Elo model that considers match results, opponent strength, and tournament performance. Separate ratings are maintained for every competition format, allowing players to develop distinct strengths while every match also contributes to an independent Overall SBR.</p><p>Every player begins at <strong>{ELO_START}</strong>. Halves count as <strong>0.5</strong>, and the base update factor is <strong>K={ELO_K}</strong>. Overall updates after every match; format ratings update only when that format is played.</p></div><RatingsTable ratings={ratings}/></section><Footer/></main>}
