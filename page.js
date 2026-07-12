const matches = [
  { label: "Match 1", teamA: "Team Green", teamB: "Team Gold", status: "All Square", through: "Not started" },
  { label: "Match 2", teamA: "Team Green", teamB: "Team Gold", status: "All Square", through: "Not started" },
  { label: "Match 3", teamA: "Team Green", teamB: "Team Gold", status: "All Square", through: "Not started" },
];

const history = [
  { year: "2025", winner: "Add winning team", location: "Add host course" },
  { year: "2024", winner: "Add winning team", location: "Add host course" },
  { year: "2023", winner: "Add winning team", location: "Add host course" },
];

export default function Home() {
  return (
    <main>
      <header className="siteHeader">
        <a className="brand" href="#top">
          <div className="brandMark">SI</div>
          <div>
            <div className="brandName">Sandbagger Invitational</div>
            <div className="brandSub">Established 2016</div>
          </div>
        </a>

        <nav>
          <a href="#live">Live Matches</a>
          <a href="#tournament">Tournament</a>
          <a href="#history">History</a>
          <a href="#players">Players</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="heroOverlay" />
        <div className="heroContent">
          <p className="eyebrow">24 Players · Two Teams · One Trophy</p>
          <h1>The Sandbagger Invitational</h1>
          <p className="heroText">
            Ryder Cup-style competition, tradition, and bragging rights since 2016.
          </p>
          <div className="heroActions">
            <a className="button primary" href="#live">View Live Matches</a>
            <a className="button secondary" href="#tournament">Tournament Details</a>
          </div>
        </div>
      </section>

      <section className="quickStats">
        <div><span>Established</span><strong>2016</strong></div>
        <div><span>Players</span><strong>24</strong></div>
        <div><span>Teams</span><strong>2</strong></div>
        <div><span>Format</span><strong>Ryder Cup</strong></div>
      </section>

      <section className="section" id="live">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow dark">Tournament Central</p>
            <h2>Live Match Updates</h2>
          </div>
          <span className="liveBadge">LIVE</span>
        </div>

        <p className="sectionIntro">
          These cards are placeholders. In the next step, we will connect them to your Google Sheet.
        </p>

        <div className="matchGrid">
          {matches.map((match) => (
            <article className="matchCard" key={match.label}>
              <div className="matchTop">
                <span>{match.label}</span>
                <span>{match.through}</span>
              </div>
              <div className="teamRow">
                <strong>{match.teamA}</strong>
                <span>vs.</span>
                <strong>{match.teamB}</strong>
              </div>
              <div className="matchStatus">{match.status}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="section alternate" id="tournament">
        <div className="twoColumn">
          <div>
            <p className="eyebrow dark">The Event</p>
            <h2>Built on tradition and competition</h2>
            <p>
              The Sandbagger Invitational brings together 24 players split into two teams for a
              Ryder Cup-style tournament. Add your upcoming location, schedule, format, rules,
              and defending champion here.
            </p>
          </div>
          <div className="detailCard">
            <div><span>Next Tournament</span><strong>Add dates</strong></div>
            <div><span>Host Course</span><strong>Add location</strong></div>
            <div><span>Defending Team</span><strong>Add winner</strong></div>
            <div><span>Format</span><strong>Two-team match play</strong></div>
          </div>
        </div>
      </section>

      <section className="section" id="history">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow dark">Past Champions</p>
            <h2>Tournament History</h2>
          </div>
        </div>

        <div className="historyTable">
          <div className="historyRow historyHeader">
            <span>Year</span><span>Champion</span><span>Host Course</span>
          </div>
          {history.map((item) => (
            <div className="historyRow" key={item.year}>
              <strong>{item.year}</strong>
              <span>{item.winner}</span>
              <span>{item.location}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section alternate" id="players">
        <div className="sectionHeading">
          <div>
            <p className="eyebrow dark">The Field</p>
            <h2>24 Players. Two Teams.</h2>
          </div>
        </div>

        <div className="playerPlaceholder">
          <p>
            Player cards, team rosters, photos, handicaps, records, and head-to-head results will go here.
          </p>
        </div>
      </section>

      <footer>
        <div>
          <strong>Sandbagger Invitational</strong>
          <span>Established 2016</span>
        </div>
        <p>Official tournament website · baggerinv.com</p>
      </footer>
    </main>
  );
}
