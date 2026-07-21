"use client";

import { useMemo, useState } from "react";
import styles from "./compare.module.css";

const formatRecord = (record) =>
  `${record.wins}-${record.losses}-${record.halves}`;

const formatPct = (value) => `${value.toFixed(1)}%`;

function validPlayerId(players, requestedId) {
  return players.some((player) => player.id === requestedId)
    ? requestedId
    : "";
}

export default function CompareTool({
  players,
  headToHead,
  initialPlayerOne = "",
  initialPlayerTwo = "",
}) {
  const requestedOne = validPlayerId(
    players,
    initialPlayerOne
  );

  const requestedTwo = validPlayerId(
    players,
    initialPlayerTwo
  );

  const defaultOne = requestedOne || players[0]?.id || "";

  const defaultTwo =
    requestedTwo && requestedTwo !== defaultOne
      ? requestedTwo
      : players.find((player) => player.id !== defaultOne)?.id || "";

  const [oneId, setOneId] = useState(defaultOne);
  const [twoId, setTwoId] = useState(defaultTwo);

  const one = players.find((player) => player.id === oneId);
  const two = players.find((player) => player.id === twoId);

  const key = [oneId, twoId].sort().join("|");
  const raw = headToHead[key];

  const h2h = useMemo(() => {
    if (!raw || oneId < twoId) return raw;

    const flip = (record) => ({
      ...record,
      wins: record.losses,
      losses: record.wins,
    });

    return {
      ...raw,
      overall: flip(raw.overall),
      byFormat: Object.fromEntries(
        Object.entries(raw.byFormat).map(([format, record]) => [
          format,
          flip(record),
        ])
      ),
    };
  }, [raw, oneId, twoId]);

  function changePlayerOne(value) {
    setOneId(value);

    if (value === twoId) {
      const replacement = players.find(
        (player) => player.id !== value
      );
      setTwoId(replacement?.id ?? "");
    }
  }

  function changePlayerTwo(value) {
    setTwoId(value);

    if (value === oneId) {
      const replacement = players.find(
        (player) => player.id !== value
      );
      setOneId(replacement?.id ?? "");
    }
  }

  return (
    <>
      <section className={styles.hero}>
        <p>HEAD TO HEAD</p>
        <h1>Compare Sandbaggers</h1>
        <span>
          Select any two Sandbaggers and compare careers and direct
          meetings.
        </span>
      </section>

      <section className={styles.content}>
        <div className={styles.selectors}>
          <label>
            Player One
            <select
              value={oneId}
              onChange={(event) =>
                changePlayerOne(event.target.value)
              }
            >
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <b>VS</b>

          <label>
            Player Two
            <select
              value={twoId}
              onChange={(event) =>
                changePlayerTwo(event.target.value)
              }
            >
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {one && two && one.id !== two.id ? (
          <>
            <div className={styles.names}>
              <h2>{one.name}</h2>
              <span>Career Comparison</span>
              <h2>{two.name}</h2>
            </div>

            <div className={styles.comparisonGrid}>
              {[
                ["Sandbagger Rating", one.rating, two.rating],
                [
                  "Career Record",
                  formatRecord(one.record),
                  formatRecord(two.record),
                ],
                [
                  "Point Win %",
                  formatPct(one.percentage),
                  formatPct(two.percentage),
                ],
                ["Career Points", one.points, two.points],
                [
                  "Bagger Championships",
                  one.championships,
                  two.championships,
                ],
                [
                  "Tracked Appearances",
                  one.appearances,
                  two.appearances,
                ],
              ].map(([label, firstValue, secondValue]) => (
                <div className={styles.statRow} key={label}>
                  <strong>{firstValue}</strong>
                  <span>{label}</span>
                  <strong>{secondValue}</strong>
                </div>
              ))}
            </div>

            <div className={styles.h2hCard}>
              <span>DIRECT HEAD TO HEAD</span>

              <h2>
                {h2h?.overall.matches
                  ? formatRecord(h2h.overall)
                  : "No direct meetings"}
              </h2>

              <p>
                Record shown from {one.name}&apos;s perspective.
              </p>

              {h2h?.overall.matches ? (
                <div className={styles.formatRows}>
                  {[
                    ["2v2 Best Ball", "BB"],
                    ["Scramble", "SC"],
                    ["Singles", "SI"],
                  ].map(([label, format]) => (
                    <div key={format}>
                      <span>{label}</span>
                      <strong>
                        {formatRecord(h2h.byFormat[format])}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className={styles.empty}>
            Choose two different players.
          </div>
        )}
      </section>
    </>
  );
}
