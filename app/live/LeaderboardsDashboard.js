"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import AssetImage from "../AssetImage";
import PlayerAvatar from "../PlayerAvatar";
import StatusBadge from "../StatusBadge";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import TournamentIntelligenceStorylines from "./TournamentIntelligenceStorylines";
import ScrambleLeaderboard from "./ScrambleLeaderboard";
import ScrambleTeamIdentity from "./ScrambleTeamIdentity";
import { LeaderboardColumnHeader, LeaderboardDetailSheet, LeaderboardEntry, LeaderboardMetrics, PlayerLeaderboardIdentity, RoundLeaderboardSheet } from "./LeaderboardRow";
import { teamLogo, tournamentLogo } from "../../lib/asset-paths";
import { formatMeaningfulNumber, formatPlayerPoints, formatTeamPoints } from "../../lib/formatters";
import { publishedOddsInsights } from "../../lib/championship-odds-insights";
import { formatChampionshipOdds } from "../../lib/championship-odds-format";
import { playerProjectionSummary, projectionHistoryHighlights, publishedPlayerHistory, tournamentProjectionStory } from "../../lib/projection-editorial";
import { tournamentIntelligenceStorylines } from "../../lib/tournament-intelligence-storylines";
import { fetchWithTransientRetry } from "../../lib/transient-fetch";
import { isTournamentRecapPhase, projectionPresentationLabel } from "../../lib/projection-phases";
import { buildTournamentRecapIntelligence, finishLabel } from "../../lib/tournament-recap-intelligence";
import { participantRoundBreakdown, playerRoundBreakdown } from "../../lib/leaderboard-round-breakdown";
import { flushParticipantAuthDiagnostics, recordParticipantAuthDiagnostic } from "../../lib/participant-auth-client-diagnostics";
import { teamRoundRecap } from "../../lib/team-round-recap";
import { LEADERBOARD_MODULES, normalizeLeaderboardModule } from "../../lib/leaderboards-navigation";
import {
  PLAYER_METRICS,
  playerPerformanceRows,
  rankPlayerRows,
  roundCompetitionRows,
  searchPlayerRows,
  teamStandings,
} from "../../lib/mobile-leaderboards";
import styles from "./leaderboards-dashboard.module.css";
import insightStyles from "./leaderboards-insights.module.css";
import skinsStyles from "./net-skins.module.css";
import leaderboardStyles from "./scramble-leaderboard.module.css";
import teamStyles from "./teams-leaderboard.module.css";

const clean = (value) => String(value ?? "").trim();
const initials = (name) => clean(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 3).join("").toUpperCase();
const toPar = (value) => Number(value) === 0 ? "E" : Number(value) > 0 ? `+${value}` : String(value);
const average = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
const currency = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number(value) % 1 ? 2 : 0 }).format(Number(value) || 0);
const metricValue = (row, metric) => {
  if (metric === "points") return `${formatPlayerPoints(row.points)} pts`;
  if (metric === "wins") return String(row.wins ?? "—");
  if (metric === "winPct") return row.winPct === null ? "—" : `${row.winPct.toFixed(0)}%`;
  return average(row[metric]);
};

function TeamMark({ filename, name, size = "small" }) {
  return <span className={`${styles.teamMark} ${size === "sheet" ? teamStyles.sheetTeamMark : ""}`.trim()} data-size={size}>
    <AssetImage src={teamLogo(filename)} alt={`${name} logo`} className={styles.teamLogo} fallbackClassName={styles.teamFallback} fallback={initials(name)} inferFallback={false} />
  </span>;
}

function TeamNameWithBadge({ name, current = false }) {
  return <span className={teamStyles.teamNameLine}>
    <strong>{name}</strong>
    {current ? <em>YOUR TEAM</em> : null}
  </span>;
}

function TeamSheetName({ name, current = false }) {
  return <span className={teamStyles.teamSheetName}>
    <strong>{name}</strong>
    {current ? <em>YOUR TEAM</em> : null}
  </span>;
}

function TeamLeaderboardIdentity({ team, current = false, large = false }) {
  return <span className={teamStyles.teamSheetIdentity} data-large={large || undefined}>
    <TeamMark filename={team.logo} name={team.name} size="sheet" />
    <TeamSheetName name={team.name} current={current} />
  </span>;
}

function Controls({ rounds, selectedRound, onRound }) {
  return <nav className={styles.roundSelector} aria-label="Leaderboard round">
    {[["overall", "Overall"], ...rounds.map((round) => [String(round.number), round.label])].map(([value, label]) =>
      <button type="button" aria-pressed={selectedRound === value} onClick={() => onRound(value)} key={value}>{label}</button>
    )}
  </nav>;
}

function formatName(value) {
  const format = clean(value).toUpperCase();
  return format === "SC" || format === "SCRAMBLE" ? "Scramble" : format === "SI" || format === "SINGLES" ? "Singles" : "Best Ball";
}

function OverallPlayerSheet({ row, rounds = [], roundLeaderboards = {}, tournament = {}, complete, onClose }) {
  const roundResults = rounds.map((round) => {
    const result = (roundLeaderboards[round.number] || []).find((item) => item.id === row.id);
    return { round, breakdown: playerRoundBreakdown(round, row.id, result, tournament) };
  });
  return <LeaderboardDetailSheet title="Overall Player" identity={<><PlayerLeaderboardIdentity player={{ name: row.player, photo: row.photo }} team={row.team} large /><StatusBadge status={complete ? "Final" : "Live"} /></>} metrics={[
    { label: complete ? "Final Rank" : "Current Rank", value: row.displayRank },
    { label: "Overall Record", value: row.record },
    { label: "Points", value: formatPlayerPoints(row.points), emphasis: "points" },
    { label: "Gross Average", value: row.grossAvg !== null ? average(row.grossAvg) : "—" },
    { label: "Net Average", value: row.netAvg !== null ? average(row.netAvg) : "—" },
  ]} onClose={onClose}>
    <section className={leaderboardStyles.roundBreakdown}><header><span>Round Breakdown</span><small>Official match results</small></header>{roundResults.map(({ round, breakdown }) => <article data-state={breakdown.state} key={round.number}><header><strong>{round.label} • {formatName(round.format)}</strong><StatusBadge status={breakdown.label} /></header>{breakdown.state === "pending" ? <p>Pending</p> : <div>{breakdown.segments.map((segment) => <span key={segment.label}><small>{segment.label}</small><strong>{segment.value}</strong></span>)}{breakdown.points !== null ? <span data-points="true"><small>Points</small><strong>{formatPlayerPoints(breakdown.points)}</strong></span> : null}</div>}</article>)}</section>
  </LeaderboardDetailSheet>;
}

function OverallPlayers({ data, currentPlayer, metric, setMetric }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [direction, setDirection] = useState("");
  const performance = useMemo(() => playerPerformanceRows(data.leaderboard || [], data.scoreLeaderboard || [], data.rounds || []), [data]);
  const availableMetrics = useMemo(() => PLAYER_METRICS.filter(([key]) =>
    ["points", "wins", "winPct"].includes(key) || performance.some((row) => row[key] !== null)
  ), [performance]);
  const ranked = useMemo(() => searchPlayerRows(rankPlayerRows(performance, metric, direction || undefined), query), [direction, metric, performance, query]);
  const selected = ranked.find((row) => row.id === selectedId);
  const complete = (data.rounds || []).length > 0 && (data.rounds || []).every((round) => (round.matches || []).length > 0 && round.matches.every((match) => ["final", "finalized"].includes(clean(match.status).toLowerCase())));
  const changeSort = () => setDirection((current) => current === "asc" ? "desc" : "asc");
  return <>
    <div className={styles.playerTools}>
      <label><span>Search players</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear player search">×</button> : null}</label>
      <div className={styles.metricSelector} role="group" aria-label="Performance metric">
        {availableMetrics.map(([value, label]) => <button type="button" aria-pressed={metric === value} onClick={() => { setMetric(value); setDirection(""); }} key={value}>{label}</button>)}
      </div>
      {metric !== "points" ? <p>Performance view · switch to Points for official tournament standings.</p> : null}
    </div>
    {!ranked.length ? <div className={styles.empty}><strong>No players match this search.</strong><span>Clear the search to see the tournament standings.</span></div> :
      <section className={leaderboardStyles.board} aria-label={metric === "points" ? "Official player standings" : `${availableMetrics.find(([key]) => key === metric)?.[1]} performance standings`}>
        <header><span><small>Overall</small><h2>Player Leaderboard</h2></span></header>
        <LeaderboardColumnHeader variant="overall" columns={[{ key: "record", label: "Record", sortable: false }, { key: metric, label: availableMetrics.find(([key]) => key === metric)?.[1] || "Points" }]} sort={{ key: metric, direction: direction || "desc" }} onSelect={changeSort} label="Overall player leaderboard columns" />
        <div className={leaderboardStyles.entries}>{ranked.map((row) => {
          const isCurrent = currentPlayer?.id === row.id;
          return <LeaderboardEntry rank={row.displayRank} current={isCurrent} state={complete ? "final" : "live"} identity={<PlayerLeaderboardIdentity player={{ name: row.player, photo: row.photo }} team={row.team} current={isCurrent} />} metrics={<LeaderboardMetrics variant="overall" metrics={[{ label: "Record", value: row.record }, { label: availableMetrics.find(([key]) => key === metric)?.[1] || "Points", value: metricValue(row, metric), emphasis: complete ? "final" : "live" }]} />} label={`${row.player}, rank ${row.displayRank || "unranked"}, record ${row.record}, ${metricValue(row, metric)}${isCurrent ? ", your position" : ""}`} onClick={() => setSelectedId(row.id)} key={row.id} />;
        })}</div>
        {selected ? <OverallPlayerSheet row={selected} rounds={data.rounds || []} roundLeaderboards={data.roundLeaderboards || {}} tournament={data.tournament || {}} complete={complete} onClose={() => setSelectedId("")} /> : null}
      </section>}
  </>;
}

function RoundPlayers({ data, selectedRound, currentPlayer }) {
  const round = data.rounds.find((item) => String(item.number) === selectedRound);
  const [selectedId, setSelectedId] = useState("");
  const rows = useMemo(() => roundCompetitionRows(data.scoreLeaderboard || [], round?.number, round?.format, data.roundLeaderboards?.[round?.number] || [], round?.matches || []), [data.scoreLeaderboard, data.roundLeaderboards, round]);
  const selected = rows.find((row) => row.id === selectedId);
  const selectedMatch = selected ? (round?.matches || []).find((match) => [...(match.team1Players || []), ...(match.team2Players || [])].some((player) => String(player.id) === String(selected.id))) : null;
  const selectedTeam = selected ? (data.leaderboard || []).find((player) => String(player.id) === String(selected.id))?.team : "";
  const pairing = ["SC", "SCRAMBLE"].includes(clean(round?.format).toUpperCase());
  const roundContext = [round?.label, round?.course?.name].filter(Boolean).join(" · ");
  const returnTo = `/live?view=leaderboards&tab=players&round=${encodeURIComponent(selectedRound)}`;
  if (pairing) return <ScrambleLeaderboard rows={data.scoreLeaderboard || []} round={round?.number} players={data.players || []} matches={round?.matches || []} officialRows={data.roundLeaderboards?.[round?.number] || []} tournament={data.tournament || {}} currentPlayerId={currentPlayer?.id} eyebrow={roundContext || "Round 2"} roundLabel={round?.label} courseName={round?.course?.name} returnTo={returnTo} />;
  const columns = [["holes", "Thru"], ["gross", "Gross"], ["net", "Net"], ["netToPar", "Net +/-"], ["points", "Points"]];
  const complete = rows.length > 0 && rows.every((row) => row.officialFinal);
  return <section className={leaderboardStyles.board} aria-label={`${round?.label || "Round"} player leaderboard`}>
    <header><span><small>{roundContext}</small><h2>{clean(round?.format).toUpperCase() === "SI" ? "Singles Player Leaderboard" : "Best Ball Player Leaderboard"}</h2></span>{rows.length ? <StatusBadge status={complete ? "Final" : "Live"} /> : null}</header>
    {!rows.length ? <div className={leaderboardStyles.empty}><strong>{(round?.matches || []).length ? "Scores pending." : "Round not started."}</strong><span>{(round?.matches || []).length ? "The leaderboard will update as official scores are recorded." : "Pairings and scores will appear when the round opens."}</span></div> : <>
      <LeaderboardColumnHeader columns={columns.map(([key, label]) => ({ key, label, sortable: false }))} label={`${round?.label || "Round"} player leaderboard columns`} />
      <div className={leaderboardStyles.entries}>{rows.map((row) => { const final = row.officialFinal; const thru = Number(row.holes) >= 18 ? "F" : row.holes; const isCurrent = String(currentPlayer?.id || "") === String(row.id); return <LeaderboardEntry rank={row.displayRank} current={isCurrent} state={final ? "final" : "live"} identity={<PlayerLeaderboardIdentity player={{ name: row.name, photo: row.photo }} current={isCurrent} />} metrics={<LeaderboardMetrics metrics={[{ label: "THRU", value: thru, emphasis: final ? "" : "live" }, { label: "Gross", value: row.gross, secondary: !final }, { label: "Net", value: row.net, emphasis: final ? "final" : "live" }, { label: "Net +/-", value: toPar(row.netToPar), emphasis: "live" }, { label: "Points", value: row.points === null ? "—" : formatPlayerPoints(row.points), emphasis: "points" }]} />} onClick={() => setSelectedId(row.id)} label={`Open ${row.name}, rank ${row.displayRank}, ${final ? "final" : `through ${row.holes}`}, ${row.points === null ? "points pending" : `${formatPlayerPoints(row.points)} points`}, net ${row.net}, ${toPar(row.netToPar)}${isCurrent ? ", your position" : ""}`} key={`${row.round}-${row.id}`} />; })}</div>
    </>}
    {selected ? <RoundLeaderboardSheet title={clean(round?.format).toUpperCase() === "SI" ? "Singles Player" : "Best Ball Player"} identity={<PlayerLeaderboardIdentity player={{ name: selected.name, photo: selected.photo }} team={selectedTeam} large />} roundLabel={round?.label} formatLabel={clean(round?.format).toUpperCase() === "SI" ? "Singles" : "Best Ball"} courseName={round?.course?.name} rank={selected.displayRank} holes={selected.holes} gross={selected.gross} net={selected.net} netToPar={toPar(selected.netToPar)} points={selected.points} breakdown={participantRoundBreakdown(round, selected.playerIds || [selected.id], selected.points, data.tournament || {})} officialFinal={selected.officialFinal} matchId={selectedMatch?.id} returnTo={returnTo} onClose={() => setSelectedId("")} /> : null}
  </section>;
}

function teamRoundState(round) {
  const matches = round?.matches || [];
  const official = matches.filter((match) => ["final", "finalized"].includes(clean(match.status).toLowerCase()) || match.finalizedAt || match["Finalized At"]);
  if (!official.length) return "upcoming";
  return matches.length > 0 && official.length === matches.length ? "final" : "live";
}

function TeamDetailSheet({ team, data, selectedRound, odds, current, onClose }) {
  const complete = (data.rounds || []).length > 0 && (data.rounds || []).every((round) => teamRoundState(round) === "final");
  const roundRows = (data.rounds || []).map((round) => {
    const standings = teamStandings(data.rounds || [], data.tournament || {}, String(round.number));
    const standing = standings.find((item) => Number(item.side) === Number(team.side));
    return { round, standing, state: teamRoundState(round) };
  }).sort((left, right) => String(left.round.number) === String(selectedRound) ? -1 : String(right.round.number) === String(selectedRound) ? 1 : Number(left.round.number) - Number(right.round.number));
  if (selectedRound !== "overall") {
    const selected = roundRows.find(({ round }) => String(round.number) === String(selectedRound));
    if (selected) return <TeamRoundDetailSheet team={team} round={selected.round} standing={selected.standing} state={selected.state} current={current} onClose={onClose} />;
  }
  return <LeaderboardDetailSheet title="Team Summary" identity={<TeamLeaderboardIdentity team={team} current={current} large />} metrics={[
    { label: complete ? "Final Rank" : "Current Rank", value: team.rank },
    { label: "Tournament Points", value: formatTeamPoints(team.points), emphasis: "points" },
    { label: "Overall Record", value: team.record },
    { label: "Championship Odds", value: odds === null ? "Pending" : formatChampionshipOdds(odds), emphasis: "points" },
  ]} onClose={onClose}>
    <section className={`${leaderboardStyles.roundBreakdown} ${teamStyles.teamRoundBreakdown}`}><header><span>Round Breakdown</span><small>Official team results</small></header>{roundRows.map(({ round, standing, state }) => <article className={teamStyles.teamRoundCard} data-state={state === "upcoming" ? "pending" : state} key={round.number}><header className={teamStyles.teamRoundHeader}><strong>{round.label} • {formatName(round.format)}</strong><StatusBadge status={state} /></header>{state === "upcoming" ? <p className={teamStyles.teamRoundPending}>Pending</p> : <div className={teamStyles.teamRoundMetrics}><span><small>Record</small><strong>{standing.record}</strong></span><span data-points="true"><small>Points</small><strong>{formatTeamPoints(standing.points)}</strong></span></div>}</article>)}</section>
  </LeaderboardDetailSheet>;
}

const RESULT_GROUPS = [["wins", "Wins"], ["ties", "Ties"], ["losses", "Losses"], ["inProgress", "In Progress"]];

function pointsLabel(value) {
  if (value === null || value === undefined) return "—";
  return `${formatMeaningfulNumber(value)} ${Number(value) === 1 ? "pt" : "pts"}`;
}

function TeamRoundDetailSheet({ team, round, standing, state, current, onClose }) {
  const recap = teamRoundRecap(round, team.side);
  const upcoming = state === "upcoming";
  return <LeaderboardDetailSheet
    title="Team Round Detail"
    identity={<TeamLeaderboardIdentity team={team} current={current} large />}
    context={{ primary: `${round.label} • ${formatName(round.format)}`, secondary: round.course?.name || "Course pending" }}
    status={state}
    metrics={[
      { label: "Round Rank", value: upcoming ? "—" : standing?.rank ?? "—" },
      { label: "Round Record", value: upcoming ? "Pending" : standing?.record || "—" },
      { label: "Round Points", value: upcoming ? "—" : formatMeaningfulNumber(standing?.points), emphasis: "points" },
      { label: "Matches Remaining", value: standing?.remaining ?? (round.matches || []).length },
    ]}
    onClose={onClose}
  >
    {upcoming ? <section className={teamStyles.teamRoundUpcoming}><strong>Upcoming</strong><p>Match results will appear once play begins.</p></section> : <section className={teamStyles.teamMatchResults}>
      <header><span>Match Results</span><small>Official team points</small></header>
      {RESULT_GROUPS.map(([key, label]) => recap.groups[key].length ? <section className={teamStyles.teamResultGroup} data-result={key} key={key}><h3>{label}</h3>{recap.groups[key].map((match) => <article className={teamStyles.teamMatchCard} key={match.id}>
        <header className={teamStyles.teamMatchIdentity}><small>{recap.singles ? "Golfer" : "Pairing"}</small><strong>{match.players.map((player) => player.name).join(" & ") || "Pairing pending"}</strong></header>
        <div className={teamStyles.teamMatchTotal}><small>Total Points</small><b>{pointsLabel(match.totalPoints)}</b></div>
        <section className={teamStyles.teamSegmentPoints}><small>Segment Points</small><div>{match.segments.map((segment) => <span key={segment.label}><small>{segment.label}</small><strong>{segment.points === null || segment.points === undefined ? "—" : formatMeaningfulNumber(segment.points)}</strong></span>)}</div></section>
      </article>)}</section> : null)}
    </section>}
  </LeaderboardDetailSheet>;
}

function Teams({ data, selectedRound, currentPlayer, snapshots }) {
  const standings = useMemo(() => teamStandings(data.rounds || [], data.tournament || {}, selectedRound), [data, selectedRound]);
  const overallStandings = useMemo(() => teamStandings(data.rounds || [], data.tournament || {}, "overall"), [data]);
  const [selectedSide, setSelectedSide] = useState("");
  const currentTeamSide = (data.leaderboard || []).find((row) => row.id === currentPlayer?.id)?.teamSide;
  const latestTeamSnapshot = useMemo(() => (snapshots || []).filter((snapshot) => Array.isArray(snapshot.teams) && snapshot.teams.length).slice().sort((left, right) => Number(left.phaseOrder || 0) - Number(right.phaseOrder || 0)).at(-1) || null, [snapshots]);
  const oddsBySide = useMemo(() => new Map((latestTeamSnapshot?.teams || []).map((team) => [Number(team.side), team.americanOdds])), [latestTeamSnapshot]);
  const selectedTeam = overallStandings.find((team) => String(team.side) === selectedSide);
  const selectedRoundModel = selectedRound === "overall" ? null : (data.rounds || []).find((round) => String(round.number) === String(selectedRound));
  const state = selectedRound === "overall" ? ((data.rounds || []).every((round) => teamRoundState(round) === "final") ? "final" : "live") : teamRoundState(selectedRoundModel);
  const overall = selectedRound === "overall";
  return <section className={styles.teams} aria-label="Team standings">
    <header className={teamStyles.teamBoardTitle}><span><small>{overall ? "Overall" : selectedRoundModel?.label}</small><strong>Team Leaderboard</strong></span>{overall ? null : <StatusBadge status={state} />}</header>
    <div className={`${styles.teamHeader} ${teamStyles.teamHeader}`} data-overall={overall || undefined}><span>Rank</span><span>Team</span><span>Record</span><span>Points</span>{overall ? <span>Odds</span> : null}</div>
    {standings.map((team) => {
      const currentTeam = Number(currentTeamSide) === Number(team.side);
      const pending = !overall && state === "upcoming";
      const odds = oddsBySide.has(Number(team.side)) ? oddsBySide.get(Number(team.side)) : null;
      return <button type="button" className={teamStyles.teamRow} data-overall={overall || undefined} data-current={currentTeam || undefined} onClick={() => setSelectedSide(String(team.side))} aria-label={`Open ${team.name} team summary${currentTeam ? ", your team" : ""}`} key={team.side}>
        <strong>{pending ? "—" : team.rank}</strong>
        <span><TeamMark filename={team.logo} name={team.name} size="large" /><span><TeamNameWithBadge name={team.name} current={currentTeam} /><small>{team.remaining} match{team.remaining === 1 ? "" : "es"} remaining</small></span></span>
        {pending ? <span className={teamStyles.teamPending}>Pending</span> : <><span>{team.record}</span><b>{formatTeamPoints(team.points)}</b></>}{overall ? <b>{odds === null ? "Pending" : formatChampionshipOdds(odds)}</b> : null}
      </button>;
    })}
    {selectedTeam ? <TeamDetailSheet team={selectedTeam} data={data} selectedRound={selectedRound} odds={oddsBySide.has(Number(selectedTeam.side)) ? oddsBySide.get(Number(selectedTeam.side)) : null} current={Number(currentTeamSide) === Number(selectedTeam.side)} onClose={() => setSelectedSide("")} /> : null}
  </section>;
}

const PREVIEW_ODDS_SCENARIOS = [
  { label: "Opening Championship Projection", phases: ["Pre-Tournament"] },
  { label: "Round 2 Pairings Projection", phases: ["After Round 1"] },
  { label: "Championship Outlook", phases: ["After Round 2"] },
  { label: "Championship Singles Projection", phases: ["Round 3 Pairings Announced"] },
  { label: "Tournament Recap", phases: ["Final Results"] },
];

function RecapMetric({ label, player, value }) {
  if (!player) return null;
  return <article><span>{label}</span><strong>{player.name}</strong><p>{value}</p></article>;
}

function TournamentRecapExperience({ recap, tournament, publicationTime, portrait, rankMark, selectedPlayerId, setSelectedPlayerId, previewSelector }) {
  const selected = recap.journeys.find((player) => String(player.id) === String(selectedPlayerId)) || null;
  const championNames = recap.champion.champions.map((team) => team.name).join(" and ");
  const pct = (value) => `${Number(value || 0).toFixed(1).replace(/\.0$/, "")}%`;
  const movement = (value, unit = "") => `${Number(value) > 0 ? "+" : ""}${Number(value || 0).toFixed(1).replace(/\.0$/, "")}${unit}`;
  const logo = tournament.logo ? tournamentLogo(tournament.logo) : tournamentLogo(`sandbagger-${tournament.year}`);
  return <section className={insightStyles.experience} aria-label="Tournament Recap">
    {previewSelector}
    <header className={`${insightStyles.hero} ${insightStyles.recapHero}`}><AssetImage src={logo} alt={`${tournament.name} logo`} className={insightStyles.recapLogo} fallbackClassName={insightStyles.recapLogoFallback} fallback="SBI" inferFallback={false} /><div><span>🏆 Champion</span><h2>{recap.champion.tied ? "Tournament Tied" : championNames}</h2><p>{tournament.dates}</p></div></header>
    <section className={insightStyles.recapScore} aria-label="Official tournament result"><div><span>Final Score</span><strong>{recap.champion.finalScore}</strong></div><div><span>Tournament MVP</span><strong>{recap.mvp?.name || "—"}</strong><small>{recap.mvp ? `${formatPlayerPoints(recap.mvp.points)} points` : "Official points leader"}</small></div><div><span>Winning Margin</span><strong>{recap.champion.tied ? "Tied" : `${recap.champion.winningMargin.toFixed(1).replace(/\.0$/, "")} pts`}</strong></div></section>
    <section className={insightStyles.recapStory}><span>Tournament Intelligence Story</span><p>{recap.story}</p></section>
    <section className={insightStyles.recapSection}><header><span>Projection Accuracy</span><h3>Opening projection vs. actual finish</h3></header><div className={insightStyles.recapMetrics}>
      <RecapMetric label="Opening Favorite" player={recap.accuracy.openingFavorite} value={`Finished ${finishLabel(recap.accuracy.openingFavorite?.actualRank)}`} />
      <RecapMetric label="Tournament MVP" player={recap.accuracy.mvpOpening ? recap.mvp : null} value={`${pct(recap.accuracy.mvpOpening?.openingProbability)} → ${finishLabel(recap.mvp?.rank)}`} />
      <RecapMetric label="Biggest Surprise" player={recap.accuracy.biggestSurprise} value={`Projected #${recap.accuracy.biggestSurprise?.openingRank} → ${finishLabel(recap.accuracy.biggestSurprise?.actualRank)}`} />
    </div></section>
    <section className={insightStyles.recapSection}><header><span>Biggest Movers</span><h3>Across all forward-looking projections</h3></header><div className={insightStyles.recapMetrics}>
      <RecapMetric label="Largest Rise" player={recap.movers.largestRise} value={`${movement(recap.movers.largestRise?.rankMovement)} positions`} />
      <RecapMetric label="Largest Fall" player={recap.movers.largestFall} value={`${movement(recap.movers.largestFall?.rankMovement)} positions`} />
      <RecapMetric label="Largest Probability Gain" player={recap.movers.largestProbabilityGain} value={movement(recap.movers.largestProbabilityGain?.probabilityMovement, "%")} />
      <RecapMetric label="Largest Probability Loss" player={recap.movers.largestProbabilityLoss} value={movement(recap.movers.largestProbabilityLoss?.probabilityMovement, "%")} />
    </div></section>
    {recap.captainImpact.length ? <section className={insightStyles.recapSection}><header><span>Captain Impact</span><h3>Championship Outlook → Championship Singles Projection</h3></header><div className={insightStyles.captainImpact}>{recap.captainImpact.map((team) => <article key={team.name}><strong>{team.name}</strong><p><span>{pct(team.before)}</span><i>→</i><span>{pct(team.after)}</span></p><b>{movement(team.change, "%")}</b><small>Captain Pairings</small></article>)}</div></section> : null}
    <section className={insightStyles.recapSection}><header><span>Model Accuracy</span><h3>How the Opening Championship Projection performed</h3></header><div className={insightStyles.recapMetrics}>
      <RecapMetric label="Opening Team Favorite" player={recap.modelAccuracy.openingTeamFavorite} value={`Finished ${finishLabel(recap.modelAccuracy.openingTeamFinished)}`} />
      <RecapMetric label="Closest Projection" player={recap.modelAccuracy.closestProjection} value={`${recap.modelAccuracy.closestProjection?.projectedFinish.toFixed(1)} projected • ${finishLabel(recap.modelAccuracy.closestProjection?.actualRank)} actual`} />
      <RecapMetric label="Largest Miss" player={recap.modelAccuracy.largestMiss} value={`${recap.modelAccuracy.largestMiss?.finishError.toFixed(1)} finishing positions`} />
      <RecapMetric label="Accuracy Summary" player={{ name: "Average finishing-position error" }} value={recap.modelAccuracy.meanFinishError === null ? "Not available" : recap.modelAccuracy.meanFinishError.toFixed(1)} />
    </div></section>
    <section className={`${insightStyles.board} ${insightStyles.recapJourneys}`} aria-label="Player projection journeys"><header><span>Projection Journey</span><h3>Every player’s path through tournament week</h3></header><div className={insightStyles.topPlayers}>{recap.journeys.map((player) => <button type="button" className={insightStyles.topPlayer} onClick={() => setSelectedPlayerId(String(player.id))} aria-label={`Open completed projection journey for ${player.name}`} key={player.id}><strong className={insightStyles.rank}>{rankMark(player.rank)}</strong>{portrait(player)}<b>{player.name}</b><div><p className={insightStyles.cardProbability}><small>Actual Finish</small><strong>{finishLabel(player.rank)}</strong></p><p><small>Final Points</small><strong>{formatPlayerPoints(player.points)}</strong></p></div></button>)}</div></section>
    <footer className={insightStyles.publication}><span>Publication Information</span><strong>Published: Tournament Recap</strong><small>{publicationTime}</small><p>Official completed tournament outcome. Championship Projections are now closed.</p></footer>
    {selected ? <div className={insightStyles.sheetLayer} role="presentation"><button type="button" className={insightStyles.sheetBackdrop} onClick={() => setSelectedPlayerId("")} aria-label="Close player projection details" /><section className={insightStyles.sheet} role="dialog" aria-modal="true" aria-labelledby="recap-player-name"><header><span>Completed Projection Journey</span><button type="button" onClick={() => setSelectedPlayerId("")} aria-label="Close player projection details">×</button></header><div className={insightStyles.sheetIdentity}>{portrait(selected, insightStyles.sheetPortrait)}<div><h3 id="recap-player-name">{selected.name}</h3><p>Actual finish: {finishLabel(selected.rank)} • {formatPlayerPoints(selected.points)} points</p></div></div><section className={insightStyles.history}><header><span>Projection Journey</span><p>Official published milestones</p></header><ol>{selected.milestones.map((milestone) => <li key={`${milestone.phase}-${milestone.publishedAt}`}><div><strong>{milestone.label}</strong><small>{milestone.phase === "Final Results" ? "Tournament Recap" : `Projected rank #${milestone.projectedRank}`}</small></div><span><b>{milestone.phase === "Final Results" ? finishLabel(selected.rank) : formatChampionshipOdds(milestone.americanOdds)}</b><strong>{milestone.phase === "Final Results" ? "Actual" : pct(milestone.probability)}</strong></span></li>)}<li><div><strong>Actual Finish</strong><small>Official tournament result</small></div><span><b>{finishLabel(selected.rank)}</b><strong>{formatPlayerPoints(selected.points)} pts</strong></span></li></ol></section></section></div> : null}
  </section>;
}

function Insights({ data, snapshots, derived = null, previewMode = false }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [previewPhase, setPreviewPhase] = useState("");
  const previewScenarios = useMemo(() => previewMode ? PREVIEW_ODDS_SCENARIOS.map((scenario) => ({
    ...scenario,
    snapshot: scenario.phases.map((phase) => (snapshots || []).find((item) => item.phase === phase)).find(Boolean),
  })).filter((scenario) => scenario.snapshot) : [], [previewMode, snapshots]);
  const effectivePreviewPhase = previewMode ? (previewPhase || previewScenarios.at(-1)?.snapshot.phase || "") : "";
  const selectedScenarioIndex = effectivePreviewPhase ? (snapshots || []).findIndex((snapshot) => snapshot.phase === effectivePreviewPhase) : -1;
  const presentedSnapshots = selectedScenarioIndex >= 0 ? snapshots.slice(0, selectedScenarioIndex + 1) : (snapshots || []);
  const canUseDerived = !effectivePreviewPhase || effectivePreviewPhase === snapshots?.at(-1)?.phase;
  const insights = useMemo(() => canUseDerived && derived?.projectionEditorial?.result?.insights
    ? derived.projectionEditorial.result.insights : publishedOddsInsights(presentedSnapshots), [canUseDerived, derived, presentedSnapshots]);
  const tournamentRecap = useMemo(() => canUseDerived && derived?.finalRecap?.result
    ? derived.finalRecap.result : buildTournamentRecapIntelligence({ snapshots: presentedSnapshots, tournament: data.tournament, leaderboard: data.leaderboard }), [canUseDerived, data.leaderboard, data.tournament, derived, presentedSnapshots]);
  const playerPhotos = useMemo(() => new Map((data.leaderboard || []).map((player) => [String(player.id), player.photo])), [data.leaderboard]);
  const playerTeams = useMemo(() => new Map((data.leaderboard || []).map((player) => [String(player.id), player.team])), [data.leaderboard]);
  const percent = (value) => `${Number(value || 0).toFixed(1).replace(/\.0$/, "")}%`;
  const publicationTime = insights.current?.publishedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(insights.current.publishedAt)) : "—";
  const trend = (player) => player?.change === null || player?.change === undefined
    ? <span className={insightStyles.initial}>First Projection</span>
    : <span className={player.change > 0 ? insightStyles.up : player.change < 0 ? insightStyles.down : insightStyles.neutral}>{player.change > 0 ? "▲ +" : player.change < 0 ? "▼ " : "— "}{player.change ? `${player.change.toFixed(1)}%` : "Even"}</span>;
  const portrait = (player, className = "") => <span className={`${insightStyles.portrait} ${className}`.trim()}><PlayerAvatar filename={playerPhotos.get(String(player.id))} name={player.name} fallbackClassName={insightStyles.portraitFallback} /></span>;
  const rankMark = (rank) => ["🥇", "🥈", "🥉"][rank - 1] || `#${rank}`;
  const selectedPlayer = insights.players.find((player) => String(player.id) === selectedPlayerId) || null;
  const selectedHistory = selectedPlayer ? projectionHistoryHighlights(publishedPlayerHistory(presentedSnapshots, selectedPlayerId)) : [];
  const storyline = canUseDerived && derived?.projectionEditorial?.result?.tournamentStory !== undefined
    ? derived.projectionEditorial.result.tournamentStory : tournamentProjectionStory({ current: insights.current, previous: insights.previous, playerTeams });
  const intelligenceStorylines = canUseDerived && Array.isArray(derived?.tournamentIntelligence?.result?.storylines)
    ? derived.tournamentIntelligence.result.storylines : tournamentIntelligenceStorylines({ snapshots: presentedSnapshots, playerTeams });
  useEffect(() => {
    if (!selectedPlayerId) return undefined;
    const close = (event) => { if (event.key === "Escape") setSelectedPlayerId(""); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedPlayerId]);

  if (snapshots === null) return <section className={insightStyles.experience} aria-busy="true"><div className={styles.empty}><strong>Loading Championship Odds…</strong><span>Retrieving the latest published tournament projection.</span></div></section>;
  if (!insights.current) return <section className={insightStyles.experience}><div className={styles.empty}><strong>Championship Odds</strong><span>Tournament projections will publish after official pairings are finalized.</span></div></section>;

  const previewSelector = previewMode && previewScenarios.length ? <section className={insightStyles.scenarioSelector} aria-label="Preview Odds Scenarios"><label><span>Preview Odds Scenario</span><select value={insights.current.phase} onChange={(event) => { setPreviewPhase(event.target.value); setSelectedPlayerId(""); }}>{previewScenarios.map((scenario) => <option value={scenario.snapshot.phase} key={scenario.label}>{scenario.label}</option>)}</select></label><p>Preview only · official published snapshots</p></section> : null;

  if (isTournamentRecapPhase(insights.current.phase)) {
    return tournamentRecap ? <TournamentRecapExperience recap={tournamentRecap} tournament={data.tournament || {}} publicationTime={publicationTime} portrait={portrait} rankMark={rankMark} selectedPlayerId={selectedPlayerId} setSelectedPlayerId={setSelectedPlayerId} previewSelector={previewSelector} /> : <section className={insightStyles.experience}><div className={styles.empty}><strong>Tournament Recap</strong><span>Official tournament results are being finalized.</span></div></section>;
  }

  return <section className={insightStyles.experience} aria-label="Championship Odds">
    {previewSelector}
    <header className={insightStyles.hero}>
      <span>Published Tournament Projection</span><h2>🏆 Championship Odds</h2>
      <div><p><small>Projection Milestone</small><strong>{projectionPresentationLabel(insights.current.phase)}</strong></p><p><small>Published</small><strong>{publicationTime}</strong></p></div>
    </header>
    {storyline ? <section className={insightStyles.storyline} aria-label="Projection Story"><span>Projection Story</span><p>{storyline}</p></section> : null}
    <section className={insightStyles.favorite} aria-label="Tournament Favorite">
      <span>🏆 Tournament Favorite</span>{portrait(insights.favorite, insightStyles.favoritePortrait)}<h3>{insights.favorite.name}</h3>
      <div><p className={insightStyles.favoriteProbability}><small>Probability</small><strong>{percent(insights.favorite.probability)}</strong></p><p><small>American Odds</small><strong>{formatChampionshipOdds(insights.favorite.americanOdds)}</strong></p></div>
    </section>
    {insights.movers && (insights.movers.riser || insights.movers.faller) ? <section className={insightStyles.movers} aria-label="Biggest Movers">
      <header><span>Biggest Movers</span><h3>Since the previous published projection</h3></header><div>
        {[['Largest Positive Movement', insights.movers.riser], ['Largest Negative Movement', insights.movers.faller]].map(([label, player]) => player ? <article key={label}><span>{label}</span><strong>{player.name}</strong><dl><div><dt>Rank</dt><dd>{player.previous ? `${insights.previous.players.findIndex((entry) => String(entry.id) === String(player.id)) + 1} → ${player.rank}` : `#${player.rank}`}</dd></div><div><dt>Probability</dt><dd>{percent(player.previous?.probability)} → {percent(player.probability)}</dd></div><div><dt>Odds</dt><dd>{formatChampionshipOdds(player.previous?.americanOdds)} → {formatChampionshipOdds(player.americanOdds)}</dd></div></dl>{trend(player)}</article> : null)}
      </div></section> : <section className={`${insightStyles.movers} ${insightStyles.moversEmpty}`} aria-label="Biggest Movers"><span>Biggest Movers</span><p>Movement tracking begins after the next published Championship Projection.</p></section>}
    <section className={insightStyles.board} aria-label="Full Odds Board">
      <header><span>Championship Odds Board</span><h3>Published player projections</h3></header>
      <div className={insightStyles.topPlayers}>{insights.players.slice(0, 10).map((player) => <button type="button" className={insightStyles.topPlayer} data-podium={player.rank <= 3 ? player.rank : undefined} onClick={() => setSelectedPlayerId(String(player.id))} aria-label={`Open projection history for ${player.name}`} key={player.id}>
        <strong className={insightStyles.rank} data-medal={player.rank <= 3 || undefined}>{rankMark(player.rank)}</strong>{portrait(player)}<b>{player.name}</b>
        <div><p className={insightStyles.cardProbability}><small>Probability</small><strong>{percent(player.probability)}</strong></p><p><small>American Odds</small><strong>{formatChampionshipOdds(player.americanOdds)}</strong></p></div>
        <p className={insightStyles.cardTrend}><small>Trend</small>{trend(player)}</p>
      </button>)}</div>
      {insights.players.length > 10 ? <div className={insightStyles.remaining}><div className={insightStyles.remainingTitle}>Remaining Field</div><div className={insightStyles.row} data-header="true"><span>Rank</span><span>Player</span><span>Probability</span><span>Odds</span><span>Trend</span></div>
        {insights.players.slice(10).map((player) => <button type="button" className={insightStyles.row} onClick={() => setSelectedPlayerId(String(player.id))} aria-label={`Open projection history for ${player.name}`} key={player.id}><strong>{player.rank}</strong><b>{player.name}</b><span>{percent(player.probability)}</span><span>{formatChampionshipOdds(player.americanOdds)}</span>{trend(player)}</button>)}</div> : null}
    </section>
    <footer className={insightStyles.publication}><span>Publication Information</span><strong>Published: {projectionPresentationLabel(insights.current.phase)}</strong><small>{publicationTime}</small><p>Official Sandbagger Odds Engine projection. Not live odds.</p></footer>
    <TournamentIntelligenceStorylines stories={intelligenceStorylines} />
    {selectedPlayer ? <div className={insightStyles.sheetLayer} role="presentation"><button type="button" className={insightStyles.sheetBackdrop} onClick={() => setSelectedPlayerId("")} aria-label="Close player projection details" /><section className={insightStyles.sheet} role="dialog" aria-modal="true" aria-labelledby="projection-player-name">
      <header><span>Player Projection</span><button type="button" onClick={() => setSelectedPlayerId("")} aria-label="Close player projection details">×</button></header>
      <div className={insightStyles.sheetIdentity}>{portrait(selectedPlayer, insightStyles.sheetPortrait)}<div><h3 id="projection-player-name">{selectedPlayer.name}</h3><p>Current Championship Projection</p></div></div>
      <div className={insightStyles.sheetSummary}><p><small>Rank</small><strong>#{selectedPlayer.rank}</strong></p><p><small>Probability</small><strong>{percent(selectedPlayer.probability)}</strong></p><p><small>American Odds</small><strong>{formatChampionshipOdds(selectedPlayer.americanOdds)}</strong></p><p><small>Trend</small>{trend(selectedPlayer)}</p></div>
      <p className={insightStyles.playerSummary}>{playerProjectionSummary(selectedPlayer.name, selectedHistory)}</p>
      <section className={insightStyles.history}><header><span>Projection History</span><p>Official published snapshots</p></header>
        {selectedHistory.length > 1 ? <ol>{selectedHistory.map(({ phase, publishedAt, americanOdds, probability: projectedProbability, highlights }) => <li key={`${phase}-${publishedAt}`}><div><strong>{phase}</strong><small>{publishedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(publishedAt)) : "Published"}</small>{highlights.length ? <em>{highlights.join(" · ")}</em> : null}</div><span><b>{formatChampionshipOdds(americanOdds)}</b><strong>{percent(projectedProbability)}</strong></span></li>)}</ol> : <p className={insightStyles.firstHistory}>This is the first published Championship Projection.</p>}
      </section>
    </section></div> : null}
  </section>;
}

function NetSkinsBoard({ data, currentPlayer }) {
  const rounds = data.netSkins?.rounds || [];
  const [selectedRound, setSelectedRound] = useState(String(rounds[0]?.round || ""));
  const [selectedTeamId, setSelectedTeamId] = useState("");
  useEffect(() => {
    if (!rounds.some((round) => String(round.round) === selectedRound)) setSelectedRound(String(rounds[0]?.round || ""));
  }, [rounds, selectedRound]);
  const round = rounds.find((item) => String(item.round) === selectedRound);
  const selectedTeam = round?.leaderboard.find((item) => item.id === selectedTeamId);
  const players = new Map((data.players || []).map((player) => [String(player.id), player]));
  const teamMembers = (row) => (row.playerIds || []).map((id) => players.get(String(id)) || { id, name: id });
  const teamName = (row) => teamMembers(row).map((player) => player.name).join(" & ");
  const scoreName = (result) => {
    if (!Number.isFinite(result.gross) || !Number.isFinite(result.par)) return `Net ${result.net}`;
    const relative = result.gross - result.par;
    return relative <= -2 ? "Eagle" : relative === -1 ? "Birdie" : relative === 0 ? "Par" : relative === 1 ? "Bogey" : `${relative > 0 ? "+" : ""}${relative}`;
  };
  const topSkinCount = Math.max(0, ...(round?.leaderboard || []).map((row) => row.skinsWon));
  const leaders = round?.leaderboard.filter((row) => topSkinCount > 0 && row.skinsWon === topSkinCount) || [];
  const isScramble = round?.format === "SC";
  const participantNoun = isScramble ? "team" : "golfer";
  const largestSkin = round?.skins.length ? round.skins.reduce((best, skin) => skin.skinValue > best.skinValue ? skin : best, round.skins[0]) : null;
  const mostValuableHole = largestSkin ? round?.leaderboard.flatMap((row) => row.holeResults.map((result) => ({ ...result, name: teamName(row) }))).find((result) => result.wonSkin && result.hole === largestSkin.hole) : null;
  const competitionStage = round?.complete ? "complete" : round?.completedHoles > 0 ? "live" : "opening";
  const holderCount = round?.leaderboard.filter((row) => row.skinsWon > 0).length || 0;
  const skinHolders = round?.skinsAwarded ? round.leaderboard.filter((row) => row.skinsWon > 0) : [];
  const waitingField = [...(round?.leaderboard || []).filter((row) => !round.skinsAwarded || row.skinsWon === 0)].sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const rankLabel = (row) => {
    const placement = Number(String(row.displayRank || "").match(/\d+/)?.[0]);
    const medal = placement === 1 ? "🥇 " : placement === 2 ? "🥈 " : placement === 3 ? "🥉 " : "";
    return `${medal}${row.displayRank || ""}`;
  };
  const renderEntry = (row, ranked = false) => {
    const isCurrent = Boolean(currentPlayer?.id && row.playerIds?.includes(currentPlayer.id));
    return <div className={skinsStyles.entry} data-current={isCurrent || undefined} key={`${row.id}-${row.skinsWon}-${row.totalWinnings}`}>
      <button type="button" className={skinsStyles.row} aria-label={`Open details for ${teamName(row)}, ${row.skinsWon} skins, ${currency(row.totalWinnings)} winnings${isCurrent ? ", your entry" : ""}`} onClick={() => setSelectedTeamId(row.id)}>
        <strong>{ranked ? rankLabel(row) : ""}</strong>{isScramble ? <ScrambleTeamIdentity playerIds={row.playerIds} players={data.players || []} /> : <span className={skinsStyles.teamIdentity}><span className={skinsStyles.avatars}>{teamMembers(row).map((player) => <span key={player.id}><PlayerAvatar player={player} fallbackClassName={skinsStyles.avatarFallback} /></span>)}</span><b>{teamMembers(row).map((player) => <span key={player.id}>{player.name}</span>)}</b></span>}<span data-animate="true">{row.skinsWon}</span><strong data-animate="true">{currency(row.totalWinnings)}</strong>
      </button>
    </div>;
  };
  const heroMetrics = round ? competitionStage === "opening" ? [
    ["Round Pot", currency(round.pot)],
    ["Entrants", `${round.eligibleCount} ${round.format === "SC" ? (round.eligibleCount === 1 ? "Team" : "Teams") : (round.eligibleCount === 1 ? "Golfer" : "Golfers")}`],
    ["Eligible Holes", "18"],
    ["Competition Status", round.eligibleCount ? "Ready for Play" : "Awaiting Field"],
  ] : competitionStage === "live" ? [
    ["Round Pot", currency(round.pot)],
    ["Current Skin Value", round.skinsAwarded ? currency(round.skinValue) : "Pending"],
    ["Skins Awarded", String(round.skinsAwarded)],
    ["Remaining Eligible Holes", String(Math.max(0, 18 - round.completedHoles))],
  ] : [
    ["Round Pot", currency(round.pot)],
    ["Final Skin Value", round.skinsAwarded ? currency(round.skinValue) : "—"],
    ["Skins Awarded", String(round.skinsAwarded)],
    [`${isScramble ? "Teams" : "Golfers"} Holding Skins`, String(holderCount)],
  ] : [];
  const stories = round ? [
    leaders.length ? { label: "Current Skin Leaders", copy: leaders.length === 1 ? `${teamName(leaders[0])} leads with ${leaders[0].skinsWon} ${leaders[0].skinsWon === 1 ? "skin" : "skins"}.` : leaders.length === 2 ? `${leaders.map(teamName).join(" and ")} share the lead with ${topSkinCount} ${topSkinCount === 1 ? "skin" : "skins"}.` : `${leaders.length} ${isScramble ? "teams" : "golfers"} share the lead with ${topSkinCount} ${topSkinCount === 1 ? "skin" : "skins"}.` } : null,
    mostValuableHole ? { label: "Most Valuable Hole", copy: `${mostValuableHole.name}'s ${scoreName(mostValuableHole).toLowerCase()} on Hole ${mostValuableHole.hole} is worth ${currency(largestSkin.skinValue)}.` } : null,
    largestSkin && !mostValuableHole ? { label: "Largest Current Skin", copy: `Hole ${largestSkin.hole} carries the largest current skin at ${currency(largestSkin.skinValue)}.` } : null,
    round.completedHoles > 0 && round.completedHoles < 18 ? { label: "Remaining Skin Opportunities", copy: `${18 - round.completedHoles} ${18 - round.completedHoles === 1 ? "skin opportunity remains" : "skin opportunities remain"}.` } : null,
  ].filter(Boolean) : [];
  if (!rounds.length) return <section className={skinsStyles.board}><div className={styles.empty}><strong>Net Skins have not started yet.</strong><span>Competition details will appear when the tournament field is ready.</span></div></section>;
  return <section className={skinsStyles.experience} aria-label="Net Skins standings">
    <nav className={styles.roundSelector} aria-label="Net Skins round">
      {rounds.map((item) => <button type="button" aria-pressed={String(item.round) === selectedRound} onClick={() => { setSelectedRound(String(item.round)); setSelectedTeamId(""); }} key={item.round}>Round {item.round}</button>)}
    </nav>
    <section className={skinsStyles.board}>
      <header><span><small>Net Skins Competition</small><h2>Round {round.round} Net Skins</h2></span><b>{round.format === "SC" ? "Scramble Teams" : "Individual Golfers"}</b></header>
      <div className={skinsStyles.summary} data-stage={competitionStage}>{heroMetrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {!round.leaderboard.length ? <div className={styles.empty}><strong>No eligible participants yet.</strong><span>The leaderboard will calculate automatically from official net scores.</span></div> : <div>
        <div className={skinsStyles.row} data-header="true"><span>{round.skinsAwarded ? "Rank" : ""}</span><span>{round.format === "SC" ? "Team" : "Golfer"}</span><span>Skins</span><span>Current Winnings</span></div>
        {skinHolders.map((row) => renderEntry(row, true))}
        {skinHolders.length && waitingField.length ? <div className={skinsStyles.noSkinsDivider}><span>No Skins Yet</span></div> : null}
        {waitingField.map((row) => renderEntry(row))}
      </div>}
      {!round.complete ? <p className={skinsStyles.note}><strong>Waiting for official scores.</strong><span>Net Skins will begin calculating as eligible {isScramble ? "teams" : "golfers"} complete each hole.</span></p> : null}
      {round.complete && !round.skinsAwarded ? <p className={skinsStyles.note}>No skins awarded. Tied low-net scores do not carry over.</p> : null}
    </section>
    {stories.length ? <section className={skinsStyles.stories}><header><small>Tournament Intelligence</small><h3>{isScramble ? "Scramble" : round.format === "SI" ? "Singles" : "Best Ball"} Net Skins Storylines</h3></header><div>{stories.map((story) => <article key={story.label}><span aria-hidden="true">{story.label === "Remaining Skin Opportunities" ? "⛳" : story.label === "Most Valuable Hole" ? "◆" : "🏆"}</span><p><small>{story.label}</small><strong>{story.copy}</strong></p></article>)}</div></section> : null}
    {selectedTeam ? <div className={skinsStyles.sheetLayer} role="presentation"><button type="button" className={skinsStyles.backdrop} onClick={() => setSelectedTeamId("")} aria-label="Close team details" /><section className={skinsStyles.sheet} role="dialog" aria-modal="true" aria-labelledby="skins-team-name"><header><span>{isScramble ? "Scramble" : round.format === "SI" ? "Singles" : "Best Ball"} Net Skins</span><button type="button" onClick={() => setSelectedTeamId("")} aria-label="Close team details">×</button></header><div className={skinsStyles.sheetIdentity}>{isScramble ? <div id="skins-team-name"><ScrambleTeamIdentity playerIds={selectedTeam.playerIds} players={data.players || []} large /></div> : <><div className={skinsStyles.avatars}>{teamMembers(selectedTeam).map((player) => <span key={player.id}><PlayerAvatar player={player} fallbackClassName={skinsStyles.avatarFallback} /></span>)}</div><div><small>Golfer</small><h3 id="skins-team-name">{teamName(selectedTeam)}</h3></div></>}</div><section className={skinsStyles.sheetMetrics} data-winning={selectedTeam.skinsWon > 0 || undefined} aria-label="Current competition summary"><p><small><i className={skinsStyles.skinCoin} aria-hidden="true">S</i> Current Skins</small><strong>{selectedTeam.skinsWon}</strong></p><p><small>Current Winnings</small><strong>{currency(selectedTeam.totalWinnings)}</strong></p><p><small>Winning {selectedTeam.winningHoles.length === 1 ? "Hole" : "Holes"}</small><strong>{selectedTeam.winningHoles.length ? selectedTeam.winningHoles.map((skin) => skin.hole).join(", ") : "None yet"}</strong></p><p><small>Eligible Status</small><strong>Eligible</strong></p></section><section className={skinsStyles.holeResults}><header><small>Hole-by-Hole Net Skins Results</small><strong>{selectedTeam.holeResults.length} official</strong></header>{selectedTeam.holeResults.length ? selectedTeam.holeResults.map((result) => { const resultState = result.wonSkin ? "won" : result.tiedLow ? "tie" : "none"; return <article key={result.hole} data-result={resultState}><span><strong>Hole {result.hole}</strong><small>{scoreName(result)} · Net {result.net}</small></span><b className={skinsStyles.resultBadge} data-result={resultState}>{result.wonSkin ? "🟢 Won Skin" : result.tiedLow ? "🟡 Lost Skin (Tie)" : "⚪ No Skin"}</b></article>; }) : <p>Hole results will appear as official scores arrive.</p>}</section></section></div> : null}
  </section>;
}

export default function LeaderboardsDashboard({
  initialData,
  initialCurrentPlayer = null,
  loadError,
  previewMode = false,
  coreReadSource = "google",
  coreReadUrl = "/api/live",
  secondaryReadUrl = "/api/live",
  onConfirmedCore,
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [currentPlayer, setCurrentPlayer] = useState(initialCurrentPlayer);
  const [oddsSnapshots, setOddsSnapshots] = useState(null);
  const [intelligenceDerived, setIntelligenceDerived] = useState(null);
  const [secondaryData, setSecondaryData] = useState(null);
  const [secondaryState, setSecondaryState] = useState("idle");
  const [refreshState, setRefreshState] = useState(initialData ? "current" : "refreshing");
  const pending = useRef(null);
  const secondaryPending = useRef(null);
  const lastConfirmedAt = useRef(Date.now());
  const navigationStartedAt = useRef(null);
  const supabaseCore = coreReadSource === "supabase";
  const roundValues = useMemo(() => new Set((data?.rounds || []).map((round) => String(round.number))), [data?.rounds]);
  const selectionFrom = useCallback((params) => ({
    tab: normalizeLeaderboardModule(params.get("tab")),
    round: roundValues.has(params.get("round")) ? params.get("round") : "overall",
    metric: PLAYER_METRICS.some(([key]) => key === params.get("metric")) ? params.get("metric") : "points",
  }), [roundValues]);
  const [selection, setSelection] = useState(() => selectionFrom(searchParams));
  const { tab, round: selectedRound, metric } = selection;
  useEffect(() => {
    if (!data?.tournament?.year || oddsSnapshots !== null || !["teams", "insights"].includes(tab)) return undefined;
    const controller = new AbortController();
    const startedAt = performance.now();
    fetch(`/api/leaderboards/insights?year=${encodeURIComponent(data.tournament.year)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Odds unavailable");
        return { payload: await response.json(), response };
      })
      .then(({ payload, response }) => {
        setOddsSnapshots(Array.isArray(payload.snapshots) ? payload.snapshots : []);
        setIntelligenceDerived(payload.derived || null);
        const durationMs = performance.now() - startedAt;
        recordParticipantAuthDiagnostic("PUBLISHED_ODDS_MODULE_USABLE", { routeTo: "/live?view=leaderboards&tab=insights", durationMs });
        if (previewMode) console.info("Published Odds module timing", {
          durationMs: Math.round(durationMs),
          source: response.headers.get("x-published-odds-read-source") || "unknown",
          googleRequests: Number(response.headers.get("x-published-odds-google-requests") || 0),
          serverTiming: response.headers.get("server-timing") || "",
          fingerprint: response.headers.get("x-published-odds-fingerprint") || "",
        });
        flushParticipantAuthDiagnostics().catch(() => null);
      })
      .catch((error) => { if (error.name !== "AbortError") setOddsSnapshots([]); });
    return () => controller.abort();
  }, [data?.tournament?.year, oddsSnapshots, previewMode, tab]);
  const updateQuery = useCallback((changes) => {
    const params = new URLSearchParams(typeof window === "undefined" ? searchParams.toString() : window.location.search);
    params.set("view", "leaderboards");
    Object.entries(changes).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    if (changes.round && changes.round !== selectedRound) navigationStartedAt.current = { from: selectedRound, to: changes.round, startedAt: performance.now() };
    setSelection(selectionFrom(params));
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname, searchParams, selectedRound, selectionFrom]);
  useEffect(() => setSelection(selectionFrom(searchParams)), [searchParams, selectionFrom]);
  useEffect(() => {
    const transition = navigationStartedAt.current;
    if (!transition || transition.to !== selectedRound) return;
    const frame = window.requestAnimationFrame(() => {
      if (previewMode) console.info("Leaderboard navigation performance", {
        transition: `${transition.from} → ${transition.to}`,
        tapToRenderMs: Math.round((performance.now() - transition.startedAt) * 10) / 10,
        apiRequests: 0,
        googleSheetsRequests: 0,
        cache: "in-memory hit",
        normalizationMs: 0,
        serverNavigationMs: 0,
        lazyChunkLoadingMs: 0,
      });
      navigationStartedAt.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewMode, selectedRound]);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setRefreshState("refreshing");
    pending.current = fetchWithTransientRetry(coreReadUrl, { cache: "no-store", credentials: "same-origin" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || "Unable to refresh standings.");
      setData(payload.data);
      if (payload.player) setCurrentPlayer(payload.player);
      lastConfirmedAt.current = Date.now();
      onConfirmedCore?.(payload.data, payload.player);
      setRefreshState("current");
    }).catch(() => setRefreshState("error")).finally(() => { pending.current = null; });
    return pending.current;
  }, [coreReadUrl, onConfirmedCore]);

  const loadSecondary = useCallback(() => {
    if (!supabaseCore || secondaryPending.current || secondaryData) return secondaryPending.current;
    setSecondaryState("loading");
    secondaryPending.current = fetchWithTransientRetry(secondaryReadUrl, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || "Secondary standings are unavailable.");
      setSecondaryData(payload.data);
      setSecondaryState("ready");
    }).catch(() => setSecondaryState("error")).finally(() => { secondaryPending.current = null; });
    return secondaryPending.current;
  }, [secondaryData, secondaryReadUrl, supabaseCore]);

  useEffect(() => {
    if (tab === "skins") loadSecondary();
  }, [loadSecondary, tab]);

  useEffect(() => {
    if (!supabaseCore) {
      fetch("/api/player-passport/session", { cache: "no-store" }).then(async (response) => response.ok ? (await response.json()).player : null).then(setCurrentPlayer).catch(() => {});
    }
    const poll = () => { if (document.visibilityState === "visible") refresh(); };
    const focus = () => { if (Date.now() - lastConfirmedAt.current >= 10_000) poll(); };
    const timer = window.setInterval(poll, supabaseCore ? 30_000 : 45_000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh, supabaseCore]);
  const tournament = data?.tournament;
  if (!tournament) return <section className={styles.page}><div className={styles.empty} role="status">
    <strong>{refreshState === "refreshing" ? "Preparing Tournament…" : "Tournament data is temporarily unavailable."}</strong>
    <span>{refreshState === "refreshing" ? "Please wait while tournament data is refreshed." : "Automatic recovery could not be completed."}</span>
    {refreshState !== "refreshing" ? <button type="button" onClick={refresh}>Retry</button> : null}
  </div></section>;
  return <section className={styles.page}>
    <TournamentIdentityHeader variant="hero" year={tournament.year} name={tournament.name || "Sandbagger Invitational"} location={tournament.location || "Location TBA"} logo={tournament.logo} status={tournament.status} />
    <header className={styles.pageTitle}><span>Leaderboards</span><h1>Standings</h1><p>Player, team, round standings, and Championship projections.</p><small role="status" aria-live="polite">{refreshState === "refreshing" ? "Updating standings…" : refreshState === "error" ? "Unable to refresh • showing last confirmed data" : "Official tournament data"}</small></header>
    <nav className={`${styles.tabs} ${skinsStyles.tabs}`} aria-label="Leaderboard category">{LEADERBOARD_MODULES.map(({ value, label }) => <button type="button" aria-pressed={tab === value} onClick={() => updateQuery({ tab: value })} key={value}>{label}</button>)}</nav>
    {!["insights", "skins"].includes(tab) ? <Controls rounds={data.rounds || []} selectedRound={selectedRound} onRound={(round) => updateQuery({ round })} /> : null}
    {tab === "players" && selectedRound === "overall" ? <OverallPlayers data={data} currentPlayer={currentPlayer} metric={metric} setMetric={(value) => updateQuery({ metric: value })} /> : null}
    {tab === "players" && selectedRound !== "overall" ? <RoundPlayers data={data} selectedRound={selectedRound} currentPlayer={currentPlayer} /> : null}
    {tab === "teams" ? <Teams data={data} selectedRound={selectedRound} currentPlayer={currentPlayer} snapshots={oddsSnapshots} /> : null}
    {tab === "skins" && (!supabaseCore || secondaryData) ? <NetSkinsBoard data={secondaryData ? { ...data, ...secondaryData } : data} currentPlayer={currentPlayer} /> : null}
    {tab === "skins" && supabaseCore && !secondaryData ? <section className={skinsStyles.board}><div className={styles.empty} role="status">
      <strong>{secondaryState === "error" ? "Net Skins are temporarily unavailable." : "Loading Net Skins…"}</strong>
      <span>{secondaryState === "error" ? "Core team and player standings remain available." : "Retrieving the independently published competition module."}</span>
      {secondaryState === "error" ? <button type="button" onClick={loadSecondary}>Try again</button> : null}
    </div></section> : null}
    {tab === "insights" ? <Insights data={data} snapshots={oddsSnapshots} derived={intelligenceDerived} previewMode={previewMode} /> : null}
  </section>;
}
