"use client";

import { useMemo, useState } from "react";
import styles from "../historical.module.css";
import { addTournamentRanks } from "../../lib/rankings";
import { LeaderboardPlayer, LeaderboardRank } from "../TournamentLeaderboard";

function displayedValue(row, key) {
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
    return addTournamentRanks(sorted, sortKey);
  }, [rows, sortKey, direction]);

  function selectSort(key) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setDirection("desc");
  }

  return (
    <div className={styles.fullLeaderboardWrap}>
      <div className={styles.fullLeaderboard}>
        <div className={styles.fullLeaderboardHead}>
          <span>Rank</span>
          <button type="button" onClick={() => selectSort("name")}>
            Player
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
          <div className={styles.fullLeaderboardRow} key={row.id}>
            <LeaderboardRank rank={row.tournamentRank} />
            <LeaderboardPlayer name={row.name} slug={row.slug} photo={row.photo} />
            {columns.map((column) => (
              <span key={column.key}>
                {displayedValue(row, column.key)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
