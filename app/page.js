export const dynamic = "force-dynamic";
import { refreshHistoricalData } from "../lib/stats";
import Link from "next/link";
import { Header, Footer } from "./components";
import { getTournaments } from "../lib/stats";
import { getTournamentData } from "./live/sheetData";
import { homePageHero } from "../lib/asset-paths";

function clean(value) {
  return String(value ?? "").trim();
}

function imagePath(value) {
  const source = clean(value);
  if (!source) return null;
  if (/^(https?:)?\/\//i.test(source) || source.startsWith("/")) return source;
  return `/images/${source}`;
}

function playerName(player) {
  return clean(player?.["Display Name"] || player?.name);
}

function primaryHeroAction({ status, hasPairings, year }) {
  const normalized = clean(status).toLowerCase();

  if (/complete|completed|final/.test(normalized)) {
    return { label: "Final Results", href: `/history/${year}` };
  }

  if (/live|in progress|underway/.test(normalized)) {
    return { label: "Live Match Center", href: "/live" };
  }

  if (hasPairings || /pairing/.test(normalized)) {
    return { label: "View Pairings", href: "/live" };
  }

  return { label: "Tournament Preview", href: `/history/${year}` };
}

export default async function Home() {
  await refreshHistoricalData();
  const tournaments = [...getTournaments()].sort(
    (a, b) => a.year - b.year
  );
  const currentTournament = tournaments[tournaments.length - 1] || {};
  let liveData = null;

  try {
    liveData = await getTournamentData();
  } catch (error) {
    console.error("Homepage live tournament details could not be loaded.", error);
  }

  const liveTournament = liveData?.tournament || {};
  const year = Number(liveTournament.year) || currentTournament.year;
  const destination =
    clean(liveTournament.location || currentTournament.Destination) ||
    "Tournament destination";
  const firstCourse = currentTournament.courses?.[0] || {};
  const state = clean(firstCourse.State);
  const location = state ? `${destination}, ${state}` : destination;
  const dates = clean(liveTournament.dates || currentTournament.Dates);
  const roundCount = currentTournament.courses?.length || 0;
  const teamOneName =
    clean(liveTournament.teamOne?.name || currentTournament.team1?.name) ||
    "Team One";
  const teamTwoName =
    clean(liveTournament.teamTwo?.name || currentTournament.team2?.name) ||
    "Team Two";
  const captainOne = playerName(currentTournament.team1?.captain);
  const captainTwo = playerName(currentTournament.team2?.captain);
  const rosterCount =
    (currentTournament.team1?.roster?.length || 0) +
    (currentTournament.team2?.roster?.length || 0);
  const listedTeamSize = Number(currentTournament["Team Size"]);
  const playerCount = rosterCount ||
    (Number.isFinite(listedTeamSize) ? listedTeamSize * 2 : 0);
  const status = clean(liveTournament.status) || "Upcoming";
  const currentRound = clean(liveTournament.currentRound) || "Not started";
  const hasPairings = Object.values(liveData?.rounds || {}).some(
    (round) => round.matches?.length
  );
  const primaryAction = primaryHeroAction({ status, hasPairings, year });
  const edition =
    clean(currentTournament.editionTitle) || `${year} Sandbagger Invitational`;
  const mobileHeroImage = imagePath(
    currentTournament["Mobile Hero Image"] ||
      currentTournament["Homepage Mobile Hero Image"]
  );
  const establishedYear = tournaments[0]?.year || 2016;
  const captainsCopy = captainOne && captainTwo
    ? ` Captains ${captainOne} and ${captainTwo} lead ${teamOneName} and ${teamTwoName}.`
    : ` ${teamOneName} and ${teamTwoName} will compete for the Cup.`;
  const roundCopy = roundCount
    ? `${roundCount} ${roundCount === 1 ? "round" : "rounds"}`
    : "a full slate";

  return (
    <main>
      <Header />

      <section className="kiawahHero">
        <picture className="kiawahHeroMedia" aria-hidden="true">
          {mobileHeroImage ? (
            <source media="(max-width: 768px)" srcSet={mobileHeroImage} />
          ) : null}
          <img
            className="kiawahHeroImage"
            src={homePageHero}
            alt=""
          />
        </picture>
        <div className="kiawahOverlay" />

        <div className="kiawahHeroContent">
          <p className="eyebrow">{edition}</p>
          <h1>{destination}</h1>
          {dates ? <p className="heroDate">{dates}</p> : null}
          <p className="heroIntro">
            {playerCount ? `${playerCount} players. ` : ""}Two teams. {roundCount ? `${roundCount} rounds. ` : ""}One trophy.
          </p>

          <div className="actions">
            <Link className="button primary" href={primaryAction.href}>
              {primaryAction.label}
            </Link>
            <Link className="button glass" href="/history">
              Explore the History
            </Link>
          </div>
        </div>

        <div className="heroBottomBar">
          <div>
            <span>Location</span>
            <strong>{location}</strong>
          </div>
          <div>
            <span>Format</span>
            <strong>Ryder Cup Style</strong>
          </div>
          <div>
            <span>Field</span>
            <strong>{playerCount ? `${playerCount} Players` : "Two Teams"}</strong>
          </div>
          <div>
            <span>Established</span>
            <strong>{establishedYear}</strong>
          </div>
        </div>
      </section>

      <div className="mobileTournamentStrip" aria-label="Tournament details">
        <span>{location}</span>
        <span>{playerCount ? `${playerCount} Players` : "Two Teams"}</span>
        <span>Ryder Cup Style</span>
      </div>

      <section className="section tournamentSpotlight">
        <div>
          <p className="eyebrow dark">The Next Chapter</p>
          <h2>Where the next chapter will be written.</h2>
          <p className="sectionCopy">
            The {year} Sandbagger Invitational heads to {destination} for {roundCopy}
            of team competition.{captainsCopy} Follow the pairings, momentum, and
            every point as the tournament unfolds.
          </p>
        </div>

        <div className="featureCard">
          <div>
            <span>Tournament Status</span>
            <strong>{status}</strong>
          </div>
          <div>
            <span>Team One</span>
            <strong>{teamOneName}</strong>
          </div>
          <div>
            <span>Team Two</span>
            <strong>{teamTwoName}</strong>
          </div>
          <div>
            <span>Current Round</span>
            <strong>{currentRound}</strong>
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
            <span>{teamOneName}</span>
            <strong>{liveTournament.teamOne?.score ?? 0}</strong>
          </div>
          <p>Overall Score</p>
          <div>
            <span>{teamTwoName}</span>
            <strong>{liveTournament.teamTwo?.score ?? 0}</strong>
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
          <Link className="textLink" href="/champions">
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
          {tournaments.map((tournament) => (
            <Link
              href={`/history/${tournament.year}`}
              className="yearCard"
              key={tournament.year}
            >
              <span>{tournament.year}</span>
              <p>
                {tournament.Destination ||
                  tournament.Location ||
                  "Tournament destination"}
              </p>
              <strong>View tournament</strong>
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}
