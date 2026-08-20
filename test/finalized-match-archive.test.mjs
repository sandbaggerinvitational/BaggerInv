import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFinalizedMatchArchiveSnapshot,
  FINALIZED_MATCH_ARCHIVE_HEADERS,
} from "../lib/finalized-match-archive.js";

const liveMatch = {
  "Match ID": "2026-R1-5",
  Year: "2026",
  Round: "1",
  Match: "5",
  Format: "BB",
  "Team 1 Player 1": "CB01",
  "Team 1 Player 2": "MS01",
  "Team 2 Player 1": "WO01",
  "Team 2 Player 2": "PN01",
  "Team 1 Player 1 Playing HCP": "'12.8",
  "Team 1 Player 2 Playing Handicap": "8",
  "Team 2 Player 1 Playing HCP": "'-1.5",
  "Team 2 Player 2 Playing HCP": "10",
  "Team 1 Player 1 Stroke": "9",
  "Team 1 Player 2 Strokes Received": "4",
  "Team 2 Player 1 Stroke": "0",
  "Team 2 Player 2 Stroke": "6",
  "Course ID": "TP",
  "Tee Played": "Gold",
  "Tee Time": "8:10 AM",
  "Starting Hole": "1",
  "Matchup Winner": "Team 1",
  "18-Hole Winner": "Team 1",
  "Team 1 Points": "2",
  "Team 2 Points": "1",
  Notes: "The Pickles won 2 & 1",
};

const players = [
  { "Player ID": "CB01", "Display Name": "Clay Beltran" },
  { "Player ID": "MS01", "Display Name": "Matthew Smith" },
  { "Player ID": "WO01", "Display Name": "Will Oliver" },
  { "Player ID": "PN01", "Display Name": "Patrick Noonan" },
];

test("finalized archive snapshot is self-contained", () => {
  const snapshot = buildFinalizedMatchArchiveSnapshot({
    live: liveMatch,
    players,
    courses: [{ "Course ID": "TP", "Course Name": "Turtle Point Golf Course" }],
    finalResult: "The Pickles 2 & 1",
    finalizedAt: "2026-07-30T14:00:00.000Z",
    finalizedBy: "Clay",
  });

  assert.equal(snapshot["Match ID"], "2026-R1-5");
  assert.equal(snapshot["Match Number"], "5");
  assert.equal(snapshot["Team 1 Player Names"], "Clay Beltran / Matthew Smith");
  assert.equal(snapshot["Team 2 Player Names"], "Will Oliver / Patrick Noonan");
  assert.equal(snapshot["Team 1 Player 1 Playing HCP"], 12.8);
  assert.equal(snapshot["Team 1 Player 2 Playing HCP"], 8);
  assert.equal(snapshot["Team 2 Player 1 Playing HCP"], -1.5);
  assert.equal(snapshot["Team 1 Player 2 Stroke"], 4);
  assert.equal(snapshot["Team 2 Player 1 Stroke"], 0);
  assert.equal(snapshot.Course, "Turtle Point Golf Course");
  assert.equal(snapshot.Tee, "Gold");
  assert.equal(snapshot["Tee Time"], "8:10 AM");
  assert.equal(snapshot["Starting Hole"], "1");
  assert.equal(snapshot["Final Result"], "The Pickles 2 & 1");
  assert.equal(snapshot.Winner, "Team 1");
  assert.equal(snapshot["Match Status"], "Final");
  assert.equal(snapshot["Team 1 Points"], "2");
  assert.equal(snapshot.Notes, "The Pickles won 2 & 1");
  assert.equal(snapshot["Completed At"], "2026-07-30T14:00:00.000Z");
  assert.equal(snapshot["Finalized At"], "2026-07-30T14:00:00.000Z");
  assert.equal(snapshot["Finalized By"], "Clay");
});

test("re-finalization retains historical metadata when a live source field is blank", () => {
  const snapshot = buildFinalizedMatchArchiveSnapshot({
    live: { ...liveMatch, "Tee Time": "", "Starting Hole": "", "Team 1 Player 1 Playing HCP": "" },
    previous: {
      "Tee Time": "8:10 AM",
      "Starting Hole": "1",
      "Team 1 Player 1 Playing HCP": "13",
      "Completed At": "2026-07-30T13:55:00.000Z",
    },
    players,
    finalizedAt: "2026-07-30T14:05:00.000Z",
    finalizedBy: "Admin",
  });
  assert.equal(snapshot["Tee Time"], "8:10 AM");
  assert.equal(snapshot["Starting Hole"], "1");
  assert.equal(snapshot["Team 1 Player 1 Playing HCP"], 13);
  assert.equal(snapshot["Completed At"], "2026-07-30T13:55:00.000Z");
  assert.equal(snapshot["Finalized At"], "2026-07-30T14:05:00.000Z");
});

test("archive schema contains identity, competition, result, and audit fields", () => {
  for (const field of [
    "Match ID", "Year", "Round", "Match Number", "Format",
    "Team 1 Player 1", "Team 2 Player 2", "Team 1 Player Names", "Team 2 Player Names",
    "Team 1 Player 1 Playing HCP", "Team 2 Player 2 Stroke",
    "Course", "Tee", "Tee Time", "Starting Hole",
    "Match Status", "Final Result", "Winner", "Team 1 Points", "Team 2 Points", "Notes",
    "Completed At", "Finalized At", "Finalized By",
  ]) assert.ok(FINALIZED_MATCH_ARCHIVE_HEADERS.includes(field), field);
});

test("finalization writes only approved archive fields and preserves formula-owned Match ID", async () => {
  const source = await readFile(new URL("../lib/google-sheets-write.js", import.meta.url), "utf8");
  assert.match(source, /requireTabHeaders\("Matches", FINALIZED_MATCH_ARCHIVE_HEADERS\)/);
  assert.match(source, /buildFinalizedMatchArchiveSnapshot\(/);
  assert.match(source, /writableFields\("Matches"\)/);
  assert.match(source, /requires a workbook-generated Match ID row/);
  assert.doesNotMatch(source, /appendSheetFields\("Matches"/);
});

test("Admin refreshes its draft from the authoritative returned Match Status", async () => {
  const source = await readFile(new URL("../app/admin/live-matches/LiveMatchControl.js", import.meta.url), "utf8");
  assert.match(source, /setDraft\(Object\.fromEntries\(\[\.\.\.EDITABLE, \.\.\.PAIRING_FIELDS\]/);
  assert.match(source, /\[match\["Updated At"\], match\["Match Status"\]\]/);
  assert.match(source, /data-status=\{match\["Match Status"\] \|\| "Scheduled"\}/);
  assert.match(source, /<StatusBadge status=\{formatStatusLabel\(match\["Match Status"\]\)\} \/>/);
  assert.match(source, /value=\{match\["Match Status"\] \|\| "Scheduled"\} readOnly/);
  assert.match(source, /run\("mark-live", \{\}\)/);
  assert.doesNotMatch(source, /onChange=\{\(event\) => change\("Match Status"/);
});
