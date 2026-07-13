import Link from "next/link";
import { Header, Footer } from "./components";

export default function Home() {
  return (
    <main>
      <Header />

      <section className="kiawahHero">
        <div className="kiawahOverlay" />

        <div className="kiawahHeroContent">
          <p className="eyebrow">11th Annual Sandbagger Invitational</p>
          <h1>Kiawah Island</h1>
          <p className="heroDate">September 25–26, 2026</p>
          <p className="heroIntro">
            Twenty-four players. Two teams. Three rounds. One trophy.
          </p>

          <div className="actions">
            <Link className="button primary" href="/live">
              Live Match Center
            </Link>
            <Link className="button glass" href="/history">
              Explore the History
            </Link>
          </div>
        </div>

        <div className="heroBottomBar">
          <div>
            <span>Location</span>
            <strong>Kiawah Island, South Carolina</strong>
          </div>
          <div>
            <span>Format</span>
            <strong>Ryder Cup Style</strong>
          </div>
          <div>
            <span>Field</span>
            <strong>24 Players</strong>
          </div>
          <div>
            <span>Established</span>
            <strong>2016</strong>
          </div>
        </div>
      </section>

      <section className="section tournamentSpotlight">
        <div>
          <p className="eyebrow dark">The Next Chapter</p>
          <h2>Where the next chapter will be written.</h2>
          <p className="sectionCopy">
            The 2026 Sandbagger Invitational heads to Kiawah Island for three
            rounds of team competition. Team names, captains, pairings, and live
            scores will populate here directly from your tournament Google Sheet.
          </p>
        </div>

        <div className="featureCard">
          <div>
            <span>Tournament Status</span>
            <strong>Offseason</strong>
          </div>
          <div>
            <span>Team One</span>
            <strong>The Pickles</strong>
          </div>
          <div>
            <span>Team Two</span>
            <strong>Team Lipp</strong>
          </div>
          <div>
            <span>Current Round</span>
            <strong>Round 1</strong>
          </div>
        </div>
      </section>

      <section className="liveBand">
        <div>
          <p className="eyebrow">Tournament Week</p>
          <h2>Live Match Center</h2>
          <p>
            Follow every matchup, team point, hole status, and leaderboard update
            as the tournament unfolds.
          </p>
        </div>

        <div className="liveScorePreview">
          <div>
            <span>The Pickles</span>
            <strong>0</strong>
          </div>
          <p>Overall Score</p>
          <div>
            <span>Team Lipp</span>
            <strong>0</strong>
          </div>
        </div>

        <Link className="button light" href="/live">
          Open Match Center
        </Link>
      </section>

      <section className="section cupSection" id="cup">
        <div className="cupPhoto">
          <img src="/images/trophy.jpg" alt="The Sandbagger Invitational trophy" />
        </div>

        <div className="cupCopy">
          <p className="eyebrow">The Prize</p>
          <h2>The Cup</h2>
          <p>
            Every winning team earns a permanent place in Sandbagger history.
            The trophy carries the names, teams, and stories of the Invitational
            from one year to the next.
          </p>
          <Link className="textLink" href="/history">
            View past champions →
          </Link>
        </div>
      </section>

      <section className="section historyPreview">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow dark">A Decade of Competition</p>
            <h2>Tournament History</h2>
          </div>

          <Link className="textLink darkLink" href="/history">
            View all years →
          </Link>
        </div>

        <div className="yearGrid">
          {[
            "2016",
            "2017",
            "2018",
            "2019",
            "2020",
            "2021",
            "2022",
            "2023",
            "2024",
            "2025",
            "2026",
          ].map((year) => (
            <Link href="/history" className="yearCard" key={year}>
              <span>{year}</span>
              <strong>View tournament</strong>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
