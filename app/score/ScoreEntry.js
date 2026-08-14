"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { finalizedMatchResult, formatLiveMatchResult, formatOfficialMatchResult } from "../../lib/match-result.js";
import { getStrokesOnHole } from "../../lib/scorecard-net.js";
import { runningMatchStatusAtHole, scoringProgress } from "../../lib/scoring-experience.js";
import { fetchWithTransientRetry } from "../../lib/transient-fetch.js";
import { grossScoresFromCell, normalizeLiveScoreInput } from "../../lib/live-score-values.js";
import { clearParticipantInitializationCache, readParticipantInitializationCache, writeParticipantInitializationCache } from "../../lib/participant-initialization-cache.js";
import { actionableScoringEntries, createIndexedDbScoringStore, createScoringSyncQueue, participantScoringSyncIssue, sameGrossScores, scoringFinalizationReview, scoringSyncIssueKind, scoringSyncSummary } from "../../lib/scoring-sync-queue.js";
import { createIndexedDbScoringDiagnosticsStore } from "../../lib/scoring-client-diagnostics.js";
import { applyParticipantFinalizationResult } from "../../lib/scoring-finalization-state.js";
import { buildScoringSlots, nextScoringSlotIndex, scoreFromKeypad, scoringKeypadActionLabel } from "../../lib/scoring-keypad.js";
import StatusBadge from "../StatusBadge";
import TournamentIdentityHeader from "../TournamentIdentityHeader";
import MyMatchDashboard from "./MyMatchDashboard";
import AlertSheet from "../ui/AlertSheet";
import ScoringKeypad from "./ScoringKeypad";
import ScoringSyncIndicator from "./ScoringSyncIndicator";
import styles from "./score.module.css";

const jsonScores = grossScoresFromCell;
function playerIds(match, side) {
  return [match[`Team ${side} Player 1`], match[`Team ${side} Player 2`]].filter(Boolean);
}

function strokeDots(count) {
  return count > 0 ? "•".repeat(count) : "";
}

function grossAt(score, side, index) {
  return jsonScores(score?.[`Team ${side} Gross Scores`])?.[index] ?? "";
}

function timingLabel(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} ms` : "—";
}

const SCORING_DIAGNOSTICS_OPT_IN = "sbi-preview-scoring-diagnostics-enabled";

function scoringDiagnosticsOptIn(localFirstEnabled) {
  if (!localFirstEnabled || typeof window === "undefined") return false;
  try {
    const requested = new URLSearchParams(window.location.search).get("scoringDiagnostics") === "1";
    if (requested) window.localStorage.setItem(SCORING_DIAGNOSTICS_OPT_IN, "true");
    return requested || window.localStorage.getItem(SCORING_DIAGNOSTICS_OPT_IN) === "true";
  } catch {
    return new URLSearchParams(window.location.search).get("scoringDiagnostics") === "1";
  }
}

function holeWinnerMark(score, teamNames) {
  if (score?.["Hole Winner"] === "Team 1") return teamNames[1] || "Team 1";
  if (score?.["Hole Winner"] === "Team 2") return teamNames[2] || "Team 2";
  return score?.["Hole Winner"] === "Halved" ? "—" : "";
}

function compactTeamName(value) {
  const name = String(value || "").trim().replace(/^the\s+/i, "");
  return name.split(/\s+and\s+/i)[0] || name;
}

function compactHoleWinnerMark(score, teamNames) {
  if (score?.["Hole Winner"] === "Team 1") return compactTeamName(teamNames[1] || "Team 1");
  if (score?.["Hole Winner"] === "Team 2") return compactTeamName(teamNames[2] || "Team 2");
  return "—";
}

function finalResultSummary(result, teamNames) {
  if (/^halved$/i.test(String(result || "").trim())) return "Halved";
  let notation = formatOfficialMatchResult(result);
  for (const name of [teamNames[1], teamNames[2]]) {
    if (name && notation.toLowerCase().startsWith(String(name).toLowerCase())) {
      notation = notation.slice(String(name).length).trim();
      break;
    }
  }
  if (!notation) return "Final";
  if (/^won\b/i.test(notation)) return notation.replace(/^won\b/i, "Won");
  return `Won ${notation}`;
}

function ScorecardCell({ readOnly, disabled, onEdit, children, label }) {
  if (readOnly) return <span aria-label={label}>{children}</span>;
  return <button type="button" disabled={disabled} onClick={onEdit} aria-label={label}>{children}</button>;
}

export default function ScoreEntry({ dashboardOnly = false, localFirstEnabled = false, participantIdentityAuthority = "passport" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [matchOptions, setMatchOptions] = useState([]);
  const [data, setData] = useState(null);
  const [holeNumber, setHoleNumber] = useState(1);
  const [gross, setGross] = useState({ team1: [], team2: [] });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pendingHoleNavigation, setPendingHoleNavigation] = useState(null);
  const [pendingExit, setPendingExit] = useState(false);
  const [pendingReview, setPendingReview] = useState(false);
  const [pendingCorrectionSave, setPendingCorrectionSave] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [syncFeedback, setSyncFeedback] = useState({ state: "idle", text: "" });
  const [restoring, setRestoring] = useState(true);
  const [passportPlayer, setPassportPlayer] = useState(null);
  const [passportMatches, setPassportMatches] = useState([]);
  const [passportTournament, setPassportTournament] = useState(null);
  const matchOpenSequence = useRef(0);
  const matchOpenController = useRef(null);
  const [passportState, setPassportState] = useState("loading");
  const [previewMode, setPreviewMode] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem("sbi-preview-session") === "true"
  );
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const saveInFlight = useRef(false);
  const syncQueue = useRef(null);
  const scoringStore = useRef(null);
  const [syncEntries, setSyncEntries] = useState([]);
  const [syncReady, setSyncReady] = useState(!localFirstEnabled);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [scoringDiagnosticsEnabled] = useState(() => scoringDiagnosticsOptIn(localFirstEnabled));
  const [scoringTimingSamples, setScoringTimingSamples] = useState([]);
  const scoringDiagnosticsStore = useRef(null);
  const supabaseParticipantIdentity = participantIdentityAuthority === "supabase";

  const durableScoringStore = () => {
    if (!scoringStore.current) scoringStore.current = createIndexedDbScoringStore();
    return scoringStore.current;
  };

  const restoreLocalEntries = async (matchId) => {
    if (!localFirstEnabled || !matchId) return [];
    setSyncReady(false);
    const entries = (await durableScoringStore().list())
      .filter((entry) => entry.matchId === String(matchId) && entry.status !== "confirmed")
      .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
    setSyncEntries(entries);
    return entries;
  };

  const uploadScoringTiming = async (sample) => {
    const response = await fetch("/api/scoring/diagnostics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sample),
      keepalive: true,
    });
    if (!response.ok) throw new Error("Preview scoring diagnostics upload was not accepted.");
  };

  const recordScoringTiming = async (sample) => {
    if (!scoringDiagnosticsEnabled) return;
    try {
      if (!scoringDiagnosticsStore.current) scoringDiagnosticsStore.current = createIndexedDbScoringDiagnosticsStore();
      const persisted = await scoringDiagnosticsStore.current.upsert(sample);
      setScoringTimingSamples((current) => [...current.filter((item) => item.id !== persisted.id), persisted].slice(-25));
      uploadScoringTiming(persisted).catch(() => {});
    } catch {}
  };

  useEffect(() => {
    if (!scoringDiagnosticsEnabled) return;
    if (!scoringDiagnosticsStore.current) scoringDiagnosticsStore.current = createIndexedDbScoringDiagnosticsStore();
    scoringDiagnosticsStore.current.list()
      .then((samples) => {
        const retained = samples.slice(-25);
        setScoringTimingSamples(retained);
        retained.forEach((sample) => uploadScoringTiming(sample).catch(() => {}));
      })
      .catch(() => {});
  }, [scoringDiagnosticsEnabled]);

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The scoring request failed.");
    return payload;
  };

  const loadMatch = async () => {
    const response = await fetch("/api/scoring/current", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load the match.");
    setData(payload.data);
    setShowReview(payload.data.match["Match Status"] === "Final" || Boolean(payload.data.canConfirm));
    setConfirming(false);
    const scored = payload.data.holeScores.map((item) => Number(item["Hole Number"]));
    const targetHole = payload.data.match["Match Status"] === "Final"
      ? Math.max(1, ...scored)
      : Array.from({ length: 18 }, (_, index) => index + 1)
        .find((hole) => !scored.includes(hole)) || 18;
    selectHole(targetHole, payload.data);
    return payload.data;
  };

  const loadMatchOptions = async () => {
    const response = await fetch("/api/scoring/access", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load active matches.");
    setMatchOptions(payload.data?.matches || []);
  };

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const cancelForNavigation = () => { current = false; controller.abort(); };
    window.addEventListener("participant-navigation-start", cancelForNavigation);
    const restore = async () => {
      const cached = dashboardOnly ? readParticipantInitializationCache() : null;
      if (cached) {
        setPreviewMode(Boolean(cached.previewMode));
        setPassportPlayer(cached.player);
        setPassportState("active");
        setPassportMatches(cached.data?.matches || []);
        setPassportTournament(cached.data?.tournament || null);
        setRestoring(false);
      } else setPassportState("loading");
      try {
        const [session, passport] = await Promise.all([
          dashboardOnly ? Promise.resolve(null) : fetch("/api/scoring/session", { cache: "no-store", signal: controller.signal }),
          fetchWithTransientRetry(dashboardOnly ? "/api/my-match" : "/api/player-passport/initialize", { cache: "no-store", signal: controller.signal }),
        ]);
        if (passport.ok) {
          const identity = await passport.json();
          if (!current) return;
          setPreviewMode(Boolean(identity.previewMode));
          setPassportPlayer(identity.player);
          setPassportState("active");
          setPassportMatches(identity.data?.matches || []);
          setPassportTournament(identity.data?.tournament || null);
          writeParticipantInitializationCache(identity);
        } else if (passport.status === 401) {
          clearParticipantInitializationCache();
          setPassportState("inactive");
        } else if (cached) {
          // The signed identity and recently verified snapshot remain usable.
          // Treat this as silent freshness degradation, not Passport failure.
          setPassportState("freshness-degraded");
        } else {
          setPassportState("unavailable");
        }
        if (session?.ok) {
          const payload = await session.json();
          setName(payload.scorerName || "");
          setAuthorized(true);
          await restoreLocalEntries(payload.matchId).catch(() => {});
          await loadMatch();
          return;
        }
        if (passport.status === 401 && !dashboardOnly && !supabaseParticipantIdentity) await loadMatchOptions();
      } catch {
        if (current) setPassportState(cached ? "freshness-degraded" : "unavailable");
      } finally {
        if (current) setRestoring(false);
      }
    };
    restore();
    return () => { current = false; controller.abort(); window.removeEventListener("participant-navigation-start", cancelForNavigation); };
  }, [dashboardOnly, restoreAttempt, supabaseParticipantIdentity]);

  const login = async () => {
    setBusy(true); setStatus("Opening scoring…");
    try {
      const payload = await request("/api/scoring/session", {
        method: "POST",
        body: JSON.stringify({
          scorerName: name,
          selector: selectedMatch,
          accessCode: credential,
        }),
      });
      setAuthorized(true);
      await loadMatch();
      setStatus("");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const openPassportMatch = async (passportMatch) => {
    matchOpenController.current?.abort();
    const controller = new AbortController();
    matchOpenController.current = controller;
    const sequence = ++matchOpenSequence.current;
    setBusy(true); setStatus("Opening your scorecard…");
    try {
      const response = await fetchWithTransientRetry("/api/player-passport/matches", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matchId: passportMatch.matchId,
          viewFinalScorecard: String(passportMatch.status || passportMatch.matchStatus || "").toLowerCase() === "final",
          requestedAction: String(passportMatch.status || passportMatch.matchStatus || "").toLowerCase() === "final"
            ? "VIEW_FINAL_SCORECARD" : "START_SCORING",
        }),
      }, { delays: [150, 350, 750] });
      if (sequence !== matchOpenSequence.current) return;
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status >= 500
        ? "Scorecard could not be opened. Please try again."
        : payload.error || "This match is not available for scoring.");
      if (dashboardOnly) {
        window.location.assign("/score");
        return;
      }
      setName(passportPlayer?.name || "");
      setAuthorized(true);
      await restoreLocalEntries(passportMatch.matchId).catch(() => {});
      await loadMatch();
      setStatus("");
    } catch (error) {
      if (error?.name !== "AbortError" && sequence === matchOpenSequence.current) setStatus(error.message);
    } finally {
      if (sequence === matchOpenSequence.current) setBusy(false);
    }
  };

  useEffect(() => () => {
    matchOpenSequence.current += 1;
    matchOpenController.current?.abort();
  }, []);
  useEffect(() => {
    const cancelForNavigation = () => {
      matchOpenSequence.current += 1;
      matchOpenController.current?.abort();
      setStatus("");
      setBusy(false);
    };
    window.addEventListener("participant-navigation-start", cancelForNavigation);
    return () => window.removeEventListener("participant-navigation-start", cancelForNavigation);
  }, []);

  const clearAccess = async () => {
    await fetch("/api/scoring/session", { method: "DELETE" });
    setAuthorized(false);
    setData(null);
    setCredential("");
    setSelectedMatch("");
    if (supabaseParticipantIdentity) {
      setRestoring(true);
      setRestoreAttempt((value) => value + 1);
      return;
    }
    await loadMatchOptions();
    setStatus("Match access cleared.");
  };

  const selectHole = (number, source = data) => {
    setHoleNumber(number);
    setActiveSlotIndex(0);
    const saved = source?.holeScores?.find((item) => Number(item["Hole Number"]) === number);
    setGross({
      team1: jsonScores(saved?.["Team 1 Gross Scores"]),
      team2: jsonScores(saved?.["Team 2 Gross Scores"]),
    });
  };

  useEffect(() => {
    if (!localFirstEnabled || !authorized || !data?.match?.["Match ID"] || syncQueue.current) return;
    setSyncReady(false);
    const queue = createScoringSyncQueue({
      store: durableScoringStore(),
      send: async (entry) => {
        const authorityStartedAt = typeof performance === "undefined" ? Date.now() : performance.now();
        const response = await fetch("/api/scoring/current", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            holeNumber: entry.holeNumber,
            team1GrossScores: entry.team1GrossScores,
            team2GrossScores: entry.team2GrossScores,
            expectedRevision: entry.expectedRevision,
            expectedMatchRevision: entry.expectedMatchRevision,
            expectedUpdatedAt: entry.expectedUpdatedAt,
            clientMutationId: entry.clientMutationId,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const error = new Error(payload.error || "Your score could not be synchronized.");
          error.status = response.status;
          error.code = payload.code || "";
          error.currentMatchRevision = payload.currentMatchRevision;
          throw error;
        }
        const authorityFinishedAt = typeof performance === "undefined" ? Date.now() : performance.now();
        recordScoringTiming({
          matchId: entry.matchId,
          holeNumber: entry.holeNumber,
          clientMutationId: entry.clientMutationId,
          authoritativeConfirmationMs: Math.max(0, authorityFinishedAt - authorityStartedAt),
          authoritativeConfirmedAt: new Date().toISOString(),
        });
        return payload.result;
      },
      readAuthoritative: async () => {
        const response = await fetch("/api/scoring/current?syncRebase=1", { cache: "no-store" });
        if (!response.ok) return null;
        const payload = await response.json();
        return payload.data;
      },
    });
    syncQueue.current = queue;
    const matchId = String(data.match["Match ID"]);
    const unsubscribe = queue.subscribe(({ entries, event, result, stale, resolution, entry }) => {
      const relevant = entries.filter((entry) => entry.matchId === matchId);
      setSyncEntries(relevant);
      if (event === "queued") setSyncFeedback({
        state: typeof navigator !== "undefined" && navigator.onLine === false ? "queued" : "saving",
        text: typeof navigator !== "undefined" && navigator.onLine === false ? "Saved on this phone" : "Saving…",
      });
      if (event === "syncing") setSyncFeedback({ state: "saving", text: "Saving…" });
      if (["retryable", "offline"].includes(event)) setSyncFeedback({ state: "queued", text: "Saved on this phone" });
      if (["conflict", "action-required"].includes(event)) setSyncFeedback({ state: "conflict", text: "Score needs review" });
      if (event === "confirmed" && result && !stale) {
        setSyncFeedback({ state: "synced", text: "Saved" });
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(18);
        recordScoringTiming({
          matchId,
          holeNumber: Number(result.hole?.["Hole Number"] || 0),
          clientMutationId: entry?.clientMutationId,
          queueClearMs: Math.max(0, Date.now() - Number(entry?.createdAt || Date.now())),
          queueClearedAt: new Date().toISOString(),
        });
        if (resolution === "server" && result.hole) {
          setGross({
            team1: jsonScores(result.hole["Team 1 Gross Scores"]),
            team2: jsonScores(result.hole["Team 2 Gross Scores"]),
          });
        }
        setData((current) => {
          if (!current) return current;
          const newerLocal = relevant.some((entry) => entry.holeNumber === Number(result.hole?.["Hole Number"]));
          const nextScores = newerLocal ? current.holeScores : current.holeScores
            .filter((item) => Number(item["Hole Number"]) !== Number(result.hole?.["Hole Number"]))
            .concat(result.hole || []);
          return {
            ...current,
            match: {
              ...current.match,
              "Match Status": "Live",
              "Current Hole": result.liveStatus?.currentHole ?? current.match["Current Hole"],
              "Team 1 Holes Won": result.liveStatus?.team1HolesWon ?? current.match["Team 1 Holes Won"],
              "Team 2 Holes Won": result.liveStatus?.team2HolesWon ?? current.match["Team 2 Holes Won"],
              "Holes Remaining": result.liveStatus?.holesRemaining ?? current.match["Holes Remaining"],
              "Match Status Text": result.liveStatus?.statusText ?? current.match["Match Status Text"],
              "Updated At": result.updatedAt || current.match["Updated At"],
              "Updated By": result.updatedBy || current.match["Updated By"],
              Revision: result.matchRevision ?? current.match.Revision,
              matchRevision: result.matchRevision ?? current.match.matchRevision,
            },
            holeScores: nextScores,
            canConfirm: Boolean(result.matchComplete) && relevant.length === 0,
          };
        });
        if (resolution) {
          const nextIssue = actionableScoringEntries(relevant)[0];
          if (nextIssue) {
            setShowReview(false);
            setConfirming(false);
            setHoleNumber(Number(nextIssue.holeNumber));
            setGross({
              team1: jsonScores(nextIssue.optimisticHole?.["Team 1 Gross Scores"]),
              team2: jsonScores(nextIssue.optimisticHole?.["Team 2 Gross Scores"]),
            });
          } else {
            setShowReview(true);
            setConfirming(false);
          }
        }
      }
    });
    queue.hydrate(matchId).then(async (entries) => {
      await queue.reconcile(matchId, data.holeScores || [], { ...(data.match || {}), canConfirm: data.canConfirm, authority: data.authority });
      const currentEntries = await queue.entries(matchId);
      setSyncEntries(currentEntries);
      if (entries.length) {
        setData((current) => current ? {
          ...current,
          holeScores: current.holeScores
            .filter((hole) => !currentEntries.some((entry) => entry.holeNumber === Number(hole["Hole Number"])))
            .concat(currentEntries.map((entry) => entry.optimisticHole)),
          canConfirm: false,
        } : current);
      }
      setSyncReady(true);
    }).catch(() => setStatus("Secure device storage is temporarily unavailable. Please try again."));
    const handleOnline = () => { setOnline(true); queue.retry().catch(() => {}); };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      unsubscribe();
      queue.stop();
      syncQueue.current = null;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [authorized, data?.match?.["Match ID"], localFirstEnabled]);

  const match = data?.match || {};
  const display = data?.display || {};
  const teeName = display.course?.tee || match.Tee || match["Tee Played"] || "";
  const teeTime = match["Tee Time"] || "";
  const teamNames = display.teamNames || {};
  const playerNames = display.playerNames || {};
  const isFinal = match["Match Status"] === "Final";
  const finalResult = isFinal
    ? finalizedMatchResult(match, data?.holeScores || [], teamNames)
    : "";
  const finalWinner = (() => {
    const winner = String(match["Matchup Winner"] || match["18-Hole Winner"] || "").trim();
    if (/^(halved|tie|tied)$/i.test(winner) || /^halved$/i.test(finalResult)) return "Match Halved";
    if (/^(team 1|1)$/i.test(winner)) return teamNames[1] || "Team 1";
    if (/^(team 2|2)$/i.test(winner)) return teamNames[2] || "Team 2";
    return [teamNames[1], teamNames[2]].find((name) => name && finalResult.toLowerCase().startsWith(String(name).toLowerCase())) || winner || "Final result recorded";
  })();
  const finalResultText = finalResultSummary(finalResult, teamNames);
  const format = String(match.Format || "").toUpperCase();
  const slots = format === "BB" ? 2 : 1;
  const scoringSlots = useMemo(() => buildScoringSlots({ format, match, teamNames, playerNames }), [format, match, playerNames, teamNames]);
  const selectedSlot = scoringSlots[Math.min(activeSlotIndex, Math.max(0, scoringSlots.length - 1))] || null;
  const savedHole = data?.holeScores?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const courseHole = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === holeNumber);
  const completed = useMemo(() => new Set((data?.holeScores || []).map((item) => Number(item["Hole Number"]))), [data]);
  const progress = scoringProgress(data?.holeScores || [], holeNumber);
  const currentMatchStatus = completed.size ? formatLiveMatchResult(data?.holeScores || [], teamNames) : "All Square";
  const tournamentIdentity = <TournamentIdentityHeader
    compact
    showStatus={false}
    year={match.Year || passportTournament?.year}
    name={passportTournament?.name || "Sandbagger Invitational"}
    location={`Round ${match.Round || "—"} • Match ${match.Match || "—"} • ${display.courseName || match["Course ID"] || "Course TBA"}`}
    logo={passportTournament?.logo}
  />;
  const scorecardHoles = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    const score = data?.holeScores?.find((item) => Number(item["Hole Number"]) === number);
    return { number, score };
  }), [data]);

  const strokesFor = (side, index) => {
    const total = format === "SC"
      ? match[`Team ${side} Stroke`]
      : match[`Team ${side} Player ${index + 1} Stroke`];
    return getStrokesOnHole(total, courseHole?.["Stroke Index"]);
  };

  const preview = useMemo(() => {
    const netFor = (side) => {
      const key = side === 1 ? "team1" : "team2";
      const values = Array.from({ length: slots }, (_, index) => Number(gross[key][index]));
      if (values.some((value) => !Number.isInteger(value) || value < 1)) return null;
      const nets = values.map((value, index) => value - strokesFor(side, index));
      return format === "BB" ? Math.min(...nets) : nets[0];
    };
    const team1 = netFor(1);
    const team2 = netFor(2);
    const winner = team1 === null || team2 === null
      ? ""
      : team1 === team2 ? "Halved" : team1 < team2 ? "Team 1" : "Team 2";
    return { team1, team2, winner };
  }, [courseHole, format, gross, match, slots]);

  const scoresComplete = preview.team1 !== null && preview.team2 !== null;
  const draftDirty = useMemo(() =>
    JSON.stringify(gross.team1) !== JSON.stringify(jsonScores(savedHole?.["Team 1 Gross Scores"])) ||
    JSON.stringify(gross.team2) !== JSON.stringify(jsonScores(savedHole?.["Team 2 Gross Scores"])),
  [gross, savedHole]);
  const unchangedSavedScore = Boolean(savedHole && sameGrossScores({
    team1GrossScores: gross.team1,
    team2GrossScores: gross.team2,
  }, savedHole));

  const activeScoringFocus = Boolean(authorized && data && !isFinal && !showReview);
  useEffect(() => {
    document.body.classList.toggle("participant-scoring-focus-active", activeScoringFocus);
    return () => document.body.classList.remove("participant-scoring-focus-active");
  }, [activeScoringFocus]);

  useEffect(() => {
    if (!syncFeedback.text || !["synced"].includes(syncFeedback.state)) return undefined;
    const timer = window.setTimeout(() => setSyncFeedback({ state: "idle", text: "" }), 1800);
    return () => window.clearTimeout(timer);
  }, [syncFeedback]);

  const setScore = (side, index, value) => {
    let normalized;
    try { normalized = normalizeLiveScoreInput(value); }
    catch {
      setStatus("Enter a whole-number gross score from 1 to 20.");
      return;
    }
    setStatus("");
    setGross((current) => {
    const next = [...current[side]];
    next[index] = normalized;
    return { ...current, [side]: next };
    });
  };

  const selectScoringSlot = (index) => {
    setActiveSlotIndex(Math.max(0, Math.min(scoringSlots.length - 1, Number(index) || 0)));
    setStatus(savedHole ? `Correcting Hole ${holeNumber}.` : "");
  };

  const enterCommonScore = (value) => {
    if (!selectedSlot || busy) return;
    const current = gross[selectedSlot.sideKey]?.[selectedSlot.index] ?? "";
    setScore(selectedSlot.sideKey, selectedSlot.index, scoreFromKeypad(current, value));
    setActiveSlotIndex((current) => nextScoringSlotIndex(current, scoringSlots.length));
  };

  const adjustSelectedScore = (action) => {
    if (!selectedSlot || busy) return;
    const current = gross[selectedSlot.sideKey]?.[selectedSlot.index] ?? "";
    setScore(selectedSlot.sideKey, selectedSlot.index, scoreFromKeypad(current, action));
  };

  const clearSelectedScore = () => {
    if (!selectedSlot || busy) return;
    setScore(selectedSlot.sideKey, selectedSlot.index, "");
  };

  const saveAuthoritatively = async () => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveFailed(false);
    setSyncFeedback({ state: "saving", text: "Saving…" });
    setBusy(true); setStatus(`Saving hole ${holeNumber}…`);
    try {
      const payload = await request("/api/scoring/current", {
        method: "POST",
        body: JSON.stringify({
          holeNumber,
          team1GrossScores: gross.team1,
          team2GrossScores: gross.team2,
          expectedRevision: Number(savedHole?.Revision || 0),
          expectedMatchRevision: Number(match.Revision || match.matchRevision || 0),
          expectedUpdatedAt: match["Updated At"] || "",
        }),
      });
      const nextScores = (data?.holeScores || [])
        .filter((item) => Number(item["Hole Number"]) !== holeNumber)
        .concat(payload.result?.hole || []);
      const savedStatus = formatLiveMatchResult(nextScores, teamNames);
      setLastSaved(`Hole ${holeNumber} saved · ${savedStatus}`);
      const nextData = {
        ...data,
        match: {
          ...data.match,
          "Match Status": "Live",
          "Current Hole": payload.result?.liveStatus?.currentHole,
          "Team 1 Holes Won": payload.result?.liveStatus?.team1HolesWon,
          "Team 2 Holes Won": payload.result?.liveStatus?.team2HolesWon,
          "Holes Remaining": payload.result?.liveStatus?.holesRemaining,
          "Match Status Text": payload.result?.liveStatus?.statusText,
          "Updated At": payload.result?.updatedAt,
          "Updated By": payload.result?.updatedBy,
          Revision: payload.result?.matchRevision ?? data.match.Revision,
        },
        holeScores: nextScores,
        canConfirm: Boolean(payload.result?.matchComplete),
      };
      setData(nextData);
      const scored = new Set(nextScores.map((item) => Number(item["Hole Number"])));
      const nextHole = Array.from({ length: 18 }, (_, index) => index + 1)
        .find((number) => !scored.has(number));
      if (nextHole) selectHole(nextHole, nextData);
      else {
        setShowReview(true);
        setConfirming(false);
      }
      setStatus("");
      setSyncFeedback({ state: "synced", text: "Saved" });
    } catch (error) {
      setSaveFailed(true);
      setSyncFeedback({ state: "conflict", text: "Score needs review" });
      const reason = String(error.message || "").trim();
      setStatus(reason === "Your score could not be saved. Please try again."
        ? "Score not saved. Please try again."
        : `Score not saved. ${reason || "Please try again."}`);
    }
    finally { saveInFlight.current = false; setBusy(false); }
  };

  const saveLocally = async () => {
    if (saveInFlight.current || !syncQueue.current) return;
    if (unchangedSavedScore) {
      setSaveFailed(false);
      setStatus(`Hole ${holeNumber} already has these scores.`);
      return;
    }
    const tapStartedAt = typeof performance === "undefined" ? Date.now() : performance.now();
    saveInFlight.current = true;
    setSaveFailed(false);
    setSyncFeedback({ state: online ? "saving" : "queued", text: online ? "Saving…" : "Saved on this phone" });
    const savedNumber = holeNumber;
    const expectedRevision = Number(savedHole?.Revision || 0);
    const optimisticHole = {
      ...(savedHole || {}),
      "Hole Score ID": `${match["Match ID"]}-H${savedNumber}`,
      "Match ID": match["Match ID"],
      "Hole Number": savedNumber,
      "Stroke Index": Number(courseHole?.["Stroke Index"]),
      Format: format,
      "Team 1 Gross Scores": [...gross.team1],
      "Team 2 Gross Scores": [...gross.team2],
      "Team 1 Net Score": preview.team1,
      "Team 2 Net Score": preview.team2,
      "Hole Winner": preview.winner,
      Revision: expectedRevision + 1,
      "Local Pending": true,
    };
    try {
      const validationStartedAt = typeof performance === "undefined" ? Date.now() : performance.now();
      gross.team1.forEach((value) => normalizeLiveScoreInput(value));
      gross.team2.forEach((value) => normalizeLiveScoreInput(value));
      const validationFinishedAt = typeof performance === "undefined" ? Date.now() : performance.now();
      const commitStartedAt = validationFinishedAt;
      const queuedEntry = await syncQueue.current.enqueue({
        tournamentId: String(match["Tournament ID"] || match.Year || passportTournament?.year || ""),
        matchId: String(match["Match ID"]),
        holeNumber: savedNumber,
        team1GrossScores: [...gross.team1],
        team2GrossScores: [...gross.team2],
        expectedRevision,
        expectedMatchRevision: Number(match.Revision || match.matchRevision || 0),
        expectedUpdatedAt: match["Updated At"] || "",
        optimisticHole,
        authoritativeHole: savedHole || null,
      });
      const commitFinishedAt = typeof performance === "undefined" ? Date.now() : performance.now();
      const effectiveOptimisticHole = queuedEntry.optimisticHole || savedHole || optimisticHole;
      const nextScores = (data?.holeScores || [])
        .filter((item) => Number(item["Hole Number"]) !== savedNumber)
        .concat(effectiveOptimisticHole);
      const nextData = { ...data, holeScores: nextScores, canConfirm: false };
      setData(nextData);
      const scored = new Set(nextScores.map((item) => Number(item["Hole Number"])));
      const nextHole = Array.from({ length: 18 }, (_, index) => index + 1).find((number) => !scored.has(number));
      if (nextHole) selectHole(nextHole, nextData);
      else { setShowReview(true); setConfirming(false); }
      setStatus("");
      setSyncFeedback({ state: online ? "saving" : "queued", text: online ? "Saving…" : "Saved on this phone" });
      if (scoringDiagnosticsEnabled && !queuedEntry.unchanged) {
        const sample = {
          matchId: String(match["Match ID"]),
          clientMutationId: queuedEntry.clientMutationId,
          holeNumber: savedNumber,
          validationMs: Math.max(0, validationFinishedAt - validationStartedAt),
          indexedDbCommitMs: Math.max(0, commitFinishedAt - commitStartedAt),
          queueEnqueueMs: Math.max(0, commitFinishedAt - commitStartedAt),
          tapToStateAdvanceMs: Math.max(0, commitFinishedAt - tapStartedAt),
          measuredAt: new Date().toISOString(),
        };
        window.requestAnimationFrame(() => {
          const visualAt = performance.now();
          window.requestAnimationFrame(() => recordScoringTiming({
            ...sample,
            tapToVisualAdvanceMs: Math.max(0, visualAt - tapStartedAt),
            nextHoleUsableMs: Math.max(0, performance.now() - tapStartedAt),
          }));
        });
      }
    } catch (error) {
      setSaveFailed(true);
      setSyncFeedback({ state: "conflict", text: "Score needs review" });
      setStatus(`Score not saved on this device. ${error.message || "Please try again."}`);
    } finally {
      saveInFlight.current = false;
    }
  };

  const save = localFirstEnabled ? saveLocally : saveAuthoritatively;

  const requestSave = () => {
    if (savedHole && draftDirty) {
      setPendingCorrectionSave(true);
      return;
    }
    save();
  };

  const confirmScorecard = async () => {
    if (localFirstEnabled && syncEntries.length) {
      setStatus("Syncing remaining scores before final submission…");
      await syncQueue.current?.retry();
      return;
    }
    setBusy(true); setStatus("Submitting final scorecard…");
    try {
      if (localFirstEnabled) {
        const authoritative = await loadMatch();
        if (!authoritative?.canConfirm) throw new Error("All 18 holes must be confirmed before final submission.");
      }
      const finalized = await request("/api/scoring/current", {
        method: "POST",
        body: JSON.stringify({
          action: "confirm",
          expectedMatchRevision: Number(match.Revision || match.matchRevision || 0),
          clientMutationId: `finalize:${match["Match ID"]}:${Number(match.Revision || match.matchRevision || 0)}`,
        }),
      });
      if (finalized.authoritativeData?.match?.["Match Status"] === "Final") {
        setData(finalized.authoritativeData);
        const scored = finalized.authoritativeData.holeScores?.map((item) => Number(item["Hole Number"])) || [];
        selectHole(Math.max(1, ...scored), finalized.authoritativeData);
        setShowReview(true);
        setConfirming(false);
      } else {
        setData((current) => applyParticipantFinalizationResult(current, finalized.result));
      }
      setShowReview(true);
      setStatus("Scorecard finalized.");
      setSyncFeedback({ state: "synced", text: "Match final" });
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([22, 45, 22]);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };

  const editHole = (number) => {
    setShowReview(false);
    setConfirming(false);
    selectHole(number);
    setStatus(`Editing hole ${number}.`);
  };

  const navigateHole = (number) => {
    if (draftDirty) { setPendingHoleNavigation(number); return; }
    selectHole(number);
    setSaveFailed(false);
    setStatus("");
  };

  const discardDraftAndNavigate = () => {
    const number = pendingHoleNavigation;
    setPendingHoleNavigation(null);
    if (!Number.isFinite(number)) return;
    selectHole(number);
    setSaveFailed(false);
    setStatus("");
  };

  const requestExitScoring = () => {
    if (draftDirty) {
      setPendingExit(true);
      return;
    }
    router.push("/my-match");
  };

  const discardDraftAndExit = () => {
    setPendingExit(false);
    router.push("/my-match");
  };

  const requestFullScorecard = () => {
    if (draftDirty) {
      setPendingReview(true);
      return;
    }
    setShowReview(true);
  };

  const discardDraftAndReview = () => {
    setPendingReview(false);
    selectHole(holeNumber);
    setShowReview(true);
  };

  const confirmCorrectionSave = () => {
    setPendingCorrectionSave(false);
    save();
  };

  const syncStatus = scoringSyncSummary(syncEntries, online);
  const attentionEntries = actionableScoringEntries(syncEntries);
  const finalizationReview = scoringFinalizationReview(syncEntries);
  const activeSyncIssue = attentionEntries.find((entry) => Number(entry.holeNumber) === holeNumber) || null;
  const activeSyncIssueKind = scoringSyncIssueKind(activeSyncIssue);
  const canResolveScoreConflict = activeSyncIssueKind === "conflict" && Boolean(activeSyncIssue?.authoritativeHole);
  const unsafeSyncBlock = syncEntries.some((entry) => {
    const kind = scoringSyncIssueKind(entry);
    return kind === "conflict" || (entry.status === "action-required" && kind !== "confirmed");
  });
  const reviewFirstSyncIssue = () => {
    const issue = attentionEntries[0];
    if (!issue) return;
    setShowReview(false);
    setConfirming(false);
    selectHole(Number(issue.holeNumber));
    setStatus("");
  };
  const syncPresentation = (() => {
    if (syncStatus.actionable) return { state: "conflict", text: "Score needs review", actionable: true };
    if (!online && syncEntries.length) return { state: "queued", text: "Saved on this phone", actionable: false };
    if (syncEntries.length) return { state: "saving", text: "Saving…", actionable: false };
    return { ...syncFeedback, actionable: false };
  })();
  const syncBanner = <ScoringSyncIndicator {...syncPresentation} onAction={reviewFirstSyncIssue} />;
  const selectedGross = selectedSlot ? gross[selectedSlot.sideKey]?.[selectedSlot.index] ?? "" : "";
  const frontComplete = [...completed].filter((number) => number <= 9).length;
  const backComplete = [...completed].filter((number) => number > 9).length;
  const missingScores = scoringSlots.filter((slot) => gross[slot.sideKey]?.[slot.index] === "" || gross[slot.sideKey]?.[slot.index] == null).length;
  const saveDisabled = busy || !scoresComplete || unchangedSavedScore || (localFirstEnabled && (!syncReady || unsafeSyncBlock));
  const saveLabel = busy
    ? `Saving Hole ${holeNumber}…`
    : saveFailed ? "Try Again"
      : localFirstEnabled && !syncReady ? "Preparing Scoring…"
        : unsafeSyncBlock ? canResolveScoreConflict ? "Review Device and Recorded Scores" : "Review Scoring Issue"
          : unchangedSavedScore ? "Score Already Saved"
            : savedHole ? "Save Correction"
              : holeNumber === 18 ? "Save Hole & Review" : "Save & Continue";

  if (restoring) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>Preparing your tournament…</h1><p>{previewMode ? "Loading the selected player’s tournament experience." : supabaseParticipantIdentity ? "Please wait while your participant session and match are refreshed." : "Please wait while your Player Passport and match are refreshed."}</p></div>
  </section>;

  if (!authorized && passportPlayer) return <MyMatchDashboard
      player={passportPlayer}
      tournament={passportTournament}
      matches={passportMatches}
      busy={busy}
      onOpen={openPassportMatch}
      message={status}
    />;

  if (!authorized && passportState === "unavailable") return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>My Match</h1><p>Tournament information is temporarily unavailable. Please try again.</p></div>
    <button className={styles.primary} type="button" onClick={() => { setRestoring(true); setRestoreAttempt((value) => value + 1); }}>Retry</button>
  </section>;

  if (!authorized && supabaseParticipantIdentity) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>My Match</h1><p>Sign in with your approved tournament email to open your assigned scorecard.</p></div>
    <Link className={styles.primary} href={`/participant-auth?next=${dashboardOnly ? "/my-match" : "/score"}`}>Participant sign-in</Link>
    {status && <p className={styles.status}>{status}</p>}
  </section>;

  if (!authorized) return <section className={styles.login}>
    <div className={styles.brand}><span>SBI LIVE</span><h1>My Match</h1><p>Select your Player Passport to view your matches, or use a participant match code.</p></div>
    <Link className={styles.primary} href="/activate">Activate Player Passport</Link>
    <div className={styles.matchChoices} role="radiogroup" aria-label="Choose your match">
      {matchOptions.map((item) => <button type="button" role="radio" aria-checked={selectedMatch === item.selector} data-active={selectedMatch === item.selector} disabled={!item.accessAvailable} onClick={() => setSelectedMatch(item.selector)} key={item.selector || `${item.round}-${item.match}`}>
        <span>Round {item.round} · Match {item.match}{item.teeTime ? ` · ${item.teeTime}` : ""}</span>
        <strong>{item.teamOnePlayers.join(" + ") || item.teamOne} vs {item.teamTwoPlayers.join(" + ") || item.teamTwo}</strong>
        <small>{item.format || "Format TBA"} · {item.course || "Course TBA"}{!item.accessAvailable ? " · Access not active" : ""}</small>
      </button>)}
      {!matchOptions.length && <p className={styles.status}>No scoreable matches are available for the active round yet.</p>}
    </div>
    <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Match code<input type="password" inputMode="numeric" autoComplete="one-time-code" value={credential} onChange={(event) => setCredential(event.target.value)} /></label>
    <button className={styles.primary} disabled={busy || !selectedMatch || !name.trim() || !credential.trim()} onClick={login}>Open My Match</button>
    {status && <p className={styles.status}>{status}</p>}
  </section>;
  if (!data) return <section className={styles.login}><div className={styles.brand}><span>SBI LIVE</span><h1>Unable to open match</h1></div><button className={styles.primary} onClick={clearAccess}>Clear match access</button>{status && <p className={styles.status}>{status}</p>}</section>;

  if (showReview) return <section className={`${styles.shell} ${styles.reviewShell}`} data-scorecard-state={isFinal ? "final" : "review"}>
    {tournamentIdentity}
    <header className={styles.scorecardHeading}><div><span>{display.formatName || format}</span><h1>{isFinal ? "Official Tournament Scorecard" : "Review Scorecard"}</h1></div><b aria-label={`${completed.size} of 18 holes recorded`}>{completed.size}/18</b></header>
    {!isFinal ? <div className={styles.reviewStatus}>
      <div className={styles.reviewBadge}><StatusBadge status="Current Match" /></div>
      <span>REVIEW BEFORE SUBMITTING</span>
      <strong>{completed.size ? formatLiveMatchResult(data?.holeScores, teamNames) : lastSaved || "Check every hole before confirmation."}</strong>
      <small>Tap a recorded hole below to make a correction.</small>
    </div> : null}
    {isFinal ? <section className={styles.finalMatchSummary} aria-label="Final match summary">
      <div className={styles.finalSummaryLead}><span>OFFICIAL TOURNAMENT RECORD</span><StatusBadge status="Final" /><strong>{finalWinner}</strong>{finalResultText !== "Halved" ? <b>{finalResultText}</b> : null}<em>{completed.size} holes recorded • Read-only</em></div>
      <div className={styles.finalSummaryMeta}>
        <span><small>Round</small><strong>{match.Round || "—"}</strong></span>
        <span><small>Match Number</small><strong>{match.Match || "—"}</strong></span>
        <span className={styles.finalCourse}><small>Course</small><strong>{display.courseName || match["Course ID"] || "—"}</strong></span>
        <span><small>Tees</small><strong>{teeName || "—"}</strong></span>
        <span><small>Tee Time</small><strong>{teeTime || "—"}</strong></span>
      </div>
    </section> : <div className={styles.officialCourse}>
      <span><small>Course</small><strong>{display.courseName || match["Course ID"] || "Course recorded with match"}</strong></span>
      {teeName ? <span><small>Tees</small><strong>{teeName}</strong></span> : null}
      {teeTime ? <span><small>Tee Time</small><strong>{teeTime}</strong></span> : null}
    </div>}
    <div className={styles.officialRecord}>
      <div><strong>{teamNames[1] || "Team 1"}</strong><span>{playerIds(match, 1).map((id) => playerNames[id] || id).filter(Boolean).join(" • ") || "Players recorded with match"}</span></div>
      <b className={styles.versus} aria-hidden="true">VS</b>
      <div><strong>{teamNames[2] || "Team 2"}</strong><span>{playerIds(match, 2).map((id) => playerNames[id] || id).filter(Boolean).join(" • ") || "Players recorded with match"}</span></div>
    </div>
    {[scorecardHoles.slice(0, 9), scorecardHoles.slice(9)].map((nine, nineIndex) => <div className={styles.scorecardScroller} data-nine={nineIndex ? "back" : "front"} key={nineIndex}><div className={styles.scorecard} role="table" aria-label={`${nineIndex ? "Back" : "Front"} nine scorecard`}>
      <div className={styles.scorecardRow} data-header="true" role="row"><strong role="columnheader">Player / Team</strong>{nine.map(({ number }) => <b role="columnheader" key={number}>{number}</b>)}</div>
      {[1, 2].flatMap((side) => {
        const ids = playerIds(match, side);
        return Array.from({ length: slots }, (_, index) => <div className={styles.scorecardRow} role="row" key={`${side}-${index}`}>
          <strong role="rowheader">{format === "SC" ? teamNames[side] || `Team ${side}` : playerNames[ids[index]] || ids[index]}</strong>
          {nine.map(({ number, score }) => {
            const metadata = data?.courseHoles?.find((item) => Number(item["Hole Number"]) === number);
            const total = format === "SC" ? match[`Team ${side} Stroke`] : match[`Team ${side} Player ${index + 1} Stroke`];
            const dots = strokeDots(getStrokesOnHole(total, metadata?.["Stroke Index"]));
            const player = format === "SC" ? teamNames[side] || `Team ${side}` : playerNames[ids[index]] || ids[index];
            return <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`Hole ${number}, ${player}, gross ${grossAt(score, side, index) || "not recorded"}`} key={number}><i>{dots}</i>{grossAt(score, side, index) || "—"}</ScorecardCell>;
          })}
        </div>);
      })}
      {[1, 2].map((side) => <div className={styles.scorecardRow} data-team="true" role="row" key={`net-${side}`}>
        <strong role="rowheader">{teamNames[side] || `Team ${side}`}<small>NET {format === "BB" ? "BEST BALL" : format === "SC" ? "SCRAMBLE" : "SCORE"}</small></strong>
        {nine.map(({ number, score }) => <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`Hole ${number}, ${teamNames[side] || `Team ${side}`} net ${score?.[`Team ${side} Net Score`] || "not recorded"}`} key={number}>{score?.[`Team ${side} Net Score`] || "—"}</ScorecardCell>)}
      </div>)}
      <div className={styles.scorecardRow} data-winner="true" role="row"><strong role="rowheader">Hole winner</strong>{nine.map(({ number, score }) => <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`Hole ${number}, ${holeWinnerMark(score, teamNames) || "not recorded"}`} key={number}>{compactHoleWinnerMark(score, teamNames)}</ScorecardCell>)}</div>
      <div className={styles.scorecardRow} data-running="true" role="row"><strong role="rowheader">Match status</strong>{nine.map(({ number, score }) => {
        const running = runningMatchStatusAtHole(data?.holeScores, number, teamNames);
        const compact = running.replace(`${teamNames[1]} `, "").replace(`${teamNames[2]} `, "");
        return <ScorecardCell readOnly={isFinal} disabled={!score} onEdit={() => editHole(number)} label={`After hole ${number}, ${running || "not recorded"}`} key={number}>{score ? compact : "—"}</ScorecardCell>;
      })}</div>
    </div></div>)}
    {!isFinal && <p className={styles.editHint}>Tap any scored hole to edit it before final confirmation.</p>}
    {localFirstEnabled && !isFinal ? syncBanner : null}
    {!isFinal && completed.size === 18 && finalizationReview.count ? <section className={styles.finalSyncBlock} aria-live="polite">
      <strong>{finalizationReview.reviewText}</strong>
      <span>Review and resolve every listed hole. Final submission becomes available after all scores are authoritatively synced.</span>
      <button type="button" onClick={reviewFirstSyncIssue}>Review first issue</button>
    </section> : null}
    {isFinal ? <>
      <p className={styles.finalConfirmation}>Scorecard confirmed • Only an administrator can reopen this official record.</p>
      <nav className={styles.finalActions} aria-label="Finalized scorecard actions">
        <Link className={styles.primary} href="/my-match">Return to My Match</Link>
        <Link className={styles.finalResultLink} href={`/game-center/${encodeURIComponent(match["Match ID"])}?from=my-match`}>View Game Center →</Link>
      </nav>
    </> : <><div className={styles.reviewActions}><button type="button" onClick={() => { setShowReview(false); selectHole(Math.max(1, ...completed)); }}>Continue Match</button><button className={styles.primary} disabled={busy || !data?.canConfirm || (localFirstEnabled && syncEntries.length > 0)} onClick={() => setConfirming(true)}>Finalize Match</button></div>{completed.size === 18 && finalizationReview.count ? <p className={styles.finalBlockedReason}>{finalizationReview.buttonText}</p> : null}</>}
    {status && <p className={styles.status}>{status}</p>}
    <AlertSheet
      open={confirming}
      onClose={() => { if (!busy) setConfirming(false); }}
      title="Finalize Match?"
      body={`18 holes complete. ${formatLiveMatchResult(data?.holeScores, teamNames)}. Corrections require the authorized reopen workflow.`}
      cancelLabel="Review Scorecard"
      primaryLabel={busy ? "Finalizing…" : "Finalize Match"}
      primaryDisabled={busy}
      onPrimary={confirmScorecard}
      tone="warning"
    />
  </section>;

  return <section
    className={`${styles.shell} ${styles.focusShell}`}
    data-scoring-mode={savedHole ? "correction" : "new"}
    data-format={format}
    data-slot-count={scoringSlots.length}
  >
    <header className={styles.focusToolbar}>
      <button type="button" onClick={requestExitScoring} aria-label="Leave scoring">Done</button>
      <span><small>{savedHole ? `CORRECTING HOLE ${holeNumber}` : display.formatName || format}</small><strong>Round {match.Round || "—"} · Match {match.Match || "—"}</strong><em>{currentMatchStatus} · {completed.size}/18 saved</em></span>
      <button type="button" onClick={requestFullScorecard}>Scorecard</button>
    </header>
    <section className={styles.scoringContext} aria-label="Current match progress">
      <div><small>Match</small><strong>{currentMatchStatus}</strong></div>
      <span><b>{completed.size} of 18 saved</b><small>{progress.remaining} hole{progress.remaining === 1 ? "" : "s"} remaining</small></span>
      <i aria-hidden="true"><b style={{ width: `${progress.percent}%` }} /></i>
    </section>
    <nav className={styles.holeNavigator} aria-label="Choose hole">
      <button disabled={holeNumber === 1} onClick={() => navigateHole(holeNumber - 1)} aria-label="Previous hole">‹</button>
      <div><span>Hole {holeNumber} of 18</span><strong>Par {courseHole?.Par || "—"}{courseHole?.Yardage ? ` · ${courseHole.Yardage} yards` : ""}</strong><small>Stroke index {courseHole?.["Stroke Index"] || "—"}</small></div>
      <button disabled={holeNumber === 18} onClick={() => navigateHole(holeNumber + 1)} aria-label="Next hole">›</button>
    </nav>
    <div className={styles.holeProgress} aria-label={`Front nine ${frontComplete} of 9 saved. Back nine ${backComplete} of 9 saved.`}>
      <span><b>Front 9</b><i aria-hidden="true"><em style={{ width: `${(frontComplete / 9) * 100}%` }} /></i><small>{frontComplete}/9</small></span>
      <span><b>Back 9</b><i aria-hidden="true"><em style={{ width: `${(backComplete / 9) * 100}%` }} /></i><small>{backComplete}/9</small></span>
    </div>
    <div className={styles.holeCard} aria-label={`Hole ${holeNumber} scoring order`}>
      {scoringSlots.map((slot, index) => {
        const value = gross[slot.sideKey]?.[slot.index] ?? "";
        const strokes = strokesFor(slot.side, slot.index);
        const net = value === "" ? null : Number(value) - strokes;
        const selected = index === activeSlotIndex;
        return <button
          type="button"
          className={styles.holeCardPlayer}
          data-selected={selected ? "true" : undefined}
          aria-pressed={selected}
          aria-label={`${slot.label}, ${slot.teamName}, gross ${value || "not entered"}, ${strokes} handicap stroke${strokes === 1 ? "" : "s"}, net ${net ?? "not available"}${selected ? ", selected" : ""}`}
          onClick={() => selectScoringSlot(index)}
          key={slot.key}
        >
          <span className={styles.playerIdentity}>
            <small>{slot.teamName}</small>
            <strong>{slot.label}</strong>
            {slot.kind === "team" && slot.pairing ? <em>{slot.pairing}</em> : null}
            {selected ? <b className={styles.selectedMarker}>{savedHole ? "Correcting score" : "Entering now"}</b> : null}
          </span>
          <span className={styles.scoreMetrics} aria-label={`Gross ${value || "not entered"}, strokes ${strokes}, net ${net ?? "not available"}`}>
            <span className={styles.scoreMetric}><small>Gross</small><b>{value || "—"}</b></span>
            <span className={styles.scoreMetric}><small>Strokes</small><b>{strokes || "—"}</b>{strokes ? <i aria-hidden="true">{strokeDots(strokes)}</i> : null}</span>
            <span className={styles.scoreMetric}><small>Net</small><b>{net ?? "—"}</b></span>
          </span>
        </button>;
      })}
      <div className={styles.holeCardTeamResults}>
        {[1, 2].map((side) => <span key={side}><small>{teamNames[side] || `Team ${side}`} net</small><strong>{preview[`team${side}`] ?? savedHole?.[`Team ${side} Net Score`] ?? "—"}</strong></span>)}
        <span><small>Hole result</small><strong>{preview.winner ? holeWinnerMark({ "Hole Winner": preview.winner }, teamNames) : holeWinnerMark(savedHole, teamNames) || "Pending"}</strong></span>
      </div>
    </div>
    {previewMode && scoringDiagnosticsEnabled ? <aside className={styles.scoringDiagnostics} aria-label="Preview scoring performance diagnostics"><strong>Preview scoring diagnostics</strong><span>{scoringTimingSamples.length ? `Hole ${scoringTimingSamples.at(-1).holeNumber} · IndexedDB ${timingLabel(scoringTimingSamples.at(-1).indexedDbCommitMs)} · Visual ${timingLabel(scoringTimingSamples.at(-1).tapToVisualAdvanceMs)} · Usable ${timingLabel(scoringTimingSamples.at(-1).nextHoleUsableMs)} · Authority ${timingLabel(scoringTimingSamples.at(-1).authoritativeConfirmationMs)} · Queue clear ${timingLabel(scoringTimingSamples.at(-1).queueClearMs)}` : "Enter a score to capture physical-device timing."}</span><small>{scoringTimingSamples.length} durable Preview sample{scoringTimingSamples.length === 1 ? "" : "s"} retained on this device and uploaded without score values.</small></aside> : null}
    {localFirstEnabled && activeSyncIssue ? <section className={styles.syncIssue} data-kind={activeSyncIssue.failureKind || activeSyncIssue.status} aria-live="polite">
      <span>{activeSyncIssueKind === "conflict" ? `Hole ${activeSyncIssue.holeNumber} score conflict` : activeSyncIssueKind === "retryable" ? `Hole ${activeSyncIssue.holeNumber} has not synced yet` : `Hole ${activeSyncIssue.holeNumber} needs action`}</span>
      <strong>{participantScoringSyncIssue(activeSyncIssue)}</strong>
      {canResolveScoreConflict ? <><div className={styles.syncComparison}>
        {[["This device", activeSyncIssue.optimisticHole], ["Server", activeSyncIssue.authoritativeHole]].map(([source, score]) => <div key={source}><small>{source}</small>{[1, 2].flatMap((side) => {
          const ids = playerIds(match, side);
          const values = jsonScores(score?.[`Team ${side} Gross Scores`]);
          return Array.from({ length: slots }, (_, index) => <span key={`${source}-${side}-${index}`}><b>{format === "SC" ? teamNames[side] || `Team ${side}` : playerNames[ids[index]] || ids[index] || `Player ${index + 1}`}</b><strong>{values[index] ?? "—"}</strong></span>);
        })}</div>)}
      </div><p className={styles.syncChoicePrompt}>Choose the correct score for Hole {activeSyncIssue.holeNumber}.</p></> : null}
      {canResolveScoreConflict ? <div className={styles.syncResolution}>
        <button type="button" onClick={() => syncQueue.current?.resolveConflict(activeSyncIssue.id, "device")}><strong>Use This Device Score</strong><small>Sync the score entered on this device.</small></button>
        <button type="button" onClick={() => syncQueue.current?.resolveConflict(activeSyncIssue.id, "server")}><strong>Use Server Score</strong><small>Keep the score already recorded on the server.</small></button>
      </div> : null}
      {activeSyncIssueKind === "retryable" ? <button type="button" onClick={() => syncQueue.current?.retryEntry(activeSyncIssue.id)}>Retry Sync</button> : null}
      {activeSyncIssue.status === "action-required" ? <button type="button" onClick={() => syncQueue.current?.retryEntry(activeSyncIssue.id)}>Check Again</button> : null}
    </section> : null}
    <div className={styles.scoringDock}>
      {localFirstEnabled ? syncBanner : null}
      <ScoringKeypad value={selectedGross} disabled={busy || unsafeSyncBlock} onScore={enterCommonScore} onAdjust={adjustSelectedScore} />
      <div className={styles.scoringActions}>
        <button
          type="button"
          className={styles.clearEntry}
          disabled={busy || unsafeSyncBlock || selectedGross === "" || selectedGross == null}
          aria-label={scoringKeypadActionLabel("clear", selectedGross)}
          onClick={clearSelectedScore}
        >Clear entry</button>
        {unchangedSavedScore ? <div className={styles.savedScoreState} role="status"><strong>Score recorded</strong><small>Select a row and change its value to correct it.</small></div> : <button className={styles.primary} disabled={saveDisabled} onClick={requestSave} aria-describedby={!scoresComplete ? "score-save-help" : undefined}>{saveLabel}</button>}
      </div>
      {!scoresComplete ? <small id="score-save-help" className={styles.saveHelp}>{missingScores} score{missingScores === 1 ? "" : "s"} needed before saving this hole.</small> : null}
    </div>
    {status && <p className={styles.status} role={saveFailed ? "alert" : "status"}>{status}</p>}
    <AlertSheet
      open={Number.isFinite(pendingHoleNavigation)}
      onClose={() => setPendingHoleNavigation(null)}
      title="Discard unsaved score changes for this hole?"
      body={`Your unsaved changes for Hole ${holeNumber} will be cleared.`}
      cancelLabel="Keep editing"
      primaryLabel="Discard changes"
      onPrimary={discardDraftAndNavigate}
      tone="warning"
    />
    <AlertSheet
      open={pendingExit}
      onClose={() => setPendingExit(false)}
      title="Leave scoring?"
      body={`You have unsaved scores on Hole ${holeNumber}.`}
      cancelLabel="Continue Scoring"
      primaryLabel="Leave Without Saving"
      onPrimary={discardDraftAndExit}
      tone="warning"
    />
    <AlertSheet
      open={pendingReview}
      onClose={() => setPendingReview(false)}
      title="Open the full scorecard?"
      body={`Your unsaved changes for Hole ${holeNumber} will be cleared.`}
      cancelLabel="Keep editing"
      primaryLabel="Discard and Review"
      onPrimary={discardDraftAndReview}
      tone="warning"
    />
    <AlertSheet
      open={pendingCorrectionSave}
      onClose={() => setPendingCorrectionSave(false)}
      title={`Save correction to Hole ${holeNumber}?`}
      body="The recorded score will be updated through the existing correction and review process."
      cancelLabel="Keep editing"
      primaryLabel="Save Correction"
      onPrimary={confirmCorrectionSave}
      tone="warning"
    />
  </section>;
}
