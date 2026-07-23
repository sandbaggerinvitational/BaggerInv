"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import DraftAnalyticsSummary from "./DraftAnalyticsSummary";
import styles from "./draft-analytics.module.css";

const value = (row, key) => row[key] ?? "";
const display = (number, fallback = "—") => Number.isFinite(number) ? number : fallback;
const signed = (number) => Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number}` : "—";

function SortableTable({ columns, rows, initialKey, empty = "Not enough completed tournament data yet.", details }) {
  const [sort, setSort] = useState({ key: initialKey, direction: "desc" });
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
        <tr>
          {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : display(row[column.key])}</td>)}
        </tr>
        {details ? <tr className={styles.detailRow} key={`details-${row.key || row.id}`}><td colSpan={columns.length}>{details(row)}</td></tr> : null}
      </Fragment>)}</tbody>
    </table>
  </div>;
}

const PlayerLink = ({ row, nameKey = "name" }) => row.slug
  ? <Link href={`/players/${row.slug}`}>{row[nameKey]}</Link>
  : <strong>{row[nameKey]}</strong>;

function Section({ eyebrow, title, copy, children }) {
  return <section className={styles.section}>
    <header><span>{eyebrow}</span><h2>{title}</h2>{copy ? <p>{copy}</p> : null}</header>
    {children}
  </section>;
}

export default function DraftAnalyticsView({ analytics }) {
  const s = analytics.summary;
  const playerColumns = [
    { key: "name", label: "Player", render: (row) => <PlayerLink row={row} /> },
    { key: "draftsParticipated", label: "Drafts" },
    { key: "averageDraftPosition", label: "Avg. Pick" },
    { key: "highestDraftPosition", label: "Highest" },
    { key: "lowestDraftPosition", label: "Lowest" },
    { key: "firstOverallSelections", label: "#1 Picks" },
    { key: "topFiveSelections", label: "Top 5" },
    { key: "lateRoundSelections", label: "Late" },
    { key: "averageTeamFinish", label: "Avg. Team Finish" },
    { key: "championshipsWon", label: "Titles" },
    { key: "individualChampionships", label: "Individual Titles" },
    { key: "careerDvs", label: "Career DVS", render: (row) => <b>{signed(row.careerDvs)}</b> },
  ];
  const resultColumns = [
    { key: "player", label: "Player", render: (row) => <PlayerLink row={row} nameKey="player" /> },
    { key: "year", label: "Year" },
    { key: "pick", label: "Draft Position", render: (row) => `#${row.pick}` },
    { key: "finish", label: "Tournament Finish", render: (row) => Number.isFinite(row.finish) ? `#${row.finish}` : "—" },
    { key: "dvs", label: "DVS", render: (row) => <b>{signed(row.dvs)}</b> },
  ];

  return <>
    <section className={styles.hero}>
      <p>SBI Draft History</p>
      <h1>Historical Draft Analytics</h1>
      <span>Every selection, captain, draft class, and value swing across Sandbagger Invitational history.</span>
    </section>
    <div className={styles.shell}>
      <div className={styles.summaryGrid}>
        {[
          ["Drafts Recorded", s.draftsRecorded],
          ["Players Drafted", s.playersDrafted],
          ["Unique Golfers", s.uniqueGolfers],
          ["Captains", s.captains],
          ["Average Draft Size", `${s.averageDraftSize} Picks`],
        ].map(([label, metric]) => <article key={label}><span>{label}</span><strong>{metric}</strong></article>)}
      </div>

      <Section eyebrow="Lifetime Records" title="Career Draft Statistics" copy="Player records expand automatically with every completed SBI Draft. Open a row to see the golfer's full selection timeline.">
        <SortableTable
          columns={playerColumns}
          rows={analytics.players}
          initialKey="careerDvs"
          details={(row) => <details><summary>View {row.name}'s Draft History</summary><div className={styles.timeline}>
            {row.drafts.map((draft) => <article key={draft.year}><b>{draft.year}</b><span>Pick #{draft.pick}</span><strong>{draft.team}</strong><small>{Number.isFinite(draft.finish) ? `Finished #${draft.finish} · ${signed(draft.dvs)} DVS` : "Tournament result pending"}</small></article>)}
          </div></details>}
        />
      </Section>

      <Section eyebrow="Captain Board" title="Captain Draft Records">
        <div className={styles.captainGrid}>{analytics.captains.map((captain) => <article key={captain.id || captain.name}>
          <span>{captain.slug ? <Link href={`/players/${captain.slug}`}>{captain.name}</Link> : captain.name}</span>
          <dl>
            <div><dt>Draft Wins</dt><dd>{captain.draftWins}</dd></div>
            <div><dt>Average Grade</dt><dd>{captain.averageDraftGrade}</dd></div>
            <div><dt>Average Draft Score</dt><dd>{captain.averageDraftScore}</dd></div>
            <div><dt>Draft Championships</dt><dd>{captain.draftChampionships}</dd></div>
            <div><dt>Best Draft</dt><dd>{captain.bestDraft || "—"}</dd></div>
          </dl>
        </article>)}</div>
      </Section>

      <Section eyebrow="All-Time Board" title="Best Draft Classes">
        <SortableTable columns={[
          { key: "year", label: "Year" },
          { key: "captain", label: "Captain" },
          { key: "team", label: "Team" },
          { key: "score", label: "Draft Score" },
          { key: "teamFinish", label: "Final Team Finish", render: (row) => Number.isFinite(row.teamFinish) ? `#${row.teamFinish}` : "Pending" },
          { key: "grade", label: "Grade" },
        ]} rows={analytics.classes} initialKey="score" />
      </Section>

      <div className={styles.split}>
        <Section eyebrow="Positive DVS" title="Greatest Steals Ever">
          <SortableTable columns={resultColumns} rows={analytics.steals.slice(0, 25)} initialKey="dvs" />
        </Section>
        <Section eyebrow="Negative DVS" title="Biggest Reaches Ever">
          <SortableTable columns={resultColumns} rows={analytics.reaches.slice(0, 25)} initialKey="dvs" />
        </Section>
      </div>

      <Section eyebrow="Selection vs. Result" title="Draft Position vs Tournament Finish">
        <SortableTable columns={resultColumns} rows={analytics.draftRows.filter((row) => Number.isFinite(row.finish))} initialKey="dvs" />
      </Section>

      <div className={styles.split}>
        <Section eyebrow="Opening Selections" title="First Overall Picks">
          <SortableTable columns={[
            { key: "year", label: "Year" },
            { key: "player", label: "Player", render: (row) => <PlayerLink row={row} nameKey="player" /> },
            { key: "captain", label: "Captain" },
            { key: "finish", label: "Final Finish", render: (row) => Number.isFinite(row.finish) ? `#${row.finish}` : "Pending" },
            { key: "teamFinish", label: "Team Finish", render: (row) => Number.isFinite(row.teamFinish) ? `#${row.teamFinish}` : "Pending" },
            { key: "draftGrade", label: "Draft Grade" },
            { key: "dvs", label: "DVS", render: (row) => signed(row.dvs) },
          ]} rows={analytics.firstOverall} initialKey="year" />
        </Section>
        <Section eyebrow="Minimum Two Drafts" title="Average Draft Position">
          <SortableTable columns={[
            { key: "name", label: "Player", render: (row) => <PlayerLink row={row} /> },
            { key: "draftsParticipated", label: "Drafts" },
            { key: "averageDraftPosition", label: "Average Draft Position" },
          ]} rows={analytics.averageDraftPosition} initialKey="averageDraftPosition" />
        </Section>
      </div>

      {analytics.hallOfFame.length ? <Section eyebrow="Permanent Records" title="Draft Hall of Fame">
        <div className={styles.hallGrid}>{analytics.hallOfFame.map((award) => <article key={award.title}><i>{award.icon}</i><span>{award.title}</span><strong>{award.subject}</strong><small>{award.detail}</small></article>)}</div>
      </Section> : null}

      {analytics.trends.length ? <Section eyebrow="Minimum Three Drafts" title="Historical Trends">
        <div className={styles.trends}>{analytics.trends.map((trend) => <p key={trend}>{trend}</p>)}</div>
      </Section> : null}

      <section className={styles.analyst}>
        <span>SBI Historical Draft Analyst</span>
        <h2>Historical Draft Review</h2>
        <DraftAnalyticsSummary analytics={analytics} styles={styles} />
      </section>
    </div>
  </>;
}
