"use client";

import Link from "next/link";
import AssetImage from "./AssetImage";
import { defaultAssets, playerPhoto } from "../lib/asset-paths";
import { formatPoints } from "../lib/formatters";
import styles from "./tournament-leaderboard.module.css";

function playerValue(row, field) {
  if (row?.player && typeof row.player === "object") return row.player[field];
  return null;
}

function normalizedRow(row) {
  return {
    id: row.id || playerValue(row, "Player ID") || row.name,
    rank: row.tournamentRank || row.rank || "—",
    name: row.name || (typeof row.player === "string" ? row.player : playerValue(row, "Display Name")) || row.id,
    slug: row.slug || playerValue(row, "slug") || "",
    photo: row.photo || playerValue(row, "Photo Filename") || "",
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    halves: Number(row.halves) || 0,
    points: Number(row.points) || 0,
  };
}

function podium(rank) {
  const place = Number(String(rank).replace(/\D/g, ""));
  if (place === 1) return { place, medal: "🥇" };
  if (place === 2) return { place, medal: "🥈" };
  if (place === 3) return { place, medal: "🥉" };
  return { place: 0, medal: "" };
}

export function LeaderboardRank({ rank }) {
  const { place, medal } = podium(rank);
  return <strong className={styles.rank} data-place={place || undefined} data-tied={String(rank).startsWith("T") ? "true" : "false"}>
    {medal ? <span aria-hidden="true">{medal}</span> : null}{rank}
  </strong>;
}

export function LeaderboardPlayer({ name, slug, photo, compact = false }) {
  const label = slug ? <Link href={`/players/${slug}`}>{name}</Link> : <strong>{name}</strong>;
  return <span className={styles.player} data-compact={compact ? "true" : undefined}>
    <span className={styles.avatar}>
      <AssetImage
        src={playerPhoto(photo) || defaultAssets.player}
        fallbackSrc={defaultAssets.player}
        inferFallback={false}
        alt={name}
        className={styles.avatarImage}
        fallbackClassName={styles.avatarFallback}
        fallback="SBI"
      />
    </span>
    {label}
  </span>;
}

export default function TournamentLeaderboard({ rows = [], pointsTracked = true, emptyMessage = "No completed matches have been recorded yet." }) {
  const normalized = rows.map(normalizedRow);
  return <div className={styles.table} data-points={pointsTracked ? "true" : "false"}>
    <div className={`${styles.row} ${styles.head}`}>
      <span>Rank</span><span>Player</span><span>Record</span>{pointsTracked ? <span>Points</span> : null}
    </div>
    {normalized.length ? normalized.map((row) => {
      const { place } = podium(row.rank);
      return <div className={styles.row} data-place={place || undefined} key={row.id}>
        <LeaderboardRank rank={row.rank} />
        <LeaderboardPlayer name={row.name} slug={row.slug} photo={row.photo} />
        <span className={styles.record}><b>{row.wins} W</b><i>•</i><b>{row.losses} L</b><i>•</i><b>{row.halves} T</b></span>
        {pointsTracked ? <strong className={styles.points}>{formatPoints(row.points)}</strong> : null}
      </div>;
    }) : <div className={styles.empty}>{emptyMessage}</div>}
  </div>;
}
