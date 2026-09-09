import React from 'react';
import { createRoot } from 'react-dom/client';
import PublicMatchCard from '../../app/PublicMatchCard';
import styles from '../../app/live/live.module.css';
const { current, previous } = window.__fixture;
function Cards({data, id}) {
  return <section id={id}><div className={styles.matchGrid}>{data.rounds.flatMap(round=>round.matches.map(match=>
    <PublicMatchCard key={match.id} match={match} round={round} tournament={data.tournament} />))}</div></section>;
}
createRoot(document.getElementById('root')).render(<><Cards data={current} id="current"/><Cards data={previous} id="previous"/></>);
