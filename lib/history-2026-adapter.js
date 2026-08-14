import { createHash } from "node:crypto";

import { buildRoundScorecardsArchiveRows } from "./round-scorecards-archive.js";
import { buildScorecardAnalytics } from "./scorecard-analytics.js";

const HISTORY_YEAR = 2026;
const CURRENT = "CURRENT";
const VALID_FORMATS = new Set(["BB", "SC", "SI"]);

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const number = (value, fallback = null) => {
  if (value === null || value === undefined || clean(value) === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const integer = (value, fallback = null) => {
  const parsed = number(value, fallback);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};
const slugify = (value) => clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

function formatCode(value) {
  const valueUpper = upper(value);
  if (["BB", "BEST BALL", "BESTBALL", "2 VS 2"].includes(valueUpper)) return "BB";
  if (["SC", "SCRAMBLE", "2-MAN SCRAMBLE", "2 MAN SCRAMBLE"].includes(valueUpper)) return "SC";
  if (["SI", "SINGLES", "SINGLE"].includes(valueUpper)) return "SI";
  return valueUpper;
}

function formatName(value) {
  return ({ BB: "2v2 Best Ball", SC: "Scramble", SI: "Singles" })[formatCode(value)] || clean(value);
}

function matchRecordId(record = {}) {
  return clean(record?.match?.match_id || record?.match_id || record?.payload?.match?.match_id);
}

function matchLifecycle(record = {}) {
  return upper(record?.match?.status || record?.match?.lifecycle || record?.status || record?.lifecycle);
}

function snapshotState(snapshot = {}) {
  // State is part of the bounded RPC contract. Missing/ambiguous state must
  // fail closed rather than being promoted to participant-visible history.
  return upper(snapshot.state);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`The 2026 historical ${label} collection is unavailable.`);
  return value;
}

function currentMatchRevision(record = {}) {
  return integer(record?.match?.match_revision ?? record?.match_revision);
}

function currentScoringSnapshot(record = {}) {
  return record?.scoring_snapshot || {};
}

function canonicalParticipants(participants = []) {
  return [...participants].map((participant) => ({
    playerId: clean(participant.player_id),
    teamSide: integer(participant.team_side),
    playerSlot: integer(participant.player_slot),
    handicapIndex: number(participant.handicap_index),
    courseHandicap: number(participant.course_handicap),
    playingHandicap: number(participant.playing_handicap),
    finalStrokes: number(participant.final_strokes),
  })).sort((left, right) => left.teamSide - right.teamSide ||
    left.playerSlot - right.playerSlot || left.playerId.localeCompare(right.playerId));
}

function canonicalTeams(teams = []) {
  return [...teams].map((team) => ({
    teamId: clean(team.team_id),
    teamSide: integer(team.team_side),
  })).sort((left, right) => left.teamSide - right.teamSide ||
    left.teamId.localeCompare(right.teamId));
}

function sameContract(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateFinalizedSnapshot(record, snapshot, tournamentTeams = []) {
  const id = matchRecordId(record);
  const payload = snapshot?.payload || {};
  const payloadMatch = payload.match || {};
  const payloadCourse = payload.course || {};
  const matchRevision = currentMatchRevision(record);
  const snapshotMatchRevision = integer(snapshot?.match_revision);
  const payloadMatchRevision = integer(payloadMatch.match_revision);
  const scoring = currentScoringSnapshot(record);
  const currentScoringId = clean(record?.match?.scoring_snapshot_id || scoring.snapshot_id);
  const snapshotScoringId = clean(snapshot?.scoring_snapshot_id);
  const payloadScoringId = clean(payloadCourse.scoring_snapshot_id);
  const currentScoringRevision = integer(scoring.snapshot_revision);
  const snapshotScoringRevision = integer(snapshot?.scoring_snapshot_revision);
  const format = formatCode(payloadMatch.format || payload?.round?.format || record?.match?.format);

  if (clean(snapshot?.tournament_id || payload?.tournament?.tournament_id) !== String(HISTORY_YEAR)) {
    throw new Error(`Finalized snapshot ${id} is not scoped to tournament 2026.`);
  }
  if (matchRecordId(snapshot) !== id || clean(payloadMatch.match_id) !== id) {
    throw new Error(`Finalized snapshot identity is incoherent for ${id}.`);
  }
  if (upper(payloadMatch.status) !== "FINAL") {
    throw new Error(`Current finalized snapshot ${id} does not contain a FINAL payload.`);
  }
  if (matchRevision === null || snapshotMatchRevision !== matchRevision || payloadMatchRevision !== matchRevision) {
    throw new Error(`Finalized snapshot revision is incoherent for ${id}.`);
  }
  if (currentScoringId && (snapshotScoringId !== currentScoringId || payloadScoringId !== currentScoringId)) {
    throw new Error(`Finalized snapshot scoring revision is incoherent for ${id}.`);
  }
  if (currentScoringRevision !== null && snapshotScoringRevision !== null && snapshotScoringRevision !== currentScoringRevision) {
    throw new Error(`Finalized snapshot scoring revision is incoherent for ${id}.`);
  }
  if (format !== formatCode(record?.match?.format) ||
      format !== formatCode(payload?.round?.format) ||
      format !== formatCode(scoring.format) ||
      integer(payload?.round?.round_number) !== integer(record?.match?.round_number)) {
    throw new Error(`Finalized snapshot format/round context is incoherent for ${id}.`);
  }
  if (clean(payloadCourse.course_id) !== clean(scoring.course_id) ||
      clean(payloadCourse.tee) !== clean(scoring.tee) ||
      number(payloadCourse.rating) !== number(scoring.rating) ||
      integer(payloadCourse.slope) !== integer(scoring.slope) ||
      integer(payloadCourse.par) !== integer(scoring.par) ||
      integer(payloadCourse.scoring_snapshot_revision) !== currentScoringRevision ||
      clean(payloadCourse.configuration_fingerprint) !== clean(scoring.canonical_hash)) {
    throw new Error(`Finalized snapshot course/scoring configuration is incoherent for ${id}.`);
  }

  const holes = assertArray(payload.holes, `finalized holes for ${id}`);
  const holeNumbers = holes.map((hole) => integer(hole?.hole_number));
  if (holes.length !== 18 || new Set(holeNumbers).size !== 18 ||
      [...holeNumbers].sort((left, right) => left - right).some((hole, index) => hole !== index + 1)) {
    throw new Error(`Finalized snapshot ${id} must contain exactly 18 unique holes.`);
  }
  const configuredHoles = assertArray(scoring.hole_definitions, `canonical hole configuration for ${id}`);
  const holeContract = (values) => [...values].map((hole) => ({
    holeNumber: integer(hole.hole_number),
    par: integer(hole.par),
    strokeIndex: integer(hole.stroke_index),
    yardage: number(hole.yardage),
  })).sort((left, right) => left.holeNumber - right.holeNumber);
  if (!sameContract(holeContract(holes), holeContract(configuredHoles))) {
    throw new Error(`Finalized snapshot hole configuration is incoherent for ${id}.`);
  }
  if (payload?.result?.scorecard_complete !== true) {
    throw new Error(`Finalized snapshot ${id} is not scorecard complete.`);
  }

  const teams = assertArray(payload.teams, `finalized teams for ${id}`);
  if (teams.length !== 2 || new Set(teams.map((team) => clean(team.team_id))).size !== 2 ||
      teams.some((team) => !clean(team.team_id))) {
    throw new Error(`Finalized snapshot ${id} does not contain two canonical Team IDs.`);
  }
  if (tournamentTeams.length && !sameContract(canonicalTeams(teams), canonicalTeams(tournamentTeams))) {
    throw new Error(`Finalized snapshot Team ID mapping is incoherent for ${id}.`);
  }
  const participants = assertArray(payload.participants, `finalized participants for ${id}`);
  const expectedParticipants = format === "SI" ? 2 : 4;
  if (!VALID_FORMATS.has(format) || participants.length !== expectedParticipants ||
      new Set(participants.map((participant) => clean(participant.player_id))).size !== expectedParticipants) {
    throw new Error(`Finalized snapshot ${id} has an invalid format/participant contract.`);
  }
  if (!sameContract(canonicalParticipants(participants), canonicalParticipants(record.participants || []))) {
    throw new Error(`Finalized snapshot participant identity/configuration is incoherent for ${id}.`);
  }
  if (clean(payloadMatch.result_winner) !== clean(record?.match?.result_winner) ||
      clean(payloadMatch.running_result) !== clean(record?.match?.running_result)) {
    throw new Error(`Finalized snapshot match result is incoherent for ${id}.`);
  }
}

/**
 * Select the one coherent CURRENT finalized revision for every FINAL match.
 * Audit revisions remain in storage but cannot leak into participant history.
 */
export function selectCurrentFinalizedSnapshots(matches = [], finalizedSnapshots = [], tournamentTeams = []) {
  const matchRows = assertArray(matches, "matches");
  const snapshots = assertArray(finalizedSnapshots, "finalized snapshots");
  const matchesById = new Map();
  for (const record of matchRows) {
    const id = matchRecordId(record);
    if (!id) throw new Error("A canonical 2026 match is missing Match ID.");
    if (matchesById.has(id)) throw new Error(`Duplicate canonical match ${id}.`);
    matchesById.set(id, record);
  }

  const selected = new Map();
  for (const snapshot of snapshots) {
    if (snapshotState(snapshot) !== CURRENT) continue;
    const id = matchRecordId(snapshot);
    const record = matchesById.get(id);
    if (!record) throw new Error(`Current finalized snapshot ${id || "(blank)"} has no canonical match.`);
    if (matchLifecycle(record) !== "FINAL") {
      throw new Error(`LIVE/non-FINAL match ${id} cannot have a current finalized snapshot.`);
    }
    if (selected.has(id)) throw new Error(`Multiple duplicate CURRENT finalized snapshots exist for ${id}.`);
    validateFinalizedSnapshot(record, snapshot, tournamentTeams);
    selected.set(id, snapshot);
  }

  for (const record of matchRows) {
    const id = matchRecordId(record);
    if (matchLifecycle(record) === "FINAL" && !selected.has(id)) {
      throw new Error(`FINAL match ${id} does not have one coherent current finalized snapshot.`);
    }
  }
  return selected;
}

function canonical(value) {
  if (Array.isArray(value)) {
    return value
      .map(canonical)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function guideEnvelope(guideProjection = {}) {
  const root = guideProjection?.payload?.data || guideProjection?.data || guideProjection || {};
  const persisted = root?.content && typeof root.content === "object" ? root.content : root;
  const content = persisted?.content && typeof persisted.content === "object" ? persisted.content : persisted;
  return {
    content: content && typeof content === "object" ? content : {},
    revision: integer(
      root.projection_revision ?? root.revision ?? guideProjection?.revision,
      0
    ),
    fingerprint: clean(
      root.delivery_fingerprint || root.content_fingerprint ||
      guideProjection?.contentFingerprint || guideProjection?.content_fingerprint
    ),
  };
}

/**
 * Cache key for canonical state. Only identities/revisions/fingerprints enter
 * the key, and all logical collections are canonicalized as unordered sets.
 */
export function history2026SourceFingerprint(aggregate = {}, { guideProjection = {} } = {}) {
  const guide = guideEnvelope(guideProjection);
  const value = {
    schema: "preview-2026-history-adapter-v1",
    tournament: {
      id: clean(aggregate?.tournament?.tournament_id),
      year: integer(aggregate?.tournament?.tournament_year),
      authority: upper(aggregate?.tournament?.scoring_authority),
    },
    rounds: (aggregate.rounds || []).map((round) => ({
      number: integer(round.round_number),
      format: formatCode(round.format),
      name: clean(round.name),
    })),
    teams: (aggregate.teams || []).map((team) => ({
      id: clean(team.team_id),
      side: integer(team.team_side),
      name: clean(team.name),
    })),
    players: (aggregate.players || []).map((player) => ({
      id: clean(player.player_id),
      name: clean(player.display_name),
      teamId: clean(player.team_id),
      side: integer(player.team_side),
    })),
    matches: (aggregate.matches || []).map((record) => ({
      id: matchRecordId(record),
      lifecycle: matchLifecycle(record),
      revision: currentMatchRevision(record),
      scoringSnapshotId: clean(record?.match?.scoring_snapshot_id || record?.scoring_snapshot?.snapshot_id),
      scoringRevision: integer(record?.scoring_snapshot?.snapshot_revision),
      scoringFingerprint: clean(record?.scoring_snapshot?.canonical_hash),
      presentationFingerprint: clean(record?.presentation?.source_payload_hash),
      presentation: {
        displayMatchNumber: clean(record?.presentation?.display_match_number),
        matchSortOrder: integer(record?.presentation?.match_sort_order),
        teeTime: clean(record?.presentation?.tee_time),
        startingHole: clean(record?.presentation?.starting_hole),
        courseName: clean(record?.presentation?.course_name),
        courseLogo: clean(record?.presentation?.course_logo),
        team1Logo: clean(record?.presentation?.team_1_logo),
        team2Logo: clean(record?.presentation?.team_2_logo),
        tournamentLocation: clean(record?.presentation?.tournament_location),
        tournamentLogo: clean(record?.presentation?.tournament_logo),
      },
      participants: (record?.participants || []).map((participant) => ({
        id: clean(participant.player_id),
        side: integer(participant.team_side),
        slot: integer(participant.player_slot),
        strokes: number(participant.final_strokes),
      })),
    })),
    finalized: (aggregate.finalized_snapshots || []).map((snapshot) => ({
      id: matchRecordId(snapshot),
      state: snapshotState(snapshot),
      revision: integer(snapshot.snapshot_revision),
      matchRevision: integer(snapshot.match_revision),
      scoringSnapshotId: clean(snapshot.scoring_snapshot_id),
      scoringRevision: integer(snapshot.scoring_snapshot_revision),
      sourceFingerprint: clean(snapshot.source_fingerprint),
      payloadHash: clean(snapshot.payload_hash),
    })),
    presentationFingerprint: clean(
      aggregate?.tournament_presentation?.source_fingerprint ||
      aggregate?.home_presentation?.source_fingerprint
    ),
    guideRevision: guide.revision,
    guideFingerprint: guide.fingerprint,
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function presentationTournament(aggregate = {}) {
  const envelope = aggregate.tournament_presentation || aggregate.home_presentation || {};
  return envelope?.presentation?.tournament || envelope?.presentation || envelope || {};
}

function homePresentation(aggregate = {}) {
  const envelope = aggregate.tournament_presentation || aggregate.home_presentation || {};
  return envelope?.presentation && typeof envelope.presentation === "object"
    ? envelope.presentation
    : {};
}

function courseId(row = {}) {
  return clean(row.courseId || row.course_id || row["Course ID"] || row.id).toUpperCase();
}

function guideCourseRows(guideProjection = {}) {
  const guide = guideEnvelope(guideProjection);
  return Array.isArray(guide.content.courses) ? guide.content.courses : [];
}

function guideCourseFor(guideProjection, id, roundNumber) {
  const target = upper(id);
  const candidates = guideCourseRows(guideProjection).filter((row) => courseId(row) === target);
  return candidates.find((row) => {
    const directRound = integer(row.round ?? row.Round ?? row.round_number);
    const rounds = Array.isArray(row.rounds) ? row.rounds.map(integer) : [];
    return directRound === roundNumber || rounds.includes(roundNumber);
  }) || candidates[0] || {};
}

function splitLocation(value) {
  const parts = clean(value).split(",").map(clean).filter(Boolean);
  return { city: parts[0] || "", state: parts.slice(1).join(", ") };
}

function scoringContextForRound(aggregate, roundNumber) {
  const record = (aggregate.matches || []).find((entry) => integer(entry?.match?.round_number) === roundNumber);
  return record?.scoring_snapshot || {};
}

function buildCourses(aggregate, guideProjection) {
  const tournament = aggregate.tournament || {};
  const destination = clean(
    tournament.location || tournament.destination ||
    presentationTournament(aggregate).location || aggregate?.home_presentation?.tournament_location
  );
  return [...(aggregate.rounds || [])]
    .sort((left, right) => integer(left.round_number, 0) - integer(right.round_number, 0))
    .map((round) => {
      const roundNumber = integer(round.round_number);
      const scoring = scoringContextForRound(aggregate, roundNumber);
      const id = clean(scoring.course_id || round.course_id);
      const guide = guideCourseFor(guideProjection, id, roundNumber);
      const location = clean(guide.location || guide.Destination || destination);
      const locationParts = splitLocation(location);
      const definitions = Array.isArray(scoring.hole_definitions) ? scoring.hole_definitions : [];
      const yardage = definitions.reduce((sum, hole) => sum + (number(hole.yardage, 0) || 0), 0);
      return {
        "Course ID": id,
        Year: HISTORY_YEAR,
        Round: `Round ${roundNumber}`,
        "Round ID": `${HISTORY_YEAR}-R${roundNumber}`,
        "Round Label": `Round ${roundNumber}`,
        Format: formatCode(round.format || scoring.format),
        Course: clean(guide.name || guide.Course || guide["Course Name"] ||
          (aggregate.matches || []).find((entry) => integer(entry?.match?.round_number) === roundNumber)?.presentation?.course_name || id),
        City: clean(guide.City || locationParts.city),
        State: clean(guide.State || locationParts.state),
        Destination: location,
        "Tee Played": clean(scoring.tee || guide.tee || guide["Tee Played"]),
        Rating: number(scoring.rating),
        Slope: number(scoring.slope),
        Par: number(scoring.par),
        Yardage: number(guide.yardage ?? guide.Yardage, yardage || null),
        "Course Logo": clean(guide.logo || guide["Course Logo"] ||
          (aggregate.matches || []).find((entry) => integer(entry?.match?.round_number) === roundNumber)?.presentation?.course_logo),
        "Course Profile Image": clean(guide.profileImage || guide.profile_image || guide["Course Profile Image"]),
        Website: clean(guide.website || guide.Website || guide.url),
      };
    });
}

function buildCourseHoles(aggregate) {
  const contexts = new Map();
  for (const record of aggregate.matches || []) {
    const scoring = record.scoring_snapshot || {};
    const key = `${upper(scoring.course_id)}|${upper(scoring.tee)}`;
    const candidate = { scoring, round: integer(record?.match?.round_number) };
    if (!contexts.has(key)) {
      contexts.set(key, candidate);
      continue;
    }
    const existing = contexts.get(key).scoring;
    const existingHoles = canonical(existing.hole_definitions || []);
    const candidateHoles = canonical(scoring.hole_definitions || []);
    if (JSON.stringify(existingHoles) !== JSON.stringify(candidateHoles)) {
      throw new Error(`Course ${scoring.course_id} / ${scoring.tee} has incompatible historical hole configurations.`);
    }
  }
  return [...contexts.values()].flatMap(({ scoring, round }) => {
    const definitions = assertArray(scoring.hole_definitions, `course-hole configuration for ${scoring.course_id}`);
    if (definitions.length !== 18) throw new Error(`Course ${scoring.course_id} / ${scoring.tee} does not contain 18 holes.`);
    return [...definitions]
      .sort((left, right) => integer(left.hole_number, 0) - integer(right.hole_number, 0))
      .map((hole) => ({
        "Course ID": clean(scoring.course_id),
        Tee: clean(scoring.tee),
        Year: HISTORY_YEAR,
        Round: round,
        "Hole Number": integer(hole.hole_number),
        Par: number(hole.par),
        "Stroke Index": integer(hole.stroke_index),
        Yardage: number(hole.yardage),
      }));
  });
}

function participantDirectory(aggregate) {
  const appearances = new Map();
  const importedPresentation = homePresentation(aggregate).leaderboardsPlayers || {};
  for (const record of aggregate.matches || []) {
    for (const participant of record.participants || []) {
      const id = clean(participant.player_id);
      if (!id || appearances.has(id)) continue;
      appearances.set(id, participant);
    }
  }
  return (aggregate.players || []).map((player) => {
    const id = clean(player.player_id);
    const appearance = appearances.get(id) || {};
    const presentation = importedPresentation[id] || {};
    const displayName = clean(player.display_name || appearance.display_name || id);
    return {
      "Player ID": id,
      "Display Name": displayName,
      Slug: clean(player.slug || appearance.slug || presentation.slug || slugify(displayName)),
      slug: clean(player.slug || appearance.slug || presentation.slug || slugify(displayName)),
      "Photo Filename": clean(player.photo_filename || player.photo || presentation.photo),
      captain: presentation.captain === true,
      "Team ID": clean(player.team_id),
      "Team Side": integer(player.team_side ?? appearance.team_side),
      "Tournament Handicap": number(appearance.handicap_index),
    };
  }).sort((left, right) => left["Display Name"].localeCompare(right["Display Name"]) ||
    left["Player ID"].localeCompare(right["Player ID"]));
}

function teamPresentation(aggregate, side) {
  const record = (aggregate.matches || []).find((entry) => entry.presentation);
  return side === 1 ? {
    logo: clean(record?.presentation?.team_1_logo),
    primaryColor: clean(record?.presentation?.team_1_primary_color),
    secondaryColor: clean(record?.presentation?.team_1_secondary_color),
  } : {
    logo: clean(record?.presentation?.team_2_logo),
    primaryColor: clean(record?.presentation?.team_2_primary_color),
    secondaryColor: clean(record?.presentation?.team_2_secondary_color),
  };
}

function buildTeams(aggregate, players) {
  const playersById = new Map(players.map((player) => [player["Player ID"], player]));
  const appearanceByPlayer = new Map();
  for (const record of aggregate.matches || []) {
    for (const participant of record.participants || []) {
      const id = clean(participant.player_id);
      if (!id || appearanceByPlayer.has(id)) continue;
      appearanceByPlayer.set(id, participant);
    }
  }
  return [...(aggregate.teams || [])]
    .sort((left, right) => integer(left.team_side, 0) - integer(right.team_side, 0))
    .map((team) => {
      const sideNumber = integer(team.team_side);
      const presentation = teamPresentation(aggregate, sideNumber);
      const roster = players
        .filter((player) => clean(player["Team ID"]) === clean(team.team_id) || integer(player["Team Side"]) === sideNumber)
        .map((player) => ({
          player: playersById.get(player["Player ID"]),
          handicap: number(appearanceByPlayer.get(player["Player ID"])?.handicap_index),
        }))
        .sort((left, right) => (number(left.handicap, 999) - number(right.handicap, 999)) ||
          left.player["Display Name"].localeCompare(right.player["Display Name"]));
      const numericHandicaps = roster.map((row) => number(row.handicap)).filter(Number.isFinite);
      const captainId = clean(team.captain_id || roster.find((row) => row.player?.captain === true)?.player?.["Player ID"]);
      return {
        year: HISTORY_YEAR,
        side: `Team ${sideNumber}`,
        sideNumber,
        id: clean(team.team_id),
        name: clean(team.name || team.team_id),
        logo: clean(team.logo || presentation.logo),
        primaryColor: clean(team.primary_color || presentation.primaryColor),
        secondaryColor: clean(team.secondary_color || presentation.secondaryColor),
        captainId: captainId || null,
        captainRecordedName: clean(team.captain_name),
        captain: captainId ? playersById.get(captainId) || null : null,
        roster,
        averageHandicap: numericHandicaps.length
          ? numericHandicaps.reduce((sum, value) => sum + value, 0) / numericHandicaps.length
          : null,
      };
    });
}

function teamNamesRows(teams) {
  return teams.map((team) => ({
    Year: HISTORY_YEAR,
    "Team Side": team.side,
    "Team ID": team.id,
    "Team Names": team.name,
    "Team Name": team.name,
    "Team Logo": team.logo,
    "Primary Color": team.primaryColor,
    "Secondary Color": team.secondaryColor,
    Captain: team.captainId || team.captainRecordedName || "",
  }));
}

function normalizedWinner(value) {
  const normalized = upper(value).replace(/\s+/g, " ");
  if (["HALVED", "HALF", "TIE", "TIED"].includes(normalized)) return "Halved";
  if (["TEAM1", "TEAM 1", "SIDE 1"].includes(normalized)) return "Team 1";
  if (["TEAM2", "TEAM 2", "SIDE 2"].includes(normalized)) return "Team 2";
  return clean(value) || null;
}

function resultFor(record, snapshot) {
  if (snapshot?.payload?.result) return snapshot.payload.result;
  const match = record.match || {};
  return {
    scorecard_complete: Boolean(match.scorecard_complete),
    completed_holes: integer(match.scored_holes, 0),
    team_1_holes_won: integer(match.team_1_holes_won, 0),
    team_2_holes_won: integer(match.team_2_holes_won, 0),
    current_hole: integer(match.current_hole),
    holes_remaining: integer(match.holes_remaining),
    result_winner: match.result_winner,
    overall_result: match.result_winner,
    running_result: match.running_result,
  };
}

function participantsFor(record, snapshot) {
  const participants = snapshot?.payload?.participants || record.participants || [];
  return [...participants].sort((left, right) =>
    integer(left.team_side, 0) - integer(right.team_side, 0) ||
    integer(left.player_slot, 0) - integer(right.player_slot, 0) ||
    clean(left.player_id).localeCompare(clean(right.player_id))
  );
}

function buildGoogleMatchRow(record, snapshot, teams) {
  const match = record.match || {};
  const payload = snapshot?.payload || {};
  const payloadMatch = payload.match || {};
  const payloadCourse = payload.course || {};
  const scoring = record.scoring_snapshot || {};
  const participants = participantsFor(record, snapshot);
  const result = resultFor(record, snapshot);
  const presentation = record.presentation || {};
  const format = formatCode(payloadMatch.format || match.format || scoring.format);
  const value = (side, slot, field, fallback = null) => {
    const participant = participants.find((row) => integer(row.team_side) === side && integer(row.player_slot) === slot);
    return participant ? (participant[field] ?? fallback) : fallback;
  };
  const teamConfig = scoring.team_configuration || {};
  const resultWinner = normalizedWinner(result.result_winner || result.overall_winner || result.overall_result || match.result_winner);
  const overallWinner = normalizedWinner(result.overall_winner || result.overall_result || result.result_winner || match.result_winner);
  const frontWinner = normalizedWinner(result.front_winner || result.front_result);
  const backWinner = normalizedWinner(result.back_winner || result.back_result);
  const status = upper(payloadMatch.status || match.status);
  const displayNumber = integer(payloadMatch.display_number || presentation.display_match_number || match.display_match_number);
  const course = payloadCourse.course_id ? payloadCourse : scoring;

  const row = {
    "Match ID": clean(payloadMatch.match_id || match.match_id),
    Year: HISTORY_YEAR,
    Round: integer(payload?.round?.round_number ?? match.round_number),
    Match: displayNumber,
    Format: format,
    "Course ID": clean(course.course_id),
    Tee: clean(course.tee),
    "Tee Time": clean(presentation.tee_time),
    "Starting Hole": clean(presentation.starting_hole),
    "Match Status": status,
    "Scorecard Complete": result.scorecard_complete === true,
    "Front 9 Winner": frontWinner || "",
    "Back 9 Winner": backWinner || "",
    "18-Hole Winner": overallWinner || "",
    "Matchup Winner": resultWinner || "",
    "Team 1 Points": number(result.team_1_points),
    "Team 2 Points": number(result.team_2_points),
    "Final Result": clean(payloadMatch.running_result || result.running_result || match.running_result),
    "Team 1 Team ID": clean((payload.teams || []).find((team) => integer(team.team_side) === 1)?.team_id || teams.find((team) => team.sideNumber === 1)?.id),
    "Team 2 Team ID": clean((payload.teams || []).find((team) => integer(team.team_side) === 2)?.team_id || teams.find((team) => team.sideNumber === 2)?.id),
    "Team 1 Playing HCP": number(teamConfig.team_1_playing_handicap ?? teamConfig.team_1_handicap),
    "Team 2 Playing HCP": number(teamConfig.team_2_playing_handicap ?? teamConfig.team_2_handicap),
    "Team 1 Stroke": number(teamConfig.team_1_strokes, format === "SC" ? 0 : null),
    "Team 2 Stroke": number(teamConfig.team_2_strokes, format === "SC" ? 0 : null),
    Notes: "",
  };
  for (const side of [1, 2]) {
    for (const slot of [1, 2]) {
      const prefix = `Team ${side} Player ${slot}`;
      row[prefix] = clean(value(side, slot, "player_id", ""));
      row[`${prefix} Playing HCP`] = number(value(side, slot, "playing_handicap"));
      row[`${prefix} Stroke`] = number(value(side, slot, "final_strokes"));
    }
  }
  return row;
}

function publicPlayer(participant, playerById) {
  const player = playerById.get(clean(participant.player_id)) || {};
  return {
    id: clean(participant.player_id),
    name: clean(participant.display_name || player["Display Name"] || participant.player_id),
    slug: clean(player.slug || player.Slug || participant.slug || slugify(participant.display_name)),
    playingHcp: number(participant.playing_handicap),
    stroke: number(participant.final_strokes),
  };
}

function displayWinner(value, teams) {
  const winner = normalizedWinner(value);
  if (winner === "Team 1") return teams[0]?.name || "Team 1";
  if (winner === "Team 2") return teams[1]?.name || "Team 2";
  if (winner === "Halved") return "Halved";
  return winner || "Not recorded";
}

function buildPublicMatch(record, snapshot, googleRow, players, teams, course) {
  const match = record.match || {};
  const participants = participantsFor(record, snapshot);
  const result = resultFor(record, snapshot);
  const playerById = new Map(players.map((player) => [player["Player ID"], player]));
  const sidePlayers = (side) => participants
    .filter((participant) => integer(participant.team_side) === side)
    .map((participant) => publicPlayer(participant, playerById));
  const teamOnePlayers = sidePlayers(1);
  const teamTwoPlayers = sidePlayers(2);
  const format = formatCode(match.format || googleRow.Format);
  const overallWinner = normalizedWinner(result.overall_winner || result.overall_result || result.result_winner || match.result_winner);
  const matchupWinner = normalizedWinner(result.result_winner || result.overall_winner || result.overall_result || match.result_winner);
  const final = matchLifecycle(record) === "FINAL";
  const status = final ? "FINAL" : matchLifecycle(record) === "LIVE" ? "LIVE" : upper(match.status || "UPCOMING");
  const teamOneStroke = number(googleRow["Team 1 Stroke"]);
  const teamTwoStroke = number(googleRow["Team 2 Stroke"]);
  return {
    id: clean(match.match_id),
    match_id: clean(match.match_id),
    match: integer(googleRow.Match),
    matchNumber: integer(googleRow.Match),
    round: integer(match.round_number),
    format,
    formatName: formatName(format),
    status,
    lifecycle: upper(match.status),
    teeTime: clean(record?.presentation?.tee_time),
    course: { id: clean(course?.["Course ID"]), name: clean(course?.Course), tee: clean(course?.["Tee Played"]) },
    notes: "",
    team1Players: teamOnePlayers,
    team2Players: teamTwoPlayers,
    team1PlayingHcp: number(googleRow["Team 1 Playing HCP"]),
    team2PlayingHcp: number(googleRow["Team 2 Playing HCP"]),
    team1Stroke: teamOneStroke,
    team2Stroke: teamTwoStroke,
    frontWinner: normalizedWinner(result.front_winner || result.front_result),
    backWinner: normalizedWinner(result.back_winner || result.back_result),
    overallWinner,
    matchupWinner,
    team1Points: number(result.team_1_points),
    team2Points: number(result.team_2_points),
    team1HolesWon: integer(result.team_1_holes_won ?? match.team_1_holes_won, 0),
    team2HolesWon: integer(result.team_2_holes_won ?? match.team_2_holes_won, 0),
    currentHole: integer(result.current_hole ?? match.current_hole),
    holesRemaining: integer(result.holes_remaining ?? match.holes_remaining),
    liveStatusText: final ? "" : clean(match.running_result),
    finalResult: final ? clean(snapshot?.payload?.match?.running_result || match.running_result) : "",
    updatedAt: clean(match.finalized_at || match.authority_updated_at),
    teamOne: {
      id: teams[0]?.id || clean(googleRow["Team 1 Team ID"]),
      name: teams[0]?.name || "Team 1",
      players: teamOnePlayers,
      playerHandicaps: teamOnePlayers.map((player) => player.playingHcp),
      playerStrokes: teamOnePlayers.map((player) => player.stroke),
      teamHandicap: number(googleRow["Team 1 Playing HCP"]),
      teamStrokes: teamOneStroke,
      points: number(result.team_1_points),
    },
    teamTwo: {
      id: teams[1]?.id || clean(googleRow["Team 2 Team ID"]),
      name: teams[1]?.name || "Team 2",
      players: teamTwoPlayers,
      playerHandicaps: teamTwoPlayers.map((player) => player.playingHcp),
      playerStrokes: teamTwoPlayers.map((player) => player.stroke),
      teamHandicap: number(googleRow["Team 2 Playing HCP"]),
      teamStrokes: teamTwoStroke,
      points: number(result.team_2_points),
    },
    segments: [
      { label: "Front 9", winner: displayWinner(result.front_winner || result.front_result, teams) },
      { label: "Back 9", winner: displayWinner(result.back_winner || result.back_result, teams) },
      { label: "18-Hole", winner: displayWinner(overallWinner, teams) },
    ],
    winner: displayWinner(matchupWinner, teams),
  };
}

function leaderboardFromMatches(matches, players, teams) {
  const rows = new Map();
  const playerById = new Map(players.map((player) => [player["Player ID"], player]));
  const teamBySide = new Map(teams.map((team) => [team.sideNumber, team]));
  for (const match of matches.filter((item) => upper(item.lifecycle || item.status) === "FINAL")) {
    const winner = normalizedWinner(match.matchupWinner || match.overallWinner);
    for (const side of [1, 2]) {
      const participants = side === 1 ? match.team1Players : match.team2Players;
      const teamPoints = side === 1 ? number(match.team1Points) : number(match.team2Points);
      const individualPoints = teamPoints === null ? 0 : (match.format === "SI" ? teamPoints : teamPoints / 2);
      for (const participant of participants) {
        if (!rows.has(participant.id)) rows.set(participant.id, {
          id: participant.id,
          player: playerById.get(participant.id),
          teamSide: side,
          teamName: teamBySide.get(side)?.name || `Team ${side}`,
          wins: 0,
          losses: 0,
          halves: 0,
          points: 0,
          pointsTracked: true,
        });
        const row = rows.get(participant.id);
        row.points += individualPoints;
        if (winner === "Team 1" || winner === "Team 2") {
          if (winner === `Team ${side}`) row.wins += 1;
          else row.losses += 1;
        } else if (winner === "Halved") row.halves += 1;
      }
    }
  }
  return [...rows.values()].map((row) => ({
    ...row,
    winPercentage: row.wins + row.losses + row.halves
      ? ((row.wins + row.halves * 0.5) / (row.wins + row.losses + row.halves)) * 100
      : 0,
  })).sort((left, right) => right.points - left.points || right.wins - left.wins ||
    left.losses - right.losses || clean(left.player?.["Display Name"]).localeCompare(clean(right.player?.["Display Name"])));
}

function buildTournament(aggregate, courses, teams, guideProjection) {
  const tournament = aggregate.tournament || {};
  const presentation = presentationTournament(aggregate);
  const guideIdentity = guideEnvelope(guideProjection).content.tournamentIdentity || {};
  const name = clean(guideIdentity.name || presentation.name || tournament.name || "2026 Sandbagger Invitational");
  const location = clean(guideIdentity.location || presentation.location || tournament.location || tournament.destination ||
    aggregate?.home_presentation?.tournament_location || "");
  return {
    Year: HISTORY_YEAR,
    Tournament: clean(tournament.tournament_id || HISTORY_YEAR),
    Annual: clean(guideIdentity.editionTitle || presentation.edition_title || presentation.editionTitle || name),
    "Annual Image": clean(guideIdentity.logoFileName || presentation.logo_file_name || presentation.logoFileName || presentation.logo),
    Dates: clean(guideIdentity.dates || presentation.dates || tournament.dates),
    Destination: location,
    "Hero Image": clean(presentation.hero_image || presentation.heroImage || courses.at(-1)?.["Course Profile Image"]),
    "Final Score": "",
    year: HISTORY_YEAR,
    id: clean(tournament.tournament_id || HISTORY_YEAR),
    name,
    editionTitle: clean(guideIdentity.editionTitle || presentation.edition_title || presentation.editionTitle || name),
    logoFileName: clean(guideIdentity.logoFileName || presentation.logo_file_name || presentation.logoFileName || presentation.logo),
    teams,
    team1: teams.find((team) => team.sideNumber === 1) || null,
    team2: teams.find((team) => team.sideNumber === 2) || null,
    teamOne: teams.find((team) => team.sideNumber === 1) || null,
    teamTwo: teams.find((team) => team.sideNumber === 2) || null,
    championTeamId: null,
    runnerUpTeamId: null,
    championTeam: null,
    runnerUpTeam: null,
    courses,
    awards: [],
  };
}

function buildRoundModels(aggregate, tournament, courses, teams, matches) {
  const availableRounds = [...(aggregate.rounds || [])]
    .map((round) => ({
      id: `${HISTORY_YEAR}-R${integer(round.round_number)}`,
      number: integer(round.round_number),
      label: `Round ${integer(round.round_number)}`,
    }))
    .sort((left, right) => left.number - right.number);
  return availableRounds.map((entry, index) => {
    const course = courses.find((candidate) => integer(clean(candidate.Round).replace(/\D/g, "")) === entry.number);
    const roundMatches = matches.filter((match) => match.round === entry.number)
      .sort((left, right) => left.match - right.match);
    const recorded = roundMatches.filter((match) => number(match.team1Points) !== null && number(match.team2Points) !== null);
    const teamOnePoints = recorded.length ? recorded.reduce((sum, match) => sum + number(match.team1Points, 0), 0) : null;
    const teamTwoPoints = recorded.length ? recorded.reduce((sum, match) => sum + number(match.team2Points, 0), 0) : null;
    const complete = roundMatches.length > 0 && roundMatches.every((match) => upper(match.lifecycle || match.status) === "FINAL");
    const roundWinner = !complete ? "In Progress"
      : teamOnePoints > teamTwoPoints ? teams[0]?.name
      : teamTwoPoints > teamOnePoints ? teams[1]?.name
      : teamOnePoints !== null ? "Halved" : "Not recorded";
    return {
      year: HISTORY_YEAR,
      round: entry.number,
      tournament,
      course,
      format: clean(course?.Format || aggregate.rounds.find((round) => integer(round.round_number) === entry.number)?.format),
      teamOne: { ...(teams[0] || {}), points: teamOnePoints },
      teamTwo: { ...(teams[1] || {}), points: teamTwoPoints },
      roundWinner,
      matches: roundMatches,
      availableRounds,
      previousRound: index > 0 ? availableRounds[index - 1] : null,
      nextRound: index < availableRounds.length - 1 ? availableRounds[index + 1] : null,
    };
  });
}

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "finalized_snapshots", "finalizedsnapshots", "snapshot_id", "snapshotid",
  "payload_hash", "payloadhash", "archive_jobs", "archivejobs", "archive_checkpoints",
  "archivecheckpoints", "claim_token", "claimtoken", "actor_id", "actorid",
  "service_role", "servicerole", "mutation_key", "mutationkey", "google_readback_hash",
  "googlereadbackhash", "source_fingerprint_inputs", "sourcefingerprintinputs",
]);

function safePublicValue(value, seen = new WeakSet()) {
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (Array.isArray(value)) return value.map((item) => safePublicValue(item, seen)).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const comparable = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      const compact = comparable.replace(/_/g, "");
      if (FORBIDDEN_PUBLIC_KEYS.has(comparable) || FORBIDDEN_PUBLIC_KEYS.has(compact)) continue;
      const safe = safePublicValue(item, seen);
      if (safe !== undefined) result[key] = safe;
    }
    seen.delete(value);
    return result;
  }
  return value;
}

/** Return a serializable participant/public-safe DTO. */
export function sanitizeHistory2026PublicView(view = {}) {
  return safePublicValue(view) || {};
}

/** Build the existing public team page plus its current-year match archive. */
export function history2026TeamPageModel(view = {}, requestedSide = "") {
  const target = clean(requestedSide).toLowerCase();
  if (!target) return null;
  const teams = Array.isArray(view?.teams) ? view.teams : view?.tournament?.teams || [];
  const team = teams.find((candidate) => {
    const side = clean(candidate?.side).toLowerCase();
    const teamId = clean(candidate?.id || candidate?.teamId || candidate?.team_id).toLowerCase();
    const name = clean(candidate?.name).toLowerCase();
    const sideNumber = number(candidate?.teamSide ?? candidate?.team_side ?? candidate?.sideNumber, 0);
    return [side, teamId, name, sideNumber ? `team ${sideNumber}` : ""]
      .filter(Boolean).includes(target);
  }) || null;
  if (!team) return null;

  const teamId = clean(team.id || team.teamId || team.team_id);
  const sideNumber = number(team.teamSide ?? team.team_side ?? team.sideNumber, 0);
  const roundRows = Array.isArray(view?.rounds) ? view.rounds : [];
  const roundGroups = roundRows.map((row) => {
    const archive = row?.archive || row;
    const matches = (Array.isArray(archive?.matches) ? archive.matches : []).filter((match) => {
      const firstId = clean(match?.teamOne?.id || view?.tournament?.teamOne?.id);
      const secondId = clean(match?.teamTwo?.id || view?.tournament?.teamTwo?.id);
      return [firstId, secondId].includes(teamId);
    });
    return {
      number: number(archive?.round, 0),
      label: `Round ${number(archive?.round, 0)}`,
      format: clean(archive?.format),
      course: archive?.course || null,
      matches,
      selectedTeamSide: sideNumber,
      selectedTeamPoints: sideNumber === 1 ? archive?.teamOne?.points : archive?.teamTwo?.points,
      opponentTeamPoints: sideNumber === 1 ? archive?.teamTwo?.points : archive?.teamOne?.points,
      opponent: sideNumber === 1 ? view?.tournament?.teamTwo : view?.tournament?.teamOne,
    };
  }).filter((group) => group.matches.length);

  return {
    ...team,
    tournament: view?.tournament || null,
    roundGroups,
    scorecardAnalytics: view?.scorecardAnalytics || view?.analytics || null,
  };
}

/**
 * Translate the bounded canonical 2026 bundle into the established historical
 * UI and analytics contracts. No scoring or result rules are reimplemented:
 * finalized rows flow through the existing archive builder and analytics.
 */
export function buildHistory2026Adapter(aggregate = {}, { guideProjection = {} } = {}) {
  if (clean(aggregate?.tournament?.tournament_id) !== String(HISTORY_YEAR) ||
      integer(aggregate?.tournament?.tournament_year) !== HISTORY_YEAR) {
    throw new Error("The historical adapter requires explicit tournament 2026; synthetic fixtures are rejected.");
  }
  const roundsInput = assertArray(aggregate.rounds, "rounds");
  const teamsInput = assertArray(aggregate.teams, "teams");
  const playersInput = assertArray(aggregate.players, "players");
  const matchesInput = assertArray(aggregate.matches, "matches");
  if (roundsInput.length !== 3 || teamsInput.length !== 2 || playersInput.length !== 24 || matchesInput.length !== 24) {
    throw new Error("The canonical 2026 historical field set is incomplete.");
  }

  const selectedSnapshots = selectCurrentFinalizedSnapshots(
    matchesInput,
    aggregate.finalized_snapshots || [],
    teamsInput
  );
  const players = participantDirectory(aggregate);
  const teams = buildTeams(aggregate, players);
  if (teams.some((team) => !team.id || ![1, 2].includes(team.sideNumber)) ||
      new Set(teams.map((team) => team.id)).size !== 2 ||
      new Set(teams.map((team) => team.sideNumber)).size !== 2) {
    throw new Error("The canonical 2026 Team ID/side contract is incomplete.");
  }
  const courses = buildCourses(aggregate, guideProjection);
  const courseHoles = buildCourseHoles(aggregate);
  const teamNames = teamNamesRows(teams);
  const googleMatches = matchesInput.map((record) =>
    buildGoogleMatchRow(record, selectedSnapshots.get(matchRecordId(record)), teams)
  );
  const finalizedGoogleMatches = googleMatches.filter((row) => upper(row["Match Status"]) === "FINAL");
  const roundScorecards = [...selectedSnapshots.values()]
    .sort((left, right) => matchRecordId(left).localeCompare(matchRecordId(right)))
    .flatMap((snapshot) => buildRoundScorecardsArchiveRows(snapshot));

  const analytics = buildScorecardAnalytics({
    roundScorecards,
    matches: finalizedGoogleMatches,
    courseHoles,
    courses,
    teamNames,
    players,
  });
  if (analytics.missingScorecards.length || analytics.warnings.length ||
      analytics.usableScorecards.length !== roundScorecards.length ||
      analytics.scorecards.length !== roundScorecards.length) {
    throw new Error("The 2026 historical analytics contract contains unresolved scorecards, identities, or course context.");
  }
  const matchById = new Map(matchesInput.map((record) => [matchRecordId(record), record]));
  const publicMatches = googleMatches.map((row) => {
    const record = matchById.get(clean(row["Match ID"]));
    const snapshot = selectedSnapshots.get(clean(row["Match ID"]));
    const course = courses.find((candidate) => clean(candidate["Course ID"]) === clean(row["Course ID"]));
    return buildPublicMatch(record, snapshot, row, players, teams, course);
  }).sort((left, right) => left.round - right.round || left.match - right.match);
  const tournament = buildTournament(aggregate, courses, teams, guideProjection);
  const rounds = buildRoundModels(aggregate, tournament, courses, teams, publicMatches);
  const roundPoints = rounds.map((round) => {
    const allFinal = round.matches.length > 0 && round.matches.every((match) => upper(match.lifecycle || match.status) === "FINAL");
    const values = round.matches.map((match) => {
      const one = number(match.team1Points);
      const two = number(match.team2Points);
      return one === null || two === null ? null : one + two;
    });
    return {
      round: round.round,
      roundLabel: `Round ${round.round}`,
      course: round.course?.Course || "",
      format: round.format,
      pointsAvailable: allFinal && values.every((value) => value !== null)
        ? values.reduce((sum, value) => sum + value, 0)
        : null,
    };
  });
  const finalMatches = publicMatches.filter((match) => upper(match.lifecycle || match.status) === "FINAL");
  const sourceFingerprint = history2026SourceFingerprint(aggregate, { guideProjection });
  const logicalIdentities = roundScorecards.map((row) => {
    const type = upper(row["Score Type"]) === "TEAM" ? "TEAM" : "PLAYER";
    return `${row["Match ID"]}:${type}:${type === "TEAM" ? row["Team ID"] : row["Player ID"]}`;
  });
  if (new Set(logicalIdentities).size !== logicalIdentities.length) {
    throw new Error("The 2026 historical adapter generated duplicate logical scorecards.");
  }

  return {
    source: "supabase",
    year: HISTORY_YEAR,
    sourceFingerprint,
    tournament,
    rounds,
    teams,
    players,
    matches: publicMatches,
    roundPoints,
    leaderboardRows: leaderboardFromMatches(finalMatches, players, teams),
    previousYear: 2025,
    nextYear: null,
    analytics,
    diagnostics: {
      totalMatches: publicMatches.length,
      finalMatches: finalMatches.length,
      liveMatches: publicMatches.length - finalMatches.length,
      currentFinalizedSnapshots: selectedSnapshots.size,
      logicalScorecards: analytics.scorecards.length,
      grossHoleValues: analytics.scorecards.reduce((count, scorecard) =>
        count + scorecard.holes.filter((hole) => hole.score !== null).length, 0),
      duplicateLogicalScorecards: logicalIdentities.length - new Set(logicalIdentities).size,
      missingExpectedScorecards: analytics.missingScorecards.length,
      googleForegroundRequests: 0,
    },
  };
}
