import { completedHistoryFingerprint } from "./completed-history-contract.js";

const clean = (value) => String(value ?? "").trim();
const emptyRecord = () => ({ wins: 0, losses: 0, halves: 0, matches: 0, points: 0, recordedPointMatches: 0 });

function addOutcome(record, outcome, points) {
  record.matches += 1;
  if (points !== null && points !== undefined && Number.isFinite(Number(points))) {
    record.points += Number(points);
    record.recordedPointMatches += 1;
  }
  if (outcome === "WIN") record.wins += 1;
  else if (outcome === "LOSS") record.losses += 1;
  else record.halves += 1;
}

function outcomeForSide(match, side) {
  if (match.winner_side === "HALVED") return "HALF";
  return match.winner_side === `TEAM_${side}` ? "WIN" : "LOSS";
}

function individualPoints(match, side, participants) {
  const value = side === 1 ? match.team_1_points : match.team_2_points;
  if (value === null || value === undefined) return null;
  if (match.format === "SI") return Number(value);
  const count = participants.filter((row) => Number(row.team_side) === side).length;
  return count ? Number(value) / count : null;
}

function recordRow(map, key) {
  if (!map.has(key)) map.set(key, emptyRecord());
  return map.get(key);
}

function roundedRecord(record) {
  return { ...record, points: Math.round(record.points * 1e9) / 1e9 };
}

function sortedObject(map, mapValue = (value) => value) {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, mapValue(value)]));
}

function canonicalChronology(payloads) {
  return [...payloads].sort((left, right) => Number(left.source_year) - Number(right.source_year)).flatMap((payload) => {
    const participantMap = new Map();
    for (const participant of payload.match_participants || []) {
      if (!participantMap.has(participant.match_id)) participantMap.set(participant.match_id, []);
      participantMap.get(participant.match_id).push(participant);
    }
    const eligibility = new Map((payload.record_eligibility || []).map((row) => [`${row.match_id}|${row.player_id}`, row.include_official_record !== false]));
    return (payload.matches || []).map((match) => ({
      year: Number(payload.source_year),
      match,
      participants: (participantMap.get(match.match_id) || []).sort((left, right) => Number(left.team_side) - Number(right.team_side) || Number(left.player_slot) - Number(right.player_slot)),
      eligibility,
    }));
  }).sort((left, right) => left.year - right.year || Number(left.match.round_number) - Number(right.match.round_number) || Number(left.match.match_number) - Number(right.match.match_number));
}

function buildRatings(playerIds, chronology) {
  const state = new Map(playerIds.map((playerId) => [playerId, { rating: 1500, peak: 1500, matches: 0, chronology: [] }]));
  let currentYear = null;
  const snapshot = (year) => {
    if (!year) return;
    for (const row of state.values()) if (row.matches) row.chronology.push({ year, rating: Math.round(row.rating) });
  };
  for (const entry of chronology) {
    if (currentYear !== null && entry.year !== currentYear) snapshot(currentYear);
    currentYear = entry.year;
    const one = entry.participants.filter((row) => Number(row.team_side) === 1).map((row) => row.player_id);
    const two = entry.participants.filter((row) => Number(row.team_side) === 2).map((row) => row.player_id);
    if (!one.length || !two.length || one.some((id) => !state.has(id)) || two.some((id) => !state.has(id))) continue;
    const average = (ids) => ids.reduce((sum, id) => sum + state.get(id).rating, 0) / ids.length;
    const expected = 1 / (1 + (10 ** ((average(two) - average(one)) / 400)));
    const result = entry.match.winner_side === "HALVED" ? 0.5 : entry.match.winner_side === "TEAM_1" ? 1 : 0;
    const delta = 24 * (Number(entry.match.round_number) === 3 ? 1.1 : 1) * (result - expected);
    for (const [ids, change] of [[one, delta], [two, -delta]]) {
      for (const playerId of ids) {
        if (entry.eligibility.get(`${entry.match.match_id}|${playerId}`) === false) continue;
        const row = state.get(playerId);
        row.rating += change;
        row.peak = Math.max(row.peak, row.rating);
        row.matches += 1;
      }
    }
  }
  snapshot(currentYear);
  return sortedObject(new Map([...state].filter(([, row]) => row.matches).map(([id, row]) => [id, {
    rating: Math.round(row.rating),
    peak: Math.round(row.peak),
    matches: row.matches,
    chronology: row.chronology,
  }])));
}

function tiedLeaders(playerRows, field, direction = "desc") {
  const values = Object.values(playerRows).map((row) => Number(field(row))).filter(Number.isFinite);
  if (!values.length) return [];
  const target = direction === "asc" ? Math.min(...values) : Math.max(...values);
  return Object.entries(playerRows).filter(([, row]) => Number(field(row)) === target).map(([id]) => id).sort();
}

/**
 * YEAR reads expose normalized, revision-scoped database facts. Convert that
 * DTO into the same minimal canonical fact shape used by the deterministic
 * shadow calculators. This is deliberately mechanical: it does not infer or
 * recalculate match outcomes, points, identities, or eligibility.
 */
export function completedHistoryYearReadToShadowPayload(readResult = {}) {
  const data = readResult?.data || readResult;
  const tournament = data?.tournament || {};
  const revision = data?.revision || {};
  const year = Number(revision.tournament_year ?? tournament.tournament_year);
  if (!Number.isInteger(year)) throw new Error("A certified completed-History YEAR read is required.");
  const roster = Array.isArray(data.roster) ? data.roster : [];
  const teams = Array.isArray(data.teams) ? data.teams : [];
  const championTeamId = clean(tournament.champion_team_id) || null;
  const runnerUpTeamId = clean(tournament.source_payload?.runner_up_team_id) ||
    teams.find((team) => clean(team.team_id) !== championTeamId)?.team_id || null;
  const winnerSide = (value) => value === "Team 1" ? "TEAM_1"
    : value === "Team 2" ? "TEAM_2"
    : value === "Halved" ? "HALVED"
    : null;
  return {
    source_year: year,
    players: [...new Map(roster.map((row) => [clean(row.player_id), {
      player_id: clean(row.player_id),
      display_name: clean(row.display_name),
    }])).values()].filter((row) => row.player_id),
    tournament: {
      result: {
        champion_team_id: championTeamId,
        runner_up_team_id: clean(runnerUpTeamId) || null,
        team_1_points: tournament.official_team_1_points ?? null,
        team_2_points: tournament.official_team_2_points ?? null,
      },
    },
    teams: teams.map((team) => ({
      team_id: clean(team.team_id),
      team_side: Number(team.team_side),
      name: clean(team.name),
    })),
    roster: roster.map((row) => ({
      player_id: clean(row.player_id),
      team_id: clean(row.team_id),
      team_side: Number(row.team_side),
      tournament_handicap: row.tournament_handicap ?? null,
    })),
    matches: (data.matches || []).map((match) => ({
      match_id: clean(match.match_id),
      round_number: Number(match.round_number),
      match_number: Number(match.source_payload?.match_number ?? 0),
      format: clean(match.format),
      winner_side: winnerSide(match.result_winner),
      team_1_points: match.team_1_points ?? null,
      team_2_points: match.team_2_points ?? null,
    })),
    match_participants: (data.match_participants || []).map((row) => ({
      match_id: clean(row.match_id),
      player_id: clean(row.player_id),
      team_side: Number(row.team_side),
      player_slot: Number(row.player_slot),
    })),
    record_eligibility: (data.record_eligibility || []).map((row) => ({
      match_id: clean(row.match_id),
      player_id: clean(row.player_id),
      include_official_record: row.is_record_eligible !== false,
    })),
    awards: (data.awards || []).map((row) => ({
      award_id: clean(row.award_id),
      winner_player_id: clean(row.winner_player_id) || null,
    })),
  };
}

export function buildCompletedHistoryDerivedShadow(payloads = []) {
  const ordered = [...payloads].sort((left, right) => Number(left.source_year) - Number(right.source_year));
  const players = new Map();
  const appearances = new Map();
  const championships = new Map();
  const awards = new Map();
  for (const payload of ordered) {
    for (const player of payload.players || []) if (!players.has(player.player_id)) players.set(player.player_id, player.display_name);
    const championTeamId = payload.tournament?.result?.champion_team_id;
    for (const roster of payload.roster || []) {
      if (!appearances.has(roster.player_id)) appearances.set(roster.player_id, []);
      appearances.get(roster.player_id).push(Number(payload.source_year));
      if (roster.team_id === championTeamId) {
        if (!championships.has(roster.player_id)) championships.set(roster.player_id, []);
        championships.get(roster.player_id).push(Number(payload.source_year));
      }
    }
    for (const award of payload.awards || []) {
      if (!award.winner_player_id) continue;
      if (!awards.has(award.winner_player_id)) awards.set(award.winner_player_id, []);
      awards.get(award.winner_player_id).push({ year: Number(payload.source_year), awardId: award.award_id });
    }
  }

  const chronology = canonicalChronology(ordered);
  const playerRecords = new Map([...players].map(([id]) => [id, emptyRecord()]));
  const partnerships = new Map();
  const rivalries = new Map();
  for (const entry of chronology) {
    for (const side of [1, 2]) {
      const sideRows = entry.participants.filter((row) => Number(row.team_side) === side);
      for (const participant of sideRows) {
        if (entry.eligibility.get(`${entry.match.match_id}|${participant.player_id}`) === false) continue;
        const record = playerRecords.get(participant.player_id);
        if (!record) throw new Error(`Derived History participant ${participant.player_id} has no stable player identity.`);
        addOutcome(record, outcomeForSide(entry.match, side), individualPoints(entry.match, side, entry.participants));
      }
      if (sideRows.length === 2 && sideRows.every((participant) => entry.eligibility.get(`${entry.match.match_id}|${participant.player_id}`) !== false)) {
        const key = sideRows.map((row) => row.player_id).sort().join("|");
        addOutcome(recordRow(partnerships, key), outcomeForSide(entry.match, side), individualPoints(entry.match, side, entry.participants));
      }
    }
    const one = entry.participants.filter((row) => Number(row.team_side) === 1);
    const two = entry.participants.filter((row) => Number(row.team_side) === 2);
    for (const left of one) for (const right of two) {
      if (entry.eligibility.get(`${entry.match.match_id}|${left.player_id}`) === false || entry.eligibility.get(`${entry.match.match_id}|${right.player_id}`) === false) continue;
      const [first, second] = [left.player_id, right.player_id].sort();
      const key = `${first}|${second}`;
      if (!rivalries.has(key)) rivalries.set(key, { playerOneWins: 0, playerTwoWins: 0, halves: 0, meetings: 0 });
      const row = rivalries.get(key);
      row.meetings += 1;
      if (entry.match.winner_side === "HALVED") row.halves += 1;
      else {
        const winnerIds = entry.match.winner_side === "TEAM_1" ? one.map((item) => item.player_id) : two.map((item) => item.player_id);
        if (winnerIds.includes(first)) row.playerOneWins += 1;
        if (winnerIds.includes(second)) row.playerTwoWins += 1;
      }
    }
  }

  const playerRows = Object.fromEntries([...players].sort(([left], [right]) => left.localeCompare(right)).map(([playerId, displayName]) => [playerId, {
    displayName,
    appearances: [...(appearances.get(playerId) || [])].sort(),
    championships: [...(championships.get(playerId) || [])].sort(),
    awards: [...(awards.get(playerId) || [])].sort((left, right) => left.year - right.year || left.awardId.localeCompare(right.awardId)),
    record: roundedRecord(playerRecords.get(playerId)),
  }]));
  const teamRecords = Object.fromEntries(ordered.map((payload) => {
    const records = { 1: emptyRecord(), 2: emptyRecord() };
    for (const match of payload.matches || []) for (const side of [1, 2]) {
      addOutcome(records[side], outcomeForSide(match, side), side === 1 ? match.team_1_points : match.team_2_points);
    }
    return [String(payload.source_year), {
      championTeamId: payload.tournament?.result?.champion_team_id || null,
      runnerUpTeamId: payload.tournament?.result?.runner_up_team_id || null,
      team1Points: payload.tournament?.result?.team_1_points ?? null,
      team2Points: payload.tournament?.result?.team_2_points ?? null,
      team1Record: roundedRecord(records[1]),
      team2Record: roundedRecord(records[2]),
      matches: payload.matches?.length || 0,
    }];
  }));
  const ratings = buildRatings([...players.keys()], chronology);
  const result = {
    years: ordered.map((payload) => Number(payload.source_year)),
    totals: {
      tournaments: ordered.length,
      players: players.size,
      appearances: [...appearances.values()].reduce((sum, years) => sum + years.length, 0),
      matches: chronology.length,
      participantMatchFacts: chronology.reduce((sum, entry) => sum + entry.participants.length, 0),
      recordExclusions: ordered.flatMap((payload) => payload.record_eligibility || []).filter((row) => row.include_official_record === false).length,
      partnerships: partnerships.size,
      rivalries: rivalries.size,
    },
    players: playerRows,
    teams: teamRecords,
    partnerships: sortedObject(partnerships, roundedRecord),
    rivalries: sortedObject(rivalries),
    ratings,
    recordHolders: {
      appearances: tiedLeaders(playerRows, (row) => row.appearances.length),
      wins: tiedLeaders(playerRows, (row) => row.record.wins),
      losses: tiedLeaders(playerRows, (row) => row.record.losses),
      halves: tiedLeaders(playerRows, (row) => row.record.halves),
      points: tiedLeaders(playerRows, (row) => row.record.points),
      championships: tiedLeaders(playerRows, (row) => row.championships.length),
    },
  };
  return { ...result, fingerprint: completedHistoryFingerprint(result) };
}

export function compareCompletedHistoryDerivedShadows(expected = {}, actual = {}) {
  const sections = ["totals", "players", "teams", "partnerships", "rivalries", "ratings", "recordHolders"];
  const differences = sections.filter((section) => completedHistoryFingerprint(expected?.[section]) !== completedHistoryFingerprint(actual?.[section]));
  return {
    pass: differences.length === 0,
    differences,
    expectedFingerprint: clean(expected.fingerprint) || completedHistoryFingerprint(Object.fromEntries(sections.map((section) => [section, expected?.[section]]))),
    actualFingerprint: clean(actual.fingerprint) || completedHistoryFingerprint(Object.fromEntries(sections.map((section) => [section, actual?.[section]]))),
  };
}
