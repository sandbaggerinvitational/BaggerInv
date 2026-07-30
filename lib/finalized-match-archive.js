import { parseNumericValue } from "./formatters.js";

const clean = (value) => String(value ?? "").trim();

const PLAYER_SLOTS = [[1, 1], [1, 2], [2, 1], [2, 2]];

export const FINALIZED_MATCH_ARCHIVE_HEADERS = [
  "Match ID", "Year", "Round", "Match", "Match Number", "Format",
  "Team 1 Player 1", "Team 1 Player 2", "Team 2 Player 1", "Team 2 Player 2",
  "Team 1 Player 1 Name", "Team 1 Player 2 Name", "Team 2 Player 1 Name", "Team 2 Player 2 Name",
  "Team 1 Player Names", "Team 2 Player Names",
  "Team 1 Player 1 Playing HCP", "Team 1 Player 2 Playing HCP",
  "Team 2 Player 1 Playing HCP", "Team 2 Player 2 Playing HCP",
  "Team 1 Player 1 Stroke", "Team 1 Player 2 Stroke",
  "Team 2 Player 1 Stroke", "Team 2 Player 2 Stroke",
  "Team 1 Playing HCP", "Team 2 Playing HCP", "Team 1 Stroke", "Team 2 Stroke",
  "Course ID", "Course", "Tee", "Tee Time", "Starting Hole",
  "Match Status", "Final Result", "Winner", "Matchup Winner",
  "Front 9 Winner", "Back 9 Winner", "18-Hole Winner",
  "Team 1 Points", "Team 2 Points", "Notes",
  "Completed At", "Finalized At", "Finalized By",
];

function firstPresent(record, fields) {
  for (const field of fields) {
    if (record[field] !== undefined && record[field] !== null && clean(record[field]) !== "") return record[field];
  }
  return "";
}

function retained(nextValue, previousValue) {
  return clean(nextValue) === "" && clean(previousValue) !== "" ? previousValue : nextValue;
}

function numericArchiveValue(nextValue, previousValue) {
  const source = retained(nextValue, previousValue);
  if (clean(source) === "") return "";
  return parseNumericValue(source) ?? "";
}

export function buildFinalizedMatchArchiveSnapshot({
  live = {},
  previous = {},
  players = [],
  courses = [],
  finalResult = "",
  finalizedAt,
  finalizedBy,
} = {}) {
  const snapshot = { ...previous };
  for (const header of FINALIZED_MATCH_ARCHIVE_HEADERS) {
    if (Object.hasOwn(live, header)) snapshot[header] = retained(live[header], previous[header]);
  }

  const playerNames = new Map(players.map((player) => [
    clean(player["Player ID"]),
    clean(player["Display Name"] || player.Name || player["Player ID"]),
  ]));
  for (const [side, slot] of PLAYER_SLOTS) {
    const prefix = `Team ${side} Player ${slot}`;
    const playerId = clean(firstPresent(live, [prefix, `${prefix} ID`]) || firstPresent(previous, [prefix, `${prefix} ID`]));
    const playerName = playerNames.get(playerId) || clean(previous[`${prefix} Name`]);
    snapshot[prefix] = retained(playerId, previous[prefix]);
    snapshot[`${prefix} Name`] = retained(playerName, previous[`${prefix} Name`]);
    snapshot[`${prefix} Playing HCP`] = numericArchiveValue(
      firstPresent(live, [`${prefix} Playing HCP`, `${prefix} Playing Handicap`]),
      previous[`${prefix} Playing HCP`]
    );
    snapshot[`${prefix} Stroke`] = numericArchiveValue(
      firstPresent(live, [`${prefix} Stroke`, `${prefix} Strokes Received`]),
      previous[`${prefix} Stroke`]
    );
  }

  for (const side of [1, 2]) {
    const names = [1, 2].map((slot) => clean(snapshot[`Team ${side} Player ${slot} Name`])).filter(Boolean);
    snapshot[`Team ${side} Player Names`] = names.length ? names.join(" / ") : retained("", previous[`Team ${side} Player Names`]);
    snapshot[`Team ${side} Playing HCP`] = numericArchiveValue(
      firstPresent(live, [`Team ${side} Playing HCP`, `Team ${side} Playing Handicap`]),
      previous[`Team ${side} Playing HCP`]
    );
    snapshot[`Team ${side} Stroke`] = numericArchiveValue(
      firstPresent(live, [`Team ${side} Stroke`, `Team ${side} Strokes Received`]),
      previous[`Team ${side} Stroke`]
    );
  }

  const courseId = clean(firstPresent(live, ["Course ID"]) || previous["Course ID"]);
  const course = courses.find((item) => clean(item["Course ID"]) === courseId) || {};
  snapshot["Match ID"] = clean(live["Match ID"] || previous["Match ID"]);
  snapshot.Year = retained(live.Year, previous.Year);
  snapshot.Round = retained(live.Round, previous.Round);
  snapshot.Match = retained(firstPresent(live, ["Match", "Match Number"]), previous.Match);
  snapshot["Match Number"] = retained(firstPresent(live, ["Match Number", "Match"]), previous["Match Number"]);
  snapshot.Format = retained(live.Format, previous.Format);
  snapshot["Course ID"] = retained(courseId, previous["Course ID"]);
  snapshot.Course = retained(
    firstPresent(live, ["Course", "Course Name"]) || firstPresent(course, ["Course", "Course Name", "Name"]),
    previous.Course
  );
  snapshot.Tee = retained(firstPresent(live, ["Tee", "Tee Played"]), previous.Tee);
  snapshot["Tee Time"] = retained(firstPresent(live, ["Tee Time"]), previous["Tee Time"]);
  snapshot["Starting Hole"] = retained(firstPresent(live, ["Starting Hole"]), previous["Starting Hole"]);
  snapshot["Match Status"] = "Final";
  snapshot["Final Result"] = retained(
    finalResult || firstPresent(live, ["Final Result", "Match Status Text", "Overall Result", "Match Result", "Notes"]),
    previous["Final Result"]
  );
  snapshot.Winner = retained(firstPresent(live, ["Winner", "18-Hole Winner", "Matchup Winner"]), previous.Winner);
  snapshot["Completed At"] = previous["Completed At"] || finalizedAt;
  snapshot["Finalized At"] = finalizedAt;
  snapshot["Finalized By"] = finalizedBy;
  return snapshot;
}
