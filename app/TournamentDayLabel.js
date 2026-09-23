"use client";
import { tournamentDayLabel } from "../lib/home-dashboard";
import useTournamentClock from "./useTournamentClock";

export default function TournamentDayLabel({ tournament, roundCount }) {
  const now = useTournamentClock();
  return tournamentDayLabel({ startDate: tournament.startDate, currentRound: tournament.currentRound,
    timeZone: tournament.timeZone, roundCount, now });
}
