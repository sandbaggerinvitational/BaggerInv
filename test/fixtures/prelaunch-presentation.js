import React from 'react';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import PublicMatchCard from '../../app/PublicMatchCard';
import PlayerAvatar from '../../app/PlayerAvatar';
import OddsCenter from '../../app/odds-center/OddsCenter';
import PublicTournamentGuide from '../../app/tournament-guide/PublicTournamentGuide';
import styles from '../../app/live/live.module.css';
import playerStyles from '../../app/historical.module.css';
import '../../app/globals.css';
export default function Presentation({fixture}) {
  return <AppRouterContext.Provider value={{refresh(){},push(){},replace(){},prefetch(){}}}><PathnameContext.Provider value="/odds-center">
    <section id="scrambles" className={styles.matchGrid}>{fixture.matches.rounds[0].matches.map(match=><PublicMatchCard key={match.id} match={match} round={fixture.matches.rounds[0]} tournament={fixture.matches.tournament}/>)}</section>
    <section id="portraits" style={{display:'flex',flexWrap:'wrap',gap:16,padding:16}}>{fixture.players.map(p=><div key={p.id} id={'portrait-'+p.id} style={{width:140}}><PlayerAvatar filename={p.file} name={p.name} alt={p.name} className={playerStyles.profilePhoto} fallbackClassName={playerStyles.profilePhotoFallback} loading="eager"/><p>{p.name}</p></div>)}</section>
    <section id="odds"><OddsCenter snapshots={fixture.snapshots} portraits={fixture.portraits}/></section>
    <section id="guide"><PublicTournamentGuide content={fixture.content}/></section>
  </PathnameContext.Provider></AppRouterContext.Provider>;
}
