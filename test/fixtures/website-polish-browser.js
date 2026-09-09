import React from 'react';
import {createRoot} from 'react-dom/client';
import PublicMatchCard from '../../app/PublicMatchCard';
import TeamLogoPlate from '../../app/TeamLogoPlate';
import styles from '../../app/historical.module.css';
import '../../app/globals.css';
const teams=[['brysons-logo',"Bryson's Beefcakes","Connor O'Reilly",'8.6'],['philscb-logo',"Phil's Calvity Bombs",'Chris Seekely','10.7']];
const data=window.__fixture;
createRoot(document.getElementById('root')).render(<>
  <section className={styles.content} data-public-history-year><div className={styles.teamSeasonGrid}>{teams.map(([filename,name,captain,average],i)=><a className={styles.teamSeasonCard} id={'team-'+i} href={'#team-'+i} key={filename}>
    <TeamLogoPlate filename={filename} teamName={name} loading="eager"/><div><h3>{name}</h3><p>Captain: {captain}</p><strong>Avg. Team Handicap: {average}</strong><em>View full roster →</em></div>
  </a>)}</div></section>
  <div id="fallback"><TeamLogoPlate filename="missing-test-logo" teamName="Unknown Team" loading="eager"/></div>
  <div id="missing"><TeamLogoPlate teamName="Pending Team"/></div>
  {data.rounds.flatMap(r=>r.matches.map(m=><PublicMatchCard key={m.id} match={m} round={r} tournament={data.tournament}/>))}
</>);
