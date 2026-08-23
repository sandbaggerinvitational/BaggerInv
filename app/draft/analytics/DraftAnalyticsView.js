"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import DraftPickCard from "../DraftPickCard";
import DraftAnalyticsSummary from "./DraftAnalyticsSummary";
import styles from "./draft-analytics.module.css";

const value = (row, key) => row[key] ?? "";
const display = (number, fallback = "—") => Number.isFinite(number) ? number : fallback;
const signed = (number) => Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number}` : "—";

function SortableTable({ columns, rows, initialKey, initialDirection = "desc", empty = "Not enough completed tournament data yet." }) {
  const [sort, setSort] = useState({ key: initialKey, direction: initialDirection });
  const ordered = useMemo(() => [...rows].sort((a, b) => {
    const left = value(a, sort.key);
    const right = value(b, sort.key);
    const result = typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right));
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);
  if (!rows.length) return <p className={styles.empty}>{empty}</p>;
  const changeSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
  }));
  return <div className={styles.tableWrap}>
    <table>
      <thead><tr>{columns.map((column) => <th key={column.key}>
        <button type="button" onClick={() => changeSort(column.key)}>
          {column.label}{sort.key === column.key ? (sort.direction === "desc" ? " ↓" : " ↑") : ""}
        </button>
      </th>)}</tr></thead>
      <tbody>{ordered.map((row, index) => <Fragment key={row.key || `${row.id || row.playerId || row.teamId}-${row.year || index}`}>
        <tr>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : display(row[column.key])}</td>)}</tr>
      </Fragment>)}</tbody>
    </table>
  </div>;
}

const PlayerLink = ({ row, nameKey = "name" }) => row.slug
  ? <Link href={`/players/${row.slug}`}>{row[nameKey]}</Link>
  : <strong>{row[nameKey]}</strong>;

function Section({ eyebrow, title, copy, children, className = "" }) {
  return <section className={`${styles.section} ${className}`}>
    <header><span>{eyebrow}</span><h2>{title}</h2>{copy ? <p>{copy}</p> : null}</header>
    {children}
  </section>;
}

function HallOfFame({ awards }) {
  if (!awards.length) return null;
  return <Section eyebrow="Permanent Records" title="Draft Hall of Fame" className={styles.hallSection}>
    <div className={styles.hallGrid}>{awards.map((award) => {
      const content = <><i>{award.icon}</i><span>{award.title}</span><strong>{award.subject}</strong><small>{award.detail}</small><b>View record →</b></>;
      return award.href
        ? <Link href={award.href} key={award.title}>{content}</Link>
        : <article key={award.title}>{content}</article>;
    })}</div>
  </Section>;
}

function BestDraftClasses({ classes }) {
  return <Section eyebrow="All-Time Board" title="Best Draft Classes" copy="Every completed team draft, ranked by the official Draft Score.">
    <div className={styles.classGrid}>{classes.map((row) => <Link href={`/draft/${row.year}`} key={`${row.year}-${row.teamId}`}>
      <span>{row.year}</span>
      <h3>{row.team}</h3>
      <dl>
        <div><dt>Draft Score</dt><dd>{row.score}</dd></div>
        <div><dt>Grade</dt><dd>{row.grade}</dd></div>
      </dl>
      <p>Captain <strong>{row.captain}</strong></p>
      <b>Open full draft →</b>
    </Link>)}</div>
  </Section>;
}

function CaptainRecords({ captains }) {
  return <Section eyebrow="Captain Board" title="Captain Draft Records" copy="A career view of the captains who built each historical roster.">
    <details className={styles.captainRecords}>
      <summary>
        <div>{captains.slice(0, 3).map((captain) => <span key={captain.id || captain.name}><strong>{captain.name}</strong><b>{captain.averageDraftScore} Draft Score</b></span>)}</div>
        <em>View All →</em>
      </summary>
      <div className={styles.captainGrid}>{captains.map((captain) => <article key={captain.id || captain.name}>
        <span>{captain.slug ? <Link href={`/players/${captain.slug}`}>{captain.name}</Link> : captain.name}</span>
        <dl>
          <div><dt>Draft Wins</dt><dd>{captain.draftWins}</dd></div>
          <div><dt>Average Grade</dt><dd>{captain.averageDraftGrade}</dd></div>
          <div><dt>Average Draft Score</dt><dd>{captain.averageDraftScore}</dd></div>
          <div><dt>Draft Championships</dt><dd>{captain.draftChampionships}</dd></div>
          <div><dt>Best Draft</dt><dd>{captain.bestDraft || "—"}</dd></div>
          <div><dt>Career DVS</dt><dd>{signed(captain.careerDvs)}</dd></div>
          <div><dt>Avg. Team Finish</dt><dd>{display(captain.averageTeamFinish)}</dd></div>
        </dl>
      </article>)}</div>
    </details>
  </Section>;
}

function PlayerDirectory({ players, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const choices = players.filter((player) =>
    player.name.toLowerCase().includes(query.trim().toLowerCase())
  );
  const selected = players.find((player) => player.id === selectedId) || null;
  return <Section eyebrow="Player Directory" title="Career Draft Statistics" copy="Search for a Sandbagger to open his complete draft résumé.">
    <div className={styles.playerSearch}>
      <label htmlFor="draft-player-search">Search Player</label>
      <input id="draft-player-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a player name…" />
      {query ? <div className={styles.playerChoices}>{choices.slice(0, 8).map((player) => <button type="button" onClick={() => { onSelect(player.id); setQuery(""); }} key={player.id}>{player.name}<span>{player.draftsParticipated} drafts</span></button>)}</div> : null}
    </div>
    {selected ? <article className={styles.playerHistory} id="player-draft-history">
      <header><div><span>Draft History</span><h3>{selected.name}</h3></div>{selected.slug ? <Link href={`/players/${selected.slug}`}>View Player Profile →</Link> : null}</header>
      <div className={styles.playerMetrics}>
        <div><span>Avg. Draft Position</span><strong>{selected.averageDraftPosition}</strong></div>
        <div><span>Highest Pick</span><strong>#{selected.highestDraftPosition}</strong></div>
        <div><span>Lowest Pick</span><strong>#{selected.lowestDraftPosition}</strong></div>
        <div><span>First Overall</span><strong>{selected.firstOverallSelections}</strong></div>
        <div><span>Top Five</span><strong>{selected.topFiveSelections}</strong></div>
        <div><span>Championships</span><strong>{selected.championshipsWon}</strong></div>
        <div><span>Career DVS</span><strong>{signed(selected.careerDvs)}</strong></div>
      </div>
      <div className={styles.timeline}>{selected.drafts.map((draft) => <article key={draft.year} style={{ "--draft-team": draft.teamColor }}>
        <b>{draft.year}</b><span>Pick #{draft.pick}</span><strong>{draft.team}</strong><small>{Number.isFinite(draft.finish) ? `Finished #${draft.finish} · ${signed(draft.dvs)} DVS` : "Tournament result pending"}</small>
      </article>)}</div>
    </article> : <p className={styles.directoryPrompt}>Select a player to view draft history, career position, championships, and Draft Value Score.</p>}
  </Section>;
}

function ReplayDraft({ replays }) {
  const [year, setYear] = useState(replays[0]?.year || "");
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const replay = replays.find((row) => row.year === Number(year));
  useEffect(() => {
    if (!playing || !replay || revealed >= replay.picks.length) return undefined;
    const timer = window.setTimeout(() => setRevealed((count) => count + 1), speed);
    return () => window.clearTimeout(timer);
  }, [playing, replay, revealed, speed]);
  useEffect(() => {
    if (replay && revealed >= replay.picks.length) setPlaying(false);
  }, [replay, revealed]);
  if (!replay) return null;
  const changeYear = (event) => { setYear(event.target.value); setRevealed(0); setPlaying(false); };
  return <Section eyebrow="Official Draft Archive" title="Draft Replay" copy="Replay every selection exactly as it occurred using the official Draft Board.">
    <div className={styles.replayControls}>
      <label>Draft Year<select value={year} onChange={changeYear}>{replays.map((row) => <option value={row.year} key={row.year}>{row.year}</option>)}</select></label>
      <button type="button" onClick={() => setPlaying((current) => !current)}>{playing ? "Pause" : revealed ? "Resume" : "▶ Replay Draft"}</button>
      <label>Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="1600">Slow</option><option value="1000">Normal</option><option value="450">Fast</option></select></label>
      <label>Skip to Pick<select value={revealed} onChange={(event) => { setRevealed(Number(event.target.value)); setPlaying(false); }}>{Array.from({ length: replay.picks.length + 1 }, (_, index) => <option value={index} key={index}>{index || "Start"}</option>)}</select></label>
      <button type="button" onClick={() => { setRevealed(0); setPlaying(false); }}>Restart</button>
    </div>
    <div className={styles.replayStatus}><strong>{replay.year} Draft</strong><span>{revealed} of {replay.picks.length} picks revealed</span></div>
    <div className={styles.replayBoard}>{replay.picks.slice(0, revealed).map((pick) => <div className={styles.replayPick} key={pick.pickNumber}><DraftPickCard pick={pick} compact /></div>)}</div>
    {!revealed ? <p className={styles.directoryPrompt}>Press Replay Draft to begin with Pick 1.</p> : null}
  </Section>;
}

function Redraft({ redrafts }) {
  const [year, setYear] = useState(redrafts[0]?.year || "");
  const redraft = redrafts.find((row) => row.year === Number(year));
  if (!redraft) return null;
  const callouts = [
    ["Largest Rise", redraft.largestRise],
    ["Largest Fall", redraft.largestFall],
    ["Best Original Pick", redraft.bestOriginalPick],
    ["Worst Original Pick", redraft.worstOriginalPick],
  ];
  return <Section eyebrow="What-If Analysis" title="AI Redraft" copy="The official draft remains unchanged. This alternate board reorders the field using actual tournament performance and the shared Draft Value Score.">
    <div className={styles.redraftYear}><label htmlFor="redraft-year">Tournament</label><select id="redraft-year" value={year} onChange={(event) => setYear(event.target.value)}>{redrafts.map((row) => <option value={row.year} key={row.year}>{row.year}</option>)}</select></div>
    <div className={styles.redraftCallouts}>{callouts.map(([label, row]) => row ? <article key={label}><span>{label}</span><strong>{row.player}</strong><small>Original #{row.originalPick} → Redraft #{row.redraftPick}</small></article> : null)}</div>
    <div className={styles.redraftBoard}>{redraft.rows.map((row) => <article key={row.playerId}><b>#{row.redraftPick}</b><div><strong>{row.player}</strong><span>Original Pick #{row.originalPick}</span></div><em>{signed(row.redraftValue)} Draft Value</em></article>)}</div>
  </Section>;
}

export default function DraftAnalyticsView({ analytics, readSource = "google" }) {
  const s = analytics.summary;
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const openHistory = (id) => {
    setSelectedPlayer(id);
    window.setTimeout(() => document.getElementById("player-draft-history")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };
  const careerRows = analytics.players.filter((row) => row.draftsParticipated >= 2);
  const resultColumns = [
    { key: "player", label: "Player", render: (row) => <PlayerLink row={row} nameKey="player" /> },
    { key: "year", label: "Year" },
    { key: "pick", label: "Draft Position", render: (row) => `#${row.pick}` },
    { key: "finish", label: "Tournament Finish", render: (row) => Number.isFinite(row.finish) ? `#${row.finish}` : "—" },
    { key: "dvs", label: "Draft Value Score", render: (row) => <b>{signed(row.dvs)}</b> },
  ];

  return <>
    <section className={styles.hero} data-draft-read-source={readSource}><p>SBI Draft History</p><h1>Historical Draft Analytics</h1><span>Every selection, captain, draft class, and value swing across Sandbagger Invitational history.</span></section>
    <div className={styles.shell}>
      <div className={styles.summaryGrid}>{[
        ["Drafts Recorded", s.draftsRecorded], ["Players Drafted", s.playersDrafted], ["Unique Golfers", s.uniqueGolfers], ["Captains", s.captains], ["Average Draft Size", `${s.averageDraftSize} Picks`],
      ].map(([label, metric]) => <article key={label}><span>{label}</span><strong>{metric}</strong></article>)}</div>

      <HallOfFame awards={analytics.hallOfFame} />
      <BestDraftClasses classes={analytics.classes} />
      <CaptainRecords captains={analytics.captains} />
      <PlayerDirectory players={analytics.players} selectedId={selectedPlayer} onSelect={setSelectedPlayer} />

      <Section eyebrow="Minimum Two Drafts" title="Draft Value Leaderboard" copy="One career leaderboard replaces duplicate draft-position tables. Select a player to open his history above.">
        <SortableTable columns={[
          { key: "name", label: "Player", render: (row) => <button className={styles.tablePlayerButton} type="button" onClick={() => openHistory(row.id)}>{row.name}</button> },
          { key: "draftsParticipated", label: "Drafts" },
          { key: "averageDraftPosition", label: "Average Draft Position" },
          { key: "highestDraftPosition", label: "Highest Pick", render: (row) => `#${row.highestDraftPosition}` },
          { key: "lowestDraftPosition", label: "Lowest Pick", render: (row) => `#${row.lowestDraftPosition}` },
          { key: "careerDvs", label: "Career DVS", render: (row) => <b>{signed(row.careerDvs)}</b> },
          { key: "averageTeamFinish", label: "Avg. Tournament Finish" },
        ]} rows={careerRows} initialKey="careerDvs" />
      </Section>

      <Section eyebrow="Selection vs. Result" title="Draft Position vs Tournament Finish">
        <SortableTable columns={resultColumns} rows={analytics.draftRows.filter((row) => Number.isFinite(row.finish))} initialKey="dvs" />
      </Section>

      <div className={styles.split}>
        <Section eyebrow="Positive DVS" title="Greatest Steals"><SortableTable columns={resultColumns} rows={analytics.steals} initialKey="dvs" /></Section>
        <Section eyebrow="Negative DVS" title="Biggest Reaches"><SortableTable columns={resultColumns} rows={analytics.reaches} initialKey="dvs" initialDirection="asc" /></Section>
      </div>

      <Section eyebrow="Opening Selections" title="First Overall Picks">
        <SortableTable columns={[
          { key: "year", label: "Year" },
          { key: "player", label: "Player", render: (row) => <PlayerLink row={row} nameKey="player" /> },
          { key: "captain", label: "Captain" },
          { key: "finish", label: "Tournament Finish", render: (row) => Number.isFinite(row.finish) ? `#${row.finish}` : "Pending" },
          { key: "teamFinish", label: "Team Finish", render: (row) => Number.isFinite(row.teamFinish) ? `#${row.teamFinish}` : "Pending" },
          { key: "draftGrade", label: "Draft Grade" },
        ]} rows={analytics.firstOverall} initialKey="year" />
      </Section>

      <ReplayDraft replays={analytics.replays} />
      <Redraft redrafts={analytics.redrafts} />

      {analytics.trends.length ? <Section eyebrow="Minimum Three Drafts" title="Historical Trends"><div className={styles.trends}>{analytics.trends.map((trend) => <p key={trend}>{trend}</p>)}</div></Section> : null}

      <section className={styles.analyst}><span>SBI Historical Draft Analyst</span><h2>AI Historical Draft Review</h2><DraftAnalyticsSummary analytics={analytics} styles={styles} /></section>
    </div>
  </>;
}
