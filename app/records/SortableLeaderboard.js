"use client";

import { useMemo, useState } from "react";
import styles from "../historical.module.css";
import { addTournamentRanks } from "../../lib/rankings";
import { LeaderboardPlayer, LeaderboardRank } from "../TournamentLeaderboard";

function displayedValue(row, key) {
  if (key === "value") return row.valueDisplay ?? row.value;
  if (key === "percentage") return row.percentageDisplay;
  if (key === "averageHandicap") return row.averageHandicapDisplay;
  if (key === "formatPercentage") return row.formatPercentageDisplay;
  return row[key] ?? "—";
}

export default function SortableLeaderboard({
  rows,
  columns,
  initialSort,
  initialDirection = "desc",
  rankingKey = initialSort,
  rankingDirection = initialDirection,
  entityLabel = "Player",
  scorecard = false,
}) {
  const [sortKey, setSortKey] = useState(initialSort);
  const [direction, setDirection] = useState(initialDirection);

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const first = a[sortKey];
      const second = b[sortKey];

      if (typeof first === "number" && typeof second === "number") {
        return direction === "asc" ? first - second : second - first;
      }

      const comparison = String(first ?? "").localeCompare(
        String(second ?? ""),
        undefined,
        { numeric: true }
      );

      return direction === "asc" ? comparison : -comparison;
    });
    const rankedSource = [...rows].sort((a, b) => {
      const first = a[rankingKey];
      const second = b[rankingKey];
      if (typeof first === "number" && typeof second === "number") {
        return rankingDirection === "asc" ? first - second : second - first;
      }
      return String(first ?? "").localeCompare(String(second ?? ""), undefined, { numeric: true });
    });
    const ranks = new Map(addTournamentRanks(rankedSource, rankingKey).map((row) => [row.id, row.tournamentRank]));
    return sorted.map((row) => ({ ...row, tournamentRank: ranks.get(row.id) || "—" }));
  }, [rows, sortKey, direction, rankingKey, rankingDirection]);

  const gridStyle = scorecard
    ? { gridTemplateColumns: `70px minmax(210px, 1.5fr) repeat(${columns.length}, minmax(105px, .8fr))` }
    : undefined;

  function selectSort(key) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setDirection("desc");
  }

  return (
    <div className={styles.fullLeaderboardWrap} data-scorecard={scorecard ? "true" : undefined}>
      <div className={styles.fullLeaderboard}>
        <div className={styles.fullLeaderboardHead} style={gridStyle}>
          <span>Rank</span>
          <button type="button" onClick={() => selectSort("name")}>
            {entityLabel}
          </button>
          {columns.map((column) => (
            <button
              type="button"
              onClick={() => selectSort(column.key)}
              key={column.key}
            >
              {column.label}
              {sortKey === column.key
                ? direction === "desc"
                  ? " ↓"
                  : " ↑"
                : ""}
            </button>
          ))}
        </div>

        {sortedRows.map((row, index) => (
          <div className={styles.fullLeaderboardRow} style={gridStyle} key={row.id}>
            <LeaderboardRank rank={row.tournamentRank} />
            {scorecard ? (
              <span className={styles.scorecardEntity}>
                {row.entityType === "PLAYER"
                  ? <LeaderboardPlayer name={row.name} slug={row.slug} photo={row.photo} compact />
                  : <strong>{row.name}</strong>}
                {row.subtitle ? <small>{row.subtitle}</small> : null}
                <em>{[row.year, row.round, row.format, row.course].filter(Boolean).join(" · ")}</em>
              </span>
            ) : <LeaderboardPlayer name={row.name} slug={row.slug} photo={row.photo} />}
            {columns.map((column) => (
              <span
                className={column.key === "value" ? styles.scorecardValue : styles.scorecardContextCell}
                key={column.key}
              >
                {displayedValue(row, column.key)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
