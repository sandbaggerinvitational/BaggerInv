"use client";

import { useEffect, useState } from "react";
import AssetImage from "../AssetImage";
import { playerPhoto } from "../../lib/asset-paths";
import styles from "./calcutta.module.css";

const money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percent = (value) => `${Number(value || 0) >= 0 ? "+" : ""}${Math.round(Number(value || 0) * 100)}%`;
const payoutPercent = (value) => `${(Number(value || 0) * 100).toFixed(1).replace(/\.0$/, "")}%`;
const place = (value) => value ? `#${value}` : "—";
const initials = (name) => String(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

function Portrait({ player, large = false }) {
  return <span className={styles.portrait} data-large={large || undefined}><AssetImage src={playerPhoto(player?.photo)} alt="" fallbackClassName={styles.portraitFallback} fallback={initials(player?.name)} inferFallback={false} /></span>;
}

function Hero({ model }) {
  const { hero } = model;
  return <section className={styles.hero} aria-label="Calcutta snapshot">
    <header><span>Sandbagger Calcutta</span><h2>Current Market</h2><p>Official results, ownership, and tournament value.</p></header>
    <div>
      <p><small>Current Pot</small><strong>{money(model.pot)}</strong></p>
      <p><small>Leading Portfolio</small><strong>{hero.leadingPortfolio?.owner.name || "—"}</strong><span>{hero.leadingPortfolio ? money(hero.leadingPortfolio.currentPayoutValue) : "Awaiting ownership"}</span></p>
      <p><small>Highest ROI</small><strong>{hero.highestRoi?.player.name || "—"}</strong><span>{hero.highestRoi?.purchasePrice ? percent(hero.highestRoi.roi) : "Awaiting results"}</span></p>
      <p><small>Best Investment</small><strong>{hero.bestInvestment?.player.name || "—"}</strong><span>{hero.bestInvestment?.purchasePrice ? `${money(hero.bestInvestment.netProfit)} gain` : "Awaiting results"}</span></p>
    </div>
  </section>;
}

function GolferSheet({ golfer, close }) {
  return <div className={styles.sheetLayer} role="presentation"><button type="button" className={styles.backdrop} onClick={close} aria-label="Close Calcutta golfer details" /><section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="calcutta-golfer-name">
    <header><span>Golfer Investment</span><button type="button" onClick={close} aria-label="Close Calcutta golfer details">×</button></header>
    <div className={styles.identity}><Portrait player={golfer.player} large /><div><h3 id="calcutta-golfer-name">{golfer.player.name}</h3><p>Current rank {place(golfer.rank)}</p></div></div>
    <div className={styles.metrics}><p><small>Purchase Price</small><strong>{money(golfer.purchasePrice)}</strong></p><p><small>Current Value</small><strong>{money(golfer.currentPayoutValue)}</strong></p><p><small>ROI</small><strong data-positive={golfer.roi > 0 || undefined}>{percent(golfer.roi)}</strong></p><p><small>Total Points</small><strong>{golfer.totalPoints.toFixed(2).replace(/\.00$/, "")}</strong></p></div>
    <section className={styles.owners}><header><span>Owners</span></header>{golfer.owners?.length ? golfer.owners.map((owner) => <div key={owner.ownerId}><span><Portrait player={owner.owner} /><strong>{owner.owner.name}</strong></span><b>{payoutPercent(owner.ownership)}</b></div>) : <p>Ownership has not been published.</p>}</section>
    <section className={styles.roundDetails}><header><span>Round Performance</span></header>{[1,2,3].map((round) => { const result = golfer.rounds[round]; return <article key={round}><h4>Round {round}{result?.format ? ` • ${result.format}` : ""}</h4>{result ? <div><p><small>Gross</small><strong>{result.gross}</strong></p><p><small>Net</small><strong>{result.net}</strong></p><p><small>Place</small><strong>{place(result.place)}{result.tieSize > 1 ? " T" : ""}</strong></p><p><small>Points</small><strong>{result.points.toFixed(2).replace(/\.00$/, "")}</strong></p><p><small>Round Payout</small><strong>{payoutPercent(result.payoutPercent)}</strong></p></div> : <p>Results have not been posted.</p>}</article>; })}</section>
    <footer><span>Total Payout</span><strong>{payoutPercent(golfer.totalPayoutPercent)} • {money(golfer.currentPayoutValue)}</strong></footer>
  </section></div>;
}

function OwnerSheet({ portfolio, close }) {
  return <div className={styles.sheetLayer} role="presentation"><button type="button" className={styles.backdrop} onClick={close} aria-label="Close Calcutta portfolio details" /><section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="calcutta-owner-name">
    <header><span>Owner Portfolio</span><button type="button" onClick={close} aria-label="Close Calcutta portfolio details">×</button></header>
    <div className={styles.identity}><Portrait player={portfolio.owner} large /><div><h3 id="calcutta-owner-name">{portfolio.owner.name}</h3><p>Portfolio rank {place(portfolio.rank)}</p></div></div>
    <div className={styles.metrics}><p><small>Purchase Cost</small><strong>{money(portfolio.purchaseCost)}</strong></p><p><small>Current Value</small><strong>{money(portfolio.currentPayoutValue)}</strong></p><p><small>Net Profit</small><strong>{money(portfolio.netProfit)}</strong></p><p><small>ROI</small><strong data-positive={portfolio.roi > 0 || undefined}>{percent(portfolio.roi)}</strong></p></div>
    <section className={styles.investments}><header><span>Investments</span></header>{portfolio.investments.map((investment) => <article key={investment.playerId}><span><Portrait player={investment.player} /><b>{investment.player.name}</b><small>{payoutPercent(investment.ownership)} ownership</small></span><span><small>Cost</small><strong>{money(investment.purchasePrice)}</strong></span><span><small>Value</small><strong>{money(investment.currentPayoutValue)}</strong></span><span><small>ROI</small><strong>{percent(investment.roi)}</strong></span></article>)}</section>
  </section></div>;
}

export default function CalcuttaExperience({ model }) {
  const [tab, setTab] = useState("golfers");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (!selected) return undefined; const escape = (event) => { if (event.key === "Escape") setSelected(null); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [selected]);
  if (!model?.available) return <section className={styles.empty} role="status"><strong>Calcutta</strong><span>Purchases and ownership will appear when the official Calcutta is published.</span></section>;
  const rows = tab === "golfers" ? model.golfers : model.portfolios;
  return <section className={styles.experience} aria-label="Calcutta">
    <Hero model={model} />
    <nav className={styles.tabs} aria-label="Calcutta view"><button type="button" aria-pressed={tab === "golfers"} onClick={() => { setTab("golfers"); setSelected(null); }}>Golfers</button><button type="button" aria-pressed={tab === "portfolios"} onClick={() => { setTab("portfolios"); setSelected(null); }}>Portfolios</button></nav>
    <section className={styles.board} aria-label={tab === "golfers" ? "Calcutta golfer standings" : "Calcutta portfolio standings"}>
      <header><span>{tab === "golfers" ? "Golfer Market" : "Owner Portfolios"}</span><h3>{tab === "golfers" ? "Current Calcutta Standings" : "Portfolio Leaderboard"}</h3></header>
      <div className={styles.row} data-header="true"><span>Rank</span><span>{tab === "golfers" ? "Golfer" : "Owner"}</span><span>{tab === "golfers" ? "Purchase" : "Cost"}</span><span>Value</span><span>ROI</span></div>
      {rows.map((row) => { const person = tab === "golfers" ? row.player : row.owner; const cost = tab === "golfers" ? row.purchasePrice : row.purchaseCost; return <button type="button" className={styles.row} onClick={() => setSelected(row)} aria-label={`Open Calcutta details for ${person.name}`} key={tab === "golfers" ? row.playerId : row.ownerId}><strong>{row.rank}</strong><span className={styles.person}><Portrait player={person} /><b>{person.name}</b></span><span>{money(cost)}</span><span>{money(row.currentPayoutValue)}</span><span data-positive={row.roi > 0 || undefined}>{percent(row.roi)}</span></button>; })}
    </section>
    {model.storylines.length ? <section className={styles.stories} aria-label="Calcutta storylines"><header><span>Tournament Intelligence</span><h3>Calcutta Storylines</h3></header><div>{model.storylines.map((story) => <article key={story.title}><i aria-hidden="true">{story.icon}</i><span><small>{story.title}</small><strong>{story.subject}</strong><p>{story.detail}</p></span></article>)}</div></section> : null}
    {selected && tab === "golfers" ? <GolferSheet golfer={selected} close={() => setSelected(null)} /> : null}
    {selected && tab === "portfolios" ? <OwnerSheet portfolio={selected} close={() => setSelected(null)} /> : null}
  </section>;
}

