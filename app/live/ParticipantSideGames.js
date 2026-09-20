"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./participant-side-games.module.css";

const money = value => value == null ? "—" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = value => value == null ? "—" : `${(Number(value) * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const formats = { BB: "Best Ball", SC: "Scramble", SI: "Singles" };
function Metrics({ values }) {
  return <dl className={styles.metrics}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function Unavailable({ name }) {
  return <section className={styles.card} role="status"><h2>{name} {name === "Net Skins" ? "are" : "is"} unavailable right now.</h2><p>Published {name === "Net Skins" ? "results" : "purchases and ownership"} will appear here when available. No results have been inferred.</p></section>;
}

export function NetSkinsParticipant({ data, params, href }) {
  const presentation = data?.presentation;
  if (!data?.published || !presentation?.published || presentation.purpose !== "CANONICAL_PUBLISHED_PARTICIPANT_RESULT") return <Unavailable name="Net Skins" />;
  const rounds = presentation.rounds;
  const round = rounds.find(r => String(r.round) === params.get("sideRound")) || rounds[0];
  if (!round) return <Unavailable name="Net Skins" />;
  const entries = new Map(round.entries.map(e => [e.entryId, e]));
  const name = id => entries.get(id)?.players.map(p => p.name).join(" + ") || "Entry unavailable";
  const hole = round.holes.find(h => String(h.hole) === params.get("hole"));
  return <section className={styles.experience} aria-label="Published Net Skins">
    <nav className={styles.tabs} aria-label="Net Skins round">{rounds.map(r => <Link aria-current={r === round ? "page" : undefined} href={href({ sideRound: r.round, hole: null })} key={r.round}>Round {r.round}</Link>)}</nav>
    <section className={styles.card}><div className={styles.heading}><span className={styles.eyebrow}>Round {round.round} · {round.formatDisplayName}</span><span className={styles.pill}>Published</span></div><h2>Net Skins</h2><p>{round.scope === "TEAM" ? "Team Full Net" : "Individual Full Net"}</p>
      <Metrics values={[["Eligible entries", round.eligibleCount], ["Pot", money(round.pot)], ["Skins awarded", round.skinsAwarded], ["Per skin", money(round.skinValue)]]} />
    </section>
    {hole ? <section className={styles.card} aria-label="Net Skins hole detail"><Link href={href({ hole: null })}>← Hole tracker</Link><h2>Hole {hole.hole}</h2><p>{hole.state === "won" ? `${name(hole.winnerEntryId)} · ${money(hole.qaPayout)}` : "Tied · No skin awarded"}</p>
      {hole.participants.map(p => <article className={styles.row} key={p.entryId}><h3>{name(p.entryId)}</h3><p>{entries.get(p.entryId)?.team.name} · {entries.get(p.entryId)?.course.name} · {entries.get(p.entryId)?.course.tee}</p><Metrics values={[["Gross", p.gross], ["Full HCP strokes", p.fullCourseHandicapStrokes], ["Full net", p.fullNet], ["Result", ({ won: "Skin won", tiedLow: "Tied low", noSkin: "No skin" })[p.outcome]]]} /></article>)}
    </section> : <>
      <section className={styles.card}><h2>Winners</h2>{round.winners.length ? round.winners.map(w => <article className={styles.row} key={w.entryId}><h3>{name(w.entryId)}</h3><p>{w.skinsWon} {w.skinsWon === 1 ? "skin" : "skins"} · {money(w.qaPayout)}</p><div className={styles.tabs}>{w.winningHoles.map(h => <Link href={href({ hole: h, sideRound: round.round })} key={h}>Hole {h}</Link>)}</div></article>) : <p>No skins awarded in the published result.</p>}</section>
      <section className={styles.card}><h2>Hole tracker</h2>{[0, 9].map(start => <section key={start}><h3>{start ? "Back nine" : "Front nine"}</h3><div className={styles.holes}>{round.holes.slice(start, start + 9).map(h => <Link className={styles.hole} href={href({ hole: h.hole, sideRound: round.round })} key={h.hole} aria-label={`Hole ${h.hole}, ${h.state === "won" ? "skin won" : "tied"}`}><strong>{h.hole}</strong><span>{h.state === "won" ? "Won" : "Tied"}</span></Link>)}</div></section>)}</section>
    </>}
  </section>;
}

export function CalcuttaParticipant({ data, params, href }) {
  if (!data?.published || data.publicationState !== "PUBLISHED" || data.state === "UNAVAILABLE" || !data.market) return <Unavailable name="Calcutta" />;
  const purchases = data.market.purchases;
  const result = data.result;
  const mine = data.viewer?.playerId;
  const owners = [...new Map(purchases.flatMap(p => p.owners.map(o => [o.player.playerId, o.player]))).values()];
  const selectedPlayer = purchases.find(p => p.player.playerId === params.get("golfer"));
  const selectedOwner = owners.find(o => o.playerId === params.get("owner"));
  const view = params.get("marketView") || "market";
  const owned = purchases.filter(p => p.owners.some(o => o.player.playerId === mine));
  const valueLabel = result?.tournamentComplete ? "Final value" : "Projected value";
  const facts = p => result?.golfers.find(g => g.player.playerId === p.player.playerId);
  const ownerLinks = p => <div className={styles.owners}><span>Ownership</span>{p.owners.map(o => <Link key={o.player.playerId} href={href({ owner: o.player.playerId, golfer: null })}>{o.player.displayName} · {percent(o.ownershipFraction)}</Link>)}</div>;
  const playerCard = p => { const g = facts(p); return <article className={styles.row} key={p.player.playerId}><Link className={styles.identity} href={href({ golfer: p.player.playerId, owner: null })}>{p.player.displayName} →</Link>{g ? <p>Rank {g.rank}{g.tieSize > 1 ? " · Tied" : ""} · {g.totalPoints} points</p> : null}<Metrics values={[["Purchase", money(p.purchasePrice)], [valueLabel, money(g?.tournamentValue)]]} />{ownerLinks(p)}</article>; };
  return <section className={styles.experience} aria-label="Published Calcutta">
    <section className={styles.card}><div className={styles.heading}><span className={styles.eyebrow}>Calcutta</span><span className={styles.pill}>{data.state === "OFFICIAL" ? "Official" : "Published"}</span></div><h2>{result?.tournamentComplete ? "Final results" : "Current market"}</h2><Metrics values={[["Calcutta pot", money(data.market.pot)], ["Published rounds", result?.completedRounds.join(", ") || "Pending"], ...(data.presentation?.financialSummary ? [[result?.tournamentComplete ? "Final pool" : "Projected pool", money(data.presentation.financialSummary.projectedPool)], ["Guaranteed allocation", money(data.presentation.financialSummary.guaranteedAllocation)]] : [])]} />{!result ? <p>Ownership is published. Performance and winnings await official results.</p> : !result.tournamentComplete ? <p>Projected values reflect the published result if the tournament ended today.</p> : null}</section>
    <nav className={styles.tabs} aria-label="Calcutta view">{[["market", "Golf market"], ...(owned.length ? [["mine", "My holdings"]] : []), ["owners", "Owner portfolios"]].map(([key, label]) => <Link key={key} aria-current={view === key ? "page" : undefined} href={href({ marketView: key, golfer: null, owner: null })}>{label}</Link>)}</nav>
    {selectedPlayer ? <section className={styles.card} aria-label="Calcutta player detail"><Link href={href({ golfer: null })}>← Calcutta</Link><h2>{selectedPlayer.player.displayName}</h2>{playerCard(selectedPlayer)}{facts(selectedPlayer) ? <><Metrics values={[["Guaranteed", money(facts(selectedPlayer).guaranteedWinnings)], ["Net profit", money(facts(selectedPlayer).netProfit)], ["ROI", percent(facts(selectedPlayer).roi)]]} /><h3>Round performance</h3>{[1,2,3].map(n => {const r = facts(selectedPlayer).rounds.find(r => r.roundNumber === n); return <article className={styles.row} key={n}><h3>Round {n}{r ? ` · ${formats[r.format]}` : ""}</h3>{r ? <Metrics values={[["Gross", r.grossScore], ["Net", r.netScore], ["Finish", `${r.rank}${r.tieSize > 1 ? " · Tied" : ""}`], ["Points", r.points], ["Guaranteed", money(r.guaranteedWinnings)]]} /> : <p>Official round results are not yet available.</p>}</article>;})}</> : <p>Official round results are not yet available.</p>}</section>
    : selectedOwner ? <section className={styles.card} aria-label="Owner portfolio"><Link href={href({ owner: null })}>← Calcutta</Link><h2>{selectedOwner.displayName}</h2>{(() => {const portfolio = result?.portfolios.find(p => p.owner.playerId === selectedOwner.playerId); return portfolio ? <><p>Portfolio rank {portfolio.rank}</p><Metrics values={[["Purchase cost", money(portfolio.purchaseCost)], ["Guaranteed", money(portfolio.guaranteedWinnings)], [valueLabel, money(portfolio.tournamentValue)], ["Net profit", money(portfolio.netProfit)], ["ROI", percent(portfolio.roi)]]} />{portfolio.investments.map(i => <article key={i.player.playerId} className={styles.row}><Link href={href({ owner: null, golfer: i.player.playerId })}>{i.player.displayName}</Link><p>{percent(i.ownershipFraction)} ownership</p><Metrics values={[["Purchase cost", money(i.purchaseCost)], [valueLabel, money(i.tournamentValue)], ["Guaranteed", money(i.guaranteedWinnings)]]} /></article>)}</> : <p>Portfolio performance awaits official results. Published holdings are shown below.</p>;})()}{!result?.portfolios.some(p => p.owner.playerId === selectedOwner.playerId) ? purchases.filter(p => p.owners.some(o => o.player.playerId === selectedOwner.playerId)).map(playerCard) : null}</section>
    : view === "owners" ? <section className={styles.card}><h2>Owner portfolios</h2>{owners.map(o => <Link className={styles.rowLink} key={o.playerId} href={href({ owner: o.playerId })}>{o.displayName} →</Link>)}</section>
    : <section className={styles.card}><h2>{view === "mine" ? "My holdings" : "Golf market"}</h2>{(view === "mine" ? owned : purchases).map(playerCard)}{view === "mine" && !owned.length ? <p>No published holdings for this participant.</p> : null}</section>}
  </section>;
}

export default function ParticipantSideGames({ product }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setStatus("loading");
    fetch(`/api/leaderboards/${product}?presentation=participant`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unavailable"); return response.json(); })
      .then(payload => { if (!controller.signal.aborted) { if (!payload.data?.contractVersion) throw new Error("Unavailable"); setData(payload.data); setStatus("ready"); } })
      .catch(error => { if (!controller.signal.aborted) { setData(null); setStatus("error"); } });
    return () => controller.abort();
  }, [product, attempt]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const hide = () => { if (document.visibilityState === "hidden") setData(null); else refresh(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", hide);
    const timer = window.setInterval(visible, 60000);
    return () => { window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", hide); window.clearInterval(timer); };
  }, [refresh]);
  const href = changes => { const next = new URLSearchParams(params.toString()); Object.entries(changes).forEach(([key, value]) => value == null ? next.delete(key) : next.set(key, String(value))); return `${pathname}?${next}`; };
  const name = product === "net-skins" ? "Net Skins" : "Calcutta";
  return <div className={styles.shell}><div className={styles.refresh}><span role="status">{status === "loading" ? `Loading ${name}…` : status === "error" ? `${name} could not be refreshed.` : data?.freshness?.stale ? "Published information · awaiting an update" : "Published participant information"}</span><button type="button" onClick={refresh} disabled={status === "loading"}>Refresh</button></div>
    {status === "error" ? <section className={styles.card}><h2>{name} {name === "Net Skins" ? "are" : "is"} temporarily unavailable.</h2><p>Check your connection and try again. Your sign-in has not been changed.</p><button onClick={refresh} type="button">Try again</button></section> : data ? product === "net-skins" ? <NetSkinsParticipant data={data} params={params} href={href} /> : <CalcuttaParticipant data={data} params={params} href={href} /> : null}
  </div>;
}
