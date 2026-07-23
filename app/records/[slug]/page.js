import { refreshHistoricalData } from "../../../lib/stats";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../components";
import {
  getLeaderboard,
  getLeaderboardSlugs,
} from "../../../lib/leaderboards";
import SortableLeaderboard from "../SortableLeaderboard";
import styles from "../../historical.module.css";
import { pageMetadata } from "../../../lib/seo";

export const dynamic = "force-dynamic";


export async function generateMetadata({ params }) {
  await refreshHistoricalData();
  const { slug } = await params;
  const leaderboard = getLeaderboard(slug);

  const title = leaderboard
    ? `${leaderboard.title} | The Sandbagger Invitational`
    : "Leaderboard | The Sandbagger Invitational";
  return pageMetadata({
    title,
    description:
      leaderboard?.description ||
      "Official Sandbagger Invitational historical leaderboard.",
    path: `/records/${slug}`,
  });
}

export default async function FullLeaderboardPage({ params }) {
  await refreshHistoricalData();
  const { slug } = await params;
  const leaderboard = getLeaderboard(slug);
  if (!leaderboard) notFound();

  const defaultSort =
    leaderboard.columns.find((column) => column.numeric)?.key || "name";

  const ascending =
    slug === "average-handicap";

  return (
    <main>
      <Header />

      <section className={styles.pageHero}>
        <p className={styles.eyebrow}>Full Leaderboard</p>
        <h1>{leaderboard.title}</h1>
        <p>{leaderboard.description}</p>
      </section>

      <section className={styles.content}>
        <div className={styles.leaderboardTopLinks}>
          <Link href="/records">← Records</Link>
          <Link href="/statistics">Statistics Center →</Link>
        </div>

        <SortableLeaderboard
          rows={leaderboard.rows}
          columns={leaderboard.columns}
          initialSort={defaultSort}
          initialDirection={ascending ? "asc" : "desc"}
        />
      </section>

      <Footer />
    </main>
  );
}
