"use client";

import { useEffect, useState } from "react";
import PlayerAvatar from "../PlayerAvatar";
import { rankCalcuttaGolfers, rankCalcuttaPortfolios } from "../../lib/calcutta-leaderboards";
import { formatCalcuttaPoints } from "../../lib/formatters";
import styles from "./calcutta.module.css";

const money = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const signedMoney = (value) => `${Number(value || 0) > 0 ? "+" : ""}${money(value)}`;
const percent = (value) => `${Number(value || 0) > 0 ? "+" : ""}${Math.round(Number(value || 0) * 100)}%`;
const financialState = (value) => ({ "data-positive": Number(value) > 0 || undefined, "data-negative": Number(value) < 0 || undefined });
const payoutPercent = (value) => `${(Number(value || 0) * 100).toFixed(1).replace(/\.0$/, "")}%`;
const roiLabel = (tournamentComplete) => tournamentComplete ? "Final ROI" : "Projected ROI";
const roiHelper = (tournamentComplete) => tournamentComplete ? null : "If the tournament ended today.";
const formatName = (value) => ({ BB: "Best Ball", SC: "Scramble", SI: "Singles" })[String(value || "").trim().toUpperCase()] || value;
const ordinalPlace = (value) => { const number = Number(value); if (!number) return "—"; const suffix = number % 100 >= 11 && number % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th"); return `${number}${suffix} Place`; };
const initials = (name) => String(name || "SBI").split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

function Portrait({ player, large = false }) {
  return <span className={styles.portrait} data-large={large || undefined}><PlayerAvatar player={player} fallbackClassName={styles.portraitFallback} /></span>;
}

function Hero({ model }) {
  const { hero } = model;
  return <section className={styles.hero} aria-label="Calcutta snapshot">
    <header><span>Sandbagger Calcutta</span><h2>{model.tournamentComplete ? "Final Calcutta" : "Current Market"}</h2><p>{model.tournamentComplete ? "Official final results, ownership, and winnings." : "Official results, ownership, and tournament value."}</p></header>
    <div data-current-market={!model.tournamentComplete || undefined}>
      <p className={styles.heroPot}><small>Calcutta Pot</small><strong>{money(model.pot)}</strong>{!model.tournamentComplete ? <span>Total prize pool</span> : null}</p>
      <p><small>{model.tournamentComplete ? "Final Winnings Distributed" : "Guaranteed Distributed"}</small><strong>{money(model.guaranteedDistributed)}</strong><span>{model.tournamentComplete ? "Tournament complete" : model.completedRounds.length ? "Completed rounds" : "Updates after official results"}</span></p>
      <p><small>Remaining Prize Pool</small><strong>{money(model.remainingPrizePool)}</strong><span>Still in play</span></p>
      {hero.highestGuaranteed ? <p><small>Highest Guaranteed Winner</small><strong>{hero.highestGuaranteed.player.name}</strong><span>{money(hero.highestGuaranteed.guaranteedWinnings)} secured</span></p> : null}
      {!model.tournamentComplete && hero.highestUpside ? <p><small>Highest Remaining Upside</small><strong>{hero.highestUpside.player.name}</strong><span>{money(hero.highestUpside.remainingUpside)} projected upside</span></p> : null}
    </div>
  </section>;
}

function GolferSheet({ golfer, close, tournamentComplete }) {
  return <div className={styles.sheetLayer} role="presentation"><button type="button" className={styles.backdrop} onClick={close} aria-label="Close Calcutta golfer details" /><section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="calcutta-golfer-name">
    <header><span>Golfer Investment</span><button type="button" onClick={close} aria-label="Close Calcutta golfer details">×</button></header>
    <div className={styles.identity}><Portrait player={golfer.player} large /><div><h3 id="calcutta-golfer-name">{golfer.player.name}</h3><p><span>Current Rank</span><strong>{golfer.displayRank ? ordinalPlace(golfer.displayRank) : "Pending"}</strong></p></div></div>
    <div className={styles.metrics}><p><small>Purchase Price</small><strong>{money(golfer.purchasePrice)}</strong></p><p><small>Guaranteed Winnings</small><strong>{money(golfer.guaranteedWinnings)}</strong>{!golfer.guaranteedWinnings ? <span className={styles.metricHelper}>Updates after official round results.</span> : null}</p><p><small>{tournamentComplete ? "Final Tournament Value" : "Projected Tournament Value"}</small><strong>{money(golfer.currentPayoutValue)}</strong>{!tournamentComplete ? <span className={styles.metricHelper}>{golfer.currentPayoutValue ? "If the tournament ended today." : "Updates as official results are published."}</span> : null}</p><p><small>{roiLabel(tournamentComplete)}</small><strong {...financialState(golfer.roi)}>{percent(golfer.roi)}</strong>{roiHelper(tournamentComplete) ? <span className={styles.metricHelper}>{roiHelper(tournamentComplete)}</span> : null}</p><p><small>Calcutta Points</small><strong>{formatCalcuttaPoints(golfer.totalPoints)}</strong></p></div>
    <section className={styles.owners}><header><span>{golfer.owners?.length === 1 ? "Owner" : "Owners"}</span></header>{golfer.owners?.length ? golfer.owners.map((owner) => <div key={owner.ownerId}><span><Portrait player={owner.owner} /><strong>{owner.owner.name}</strong></span><b>{payoutPercent(owner.ownership)}</b></div>) : <p>Ownership will appear after the opening auction is published.</p>}</section>
    <section className={styles.roundDetails}><header><span>Round Performance</span></header>{[1,2,3].map((round) => { const result = golfer.rounds[round]; return <article key={round}><h4>Round {round}{result?.format ? ` • ${formatName(result.format)}` : ""}</h4>{result ? <div><p><small>Gross</small><strong>{result.gross}</strong></p><p><small>Net</small><strong>{result.net}</strong></p><p><small>Finish</small><strong>{ordinalPlace(result.place)}{result.tieSize > 1 ? " · Tied" : ""}</strong></p><p><small>Calcutta Points</small><strong>{formatCalcuttaPoints(result.points)}</strong></p><p><small>Guaranteed</small><strong>{money(result.guaranteedWinnings)}</strong></p></div> : <p><strong>Round not yet completed.</strong><span>Results will appear once official.</span></p>}</article>; })}</section>
    <footer><span>{tournamentComplete ? "Final Tournament Value" : "Projected Tournament Value"}</span><strong>{money(golfer.currentPayoutValue)}</strong>{!tournamentComplete ? <small>If the tournament ended today.</small> : null}</footer>
  </section></div>;
}

function OwnerSheet({ portfolio, close, tournamentComplete }) {
  const projectedTotal = portfolio.investments.reduce((sum, investment) => sum + Number(investment.currentPayoutValue || 0), 0);
  const equalContribution = portfolio.investments.length ? 1 / portfolio.investments.length : 0;
  const breakdown = [...portfolio.investments].sort((left, right) => Number(right.currentPayoutValue || 0) - Number(left.currentPayoutValue || 0)).map((investment) => ({
    ...investment,
    contribution: projectedTotal > 0 ? Number(investment.currentPayoutValue || 0) / projectedTotal : equalContribution,
  }));
  return <div className={styles.sheetLayer} role="presentation"><button type="button" className={styles.backdrop} onClick={close} aria-label="Close Calcutta portfolio details" /><section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="calcutta-owner-name">
    <header><span>Owner Portfolio</span><button type="button" onClick={close} aria-label="Close Calcutta portfolio details">×</button></header>
    <div className={styles.identity}><Portrait player={portfolio.owner} large /><div><h3 id="calcutta-owner-name">{portfolio.owner.name}</h3><p><span>Portfolio Rank</span><strong>{ordinalPlace(portfolio.displayRank)}</strong></p></div></div>
    <section className={styles.portfolioSummary} aria-label="Portfolio Summary"><header><span>Portfolio Summary</span></header><div className={styles.metrics}><p><small>Golfers Owned</small><strong>{portfolio.investments.length}</strong></p><p><small>Purchase Cost</small><strong>{money(portfolio.purchaseCost)}</strong></p><p><small>Guaranteed Winnings</small><strong>{money(portfolio.guaranteedWinnings)}</strong>{!portfolio.guaranteedWinnings ? <span className={styles.metricHelper}>Updates after official round results.</span> : null}</p><p><small>{tournamentComplete ? "Final Tournament Value" : "Projected Tournament Value"}</small><strong>{money(portfolio.currentPayoutValue)}</strong>{!tournamentComplete ? <span className={styles.metricHelper}>{portfolio.currentPayoutValue ? "If the tournament ended today." : "Updates as official results are published."}</span> : null}</p><p><small>Net Profit</small><strong {...financialState(portfolio.netProfit)}>{signedMoney(portfolio.netProfit)}</strong></p><p><small>{roiLabel(tournamentComplete)}</small><strong {...financialState(portfolio.roi)}>{percent(portfolio.roi)}</strong>{roiHelper(tournamentComplete) ? <span className={styles.metricHelper}>{roiHelper(tournamentComplete)}</span> : null}</p></div></section>
    <section className={styles.portfolioPerformance} aria-label="Portfolio Performance"><header><span>Portfolio Performance</span></header><div><p><small>Purchase Cost</small><strong>{money(portfolio.purchaseCost)}</strong></p><p><small>Current Value</small><strong>{money(portfolio.currentPayoutValue)}</strong></p><p><small>{roiLabel(tournamentComplete)}</small><strong {...financialState(portfolio.roi)}>{portfolio.roi > 0 ? "▲ " : portfolio.roi < 0 ? "▼ " : ""}{percent(portfolio.roi)}</strong><span>{tournamentComplete ? "Since Opening Auction" : "If the tournament ended today."}</span></p></div></section>
    <section className={styles.investments}><header><span>Investments</span></header>{portfolio.investments.length ? portfolio.investments.map((investment) => <article key={investment.playerId}><span><Portrait player={investment.player} /><b>{investment.player.name}</b><small>{payoutPercent(investment.ownership)} ownership</small></span><span><small>Purchase</small><strong>{money(investment.purchasePrice)}</strong></span><span><small>Guaranteed</small><strong>{money(investment.guaranteedWinnings)}</strong></span><span><small>{tournamentComplete ? "Final" : "Projected"}</small><strong>{money(investment.currentPayoutValue)}</strong></span><span><small>{roiLabel(tournamentComplete)}</small><strong {...financialState(investment.roi)}>{percent(investment.roi)}</strong></span></article>) : <p className={styles.emptyDetail}>Investments will appear after the opening auction is published.</p>}</section>
    <section className={styles.investmentBreakdown} aria-label="Investment Breakdown"><header><span>Investment Breakdown</span></header>{!projectedTotal && breakdown.length ? <p className={styles.breakdownNote}>Projected value will update as official results are published.</p> : null}<div>{breakdown.map((investment) => { const contribution = Math.max(0, Math.min(1, investment.contribution)); const contributionPercent = Math.round(contribution * 100); return <article data-zero={!investment.currentPayoutValue || undefined} key={investment.playerId}><div><span><Portrait player={investment.player} /><strong>{investment.player.name}</strong></span><b>{contributionPercent}%</b></div><i role="progressbar" aria-label={`${investment.player.name} contribution`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={contributionPercent}><span style={{ width: `${contributionPercent}%` }} /></i><p><small>Projected Value</small><strong>{money(investment.currentPayoutValue)}</strong></p></article>; })}</div>{!breakdown.length ? <p className={styles.emptyDetail}>Contribution details will appear after the opening auction is published.</p> : null}</section>
  </section></div>;
}

export default function CalcuttaExperience({ model }) {
  const [tab, setTab] = useState("golfers");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (!selected) return undefined; const escape = (event) => { if (event.key === "Escape") setSelected(null); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [selected]);
  if (!model?.available) return <section className={styles.empty} role="status"><strong>Calcutta</strong><span>Purchases and ownership will appear when the official Calcutta is published.</span></section>;
  const rows = tab === "golfers" ? rankCalcuttaGolfers(model.golfers) : rankCalcuttaPortfolios(model.portfolios);
  return <section className={styles.experience} aria-label="Calcutta">
    <nav className={styles.tabs} aria-label="Calcutta view"><button type="button" aria-pressed={tab === "golfers"} onClick={() => { setTab("golfers"); setSelected(null); }}>Golfers</button><button type="button" aria-pressed={tab === "portfolios"} onClick={() => { setTab("portfolios"); setSelected(null); }}>Portfolios</button></nav>
    <Hero model={model} />
    <section className={styles.board} aria-label={tab === "golfers" ? "Calcutta golfer standings" : "Calcutta portfolio standings"}>
      <header><span>{tab === "golfers" ? "Golfer Market" : "Owner Portfolios"}</span><h3>{tab === "golfers" ? "Current Calcutta Standings" : "Portfolio Leaderboard"}</h3></header>
      <div className={styles.row} data-header="true" data-portfolio={tab === "portfolios" || undefined}><span>Rank</span><span>{tab === "golfers" ? "Golfer" : "Owner"}</span><span>{tab === "golfers" ? "Calcutta Points" : "Cost"}</span><span>{model.tournamentComplete ? "Final" : "Projected"}</span>{tab === "portfolios" ? <span>Net Profit</span> : null}<span>ROI</span></div>
      {rows.map((row) => { const portfolio = tab === "portfolios"; const person = portfolio ? row.owner : row.player; return <button type="button" className={styles.row} data-portfolio={portfolio || undefined} onClick={() => setSelected(row)} aria-label={`Open Calcutta details for ${person.name}`} key={portfolio ? row.ownerId : row.playerId}><strong>{row.displayRank || "—"}</strong><span className={styles.person}><Portrait player={person} /><b>{person.name}</b></span><span>{portfolio ? money(row.purchaseCost) : formatCalcuttaPoints(row.totalPoints)}</span><span>{money(row.currentPayoutValue)}</span>{portfolio ? <span {...financialState(row.netProfit)}>{signedMoney(row.netProfit)}</span> : null}<span {...financialState(row.roi)}>{percent(row.roi)}</span></button>; })}
    </section>
    {model.storylines.length ? <section className={styles.stories} aria-label="Calcutta storylines"><header><span>Tournament Intelligence</span><h3>Calcutta Storylines</h3></header><div>{model.storylines.map((story) => <article key={story.title}><i aria-hidden="true">{story.icon}</i><span><small>{story.title}</small><p>{story.detail}</p></span></article>)}</div></section> : null}
    {selected && tab === "golfers" ? <GolferSheet golfer={selected} tournamentComplete={model.tournamentComplete} close={() => setSelected(null)} /> : null}
    {selected && tab === "portfolios" ? <OwnerSheet portfolio={selected} tournamentComplete={model.tournamentComplete} close={() => setSelected(null)} /> : null}
  </section>;
}
