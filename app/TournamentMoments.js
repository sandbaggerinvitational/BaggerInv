"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./tournament-moments.module.css";

export default function TournamentMoments({ moments = [] }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef(null);
  useEffect(() => { if (index >= moments.length) setIndex(0); }, [index, moments.length]);
  const move = (step) => setIndex((current) => (current + step + moments.length) % moments.length);
  if (!moments.length) return <section className={styles.shell} aria-labelledby="tournament-moments-title"><header><span>Tournament Moments</span><h2 id="tournament-moments-title">The story starts here</h2></header><div className={styles.empty}><strong>No moments yet.</strong><span>Stories will appear as official tournament results are recorded.</span></div></section>;
  const moment = moments[index];
  return <section className={styles.shell} aria-labelledby="tournament-moments-title">
    <header><span>Tournament Moments</span><h2 id="tournament-moments-title">What everyone is talking about</h2></header>
    <article onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { const end = event.changedTouches[0]?.clientX; if (touchStart.current !== null && Number.isFinite(end) && Math.abs(end - touchStart.current) > 45) move(end < touchStart.current ? 1 : -1); touchStart.current = null; }} aria-live="polite">
      <i aria-hidden="true">{moment.icon}</i><div><small>{moment.label}</small><strong>{moment.headline}</strong><p>{moment.detail}</p></div>
    </article>
    {moments.length > 1 ? <nav aria-label="Tournament moment navigation"><button type="button" onClick={() => move(-1)} aria-label="Previous tournament moment">‹</button><span>{index + 1} of {moments.length}</span><button type="button" onClick={() => move(1)} aria-label="Next tournament moment">›</button></nav> : null}
  </section>;
}
