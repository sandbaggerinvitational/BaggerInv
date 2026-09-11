import React from 'react';
import {createRoot} from 'react-dom/client';
import ProductionOddsSnapshotReview from '../../app/admin/director/ProductionOddsSnapshotReview';
import OddsCenter from '../../app/odds-center/OddsCenter';
import {OddsPreviewInsights} from '../../app/live/LeaderboardsDashboard';
import {OddsPreviewInsights as ArchivedInsights} from '../../app/live/LeaderboardsDashboard?archive';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {Footer} from '../../app/components';
import {TOURNAMENT_2026_TAGLINE} from '../../lib/site-config';
import directorStyles from '../../app/admin/director/production-director.module.css';
import '../../app/globals.css';
const fixture=window.__fixture, mode=new URL(location.href).searchParams.get('mode')||'insights';
function Preview(){
 const [confirmed,setConfirmed]=React.useState(0);
 const publish=()=>{if(window.confirm('Publish the certified Pre-Tournament Championship Odds snapshot to Production?'))setConfirmed(n=>n+1);};
 return <AppRouterContext.Provider value={{refresh(){},push(){},replace(){},prefetch(){}}}>
  <aside style={{padding:12,background:'#fff1cc',color:'#173c30'}}>LOCAL PREVIEW ONLY — unpublished retained calculation. No Production connections.</aside>
  {mode==='review'?<main className={directorStyles.shell}><section className={directorStyles.panel}><h2>Recent Calculations</h2><div className={directorStyles.jobList}><article><div>Pre-Tournament · SUCCEEDED · 25,000 iterations</div><div className={directorStyles.actionRow}><ProductionOddsSnapshotReview job={fixture.job} busy={false} onPublish={publish}/></div></article></div><output aria-label="Local confirmations">{confirmed}</output></section></main>:mode==='odds-center'?<OddsCenter snapshots={[fixture.snapshot]}/>:mode==='archive'?<ArchivedInsights data={fixture.data}/>:<OddsPreviewInsights data={fixture.data} snapshots={[fixture.snapshot]}/>}
  <section style={{padding:24}} aria-label="Current tagline"><p>{TOURNAMENT_2026_TAGLINE}</p></section><Footer/>
 </AppRouterContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
