'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import AssetImage from '../AssetImage';
import {FOLLOWING_PREFERENCE} from '../../lib/spectator-navigation.js';
import {tournamentDayKey} from '../../lib/tournament-timeline.js';
import {todaysSchedule,homeSchedulePreview,formatHomeDateLabel,formatHomeTime} from '../../lib/home-dashboard.js';
import styles from './following.module.css';

const shown=v=>v===null||v===undefined?'—':v;
const initials=name=>name.split(/\s+/).map(s=>s[0]).slice(0,2).join('');
const nav=[['today','Today'],['tournament','Tournament'],['matches','Matches'],['leaders','Leaders'],['more','More']];
const more=[['schedule','Schedule'],['guide','Guide'],['courses','Courses'],['rules','Rules / Formats'],['players','Players'],['history','History'],['records','Records'],['odds','Published Odds']];
function Avatar({player}){return <AssetImage src={player?.portrait} alt="" width={44} height={44} className={styles.avatar} fallbackClassName={styles.avatar} inferFallback={false} fallback={initials(player?.name||'?')}/>;}
function Badge({children}){return <span className={styles.badge}>{children}</span>;}

export default function FollowingApp({route}){
  const router=useRouter(),query=useSearchParams();
  const [data,setData]=useState(null),[extra,setExtra]=useState(null),[error,setError]=useState(false),[now,setNow]=useState(()=>new Date());
  const [reading,setReading]=useState(false);
  const pending=useRef(new Map());
  const resource=['odds','history','records'].includes(route.page)?route.page:null;
  const refresh=useCallback(async(signal)=>{
    const key=resource||'tournament';
    if(pending.current.has(key)&&!pending.current.get(key)?.aborted)return;
    pending.current.set(key,signal||null);
    setReading(true);
    try{
      const load=async name=>{const r=await fetch('/api/spectator/'+name,{credentials:'omit',cache:'no-store',signal});if(!r.ok)throw Error();return r.json();};
      const [base,other]=await Promise.all([load('tournament'),resource?load(resource):null]);
      setData(base);setExtra(other);setError(false);
    }catch(e){if(e.name!=='AbortError'){
      setError(true);
      // A failed publication read must not retain a previously published Odds snapshot.
      setExtra(null);
      // Scores may remain readable offline; unknown current portrait policy must fail closed.
      setData(previous=>previous?{...previous,players:previous.players.map(p=>({...p,portrait:null}))}:null);
    }}finally{pending.current.delete(key);if(!signal?.aborted)setReading(false);}
  },[resource]);
  useEffect(()=>{
    setExtra(null);
    const control=new AbortController();refresh(control.signal);
    // One bounded refresh per visible minute, no per-match/player/hole polling.
    const timer=setInterval(()=>{setNow(new Date());if(document.visibilityState==='visible')refresh(control.signal);},60000);
    const clock=setInterval(()=>setNow(new Date()),1000);
    const focus=()=>{setNow(new Date());if(document.visibilityState==='visible'){
      fetch('/api/entry',{cache:'no-store',credentials:'same-origin',signal:control.signal}).then(r=>r.json()).then(r=>{
        if(r.session==='participant'||r.session==='recovery')router.replace('/enter');
      }).catch(()=>{});refresh(control.signal);
    }};
    document.addEventListener('visibilitychange',focus);window.addEventListener('focus',focus);
    return()=>{control.abort();clearInterval(timer);clearInterval(clock);document.removeEventListener('visibilitychange',focus);window.removeEventListener('focus',focus);};
  },[refresh,router]);
  const signIn=()=>{try{localStorage.removeItem(FOLLOWING_PREFERENCE);}catch{}router.push('/participant-auth?next=/home');};
  if(!data)return <main className={styles.shell}><h1>The Bagger</h1><p role="status">{error?'Tournament information is temporarily unavailable.':'Opening the tournament…'}</p>{error&&<button onClick={()=>refresh()}>Try Again</button>}</main>;
  const {tournament,teams,players,matches,rounds,leaders}=data;
  const player=id=>players.find(p=>p.id===id);
  const playerLink=id=>{const p=player(id);return p?<Link className={styles.player} href={'/follow/players/'+id} key={id}><Avatar player={p}/><span>{p.name}</span><span aria-hidden="true">›</span></Link>:null;};
  const teamName=side=>teams.find(t=>t.side===side)?.name||'Team';
  function teamScore(){return <section className={`${styles.card} ${styles.teamScore}`} aria-label="Team Score">{teams.map(t=><div key={t.id}>
    <AssetImage src={t.logo} alt="" width={56} height={56} className={styles.teamLogo} inferFallback={false} fallback={initials(t.name)}/>
    <span>{t.name}</span><strong>{shown(t.points)}</strong></div>)}</section>;}
  function matchCard(m){return <article className={styles.card} key={m.id}><div className={styles.row}><span className={styles.eyebrow}>Round {m.round} · Match {m.number}</span><Badge>{m.scoreState}</Badge></div>
    <Link className={styles.matchLink} href={'/follow/matches/'+m.id}><h3>{m.team1.map(id=>player(id)?.name).join(' / ')||'Pairings to come'} <span className={styles.vs}>vs</span> {m.team2.map(id=>player(id)?.name).join(' / ')||'Pairings to come'}</h3>
      <p>{m.course.name} · {m.course.tee}</p><span>{formatHomeTime(m.teeTime)} · {m.format}</span>
      <p>{m.status==='Final'?m.finalResult:m.status==='Live'?m.liveResult:'Not started'}</p></Link></article>;}
  function schedule(items){return <div className={styles.list}>{items.map(e=><article className={styles.schedule} key={e.id}><b>{formatHomeTime(e.startTime)}</b><div><strong>{e.title}</strong><p>{e.location}</p><small>{e.status}{e.minutesUntil>0&&e.state==='upcoming'?' · '+e.countdown:''}</small></div></article>)}</div>;}
  const heading={today:'Today',tournament:'Tournament',matches:'Matches',leaders:'Leaders',players:'Players',more:'More',guide:'Tournament Guide',schedule:'Schedule',courses:'Courses',rules:'Rules / Formats',history:'History',records:'Records',odds:'Published Odds'}[route.page];
  let content=null;
  if(route.page==='today'){
    const day=tournamentDayKey(now,tournament.timeZone),today=todaysSchedule(data.schedule,{now,timeZone:tournament.timeZone}),next=homeSchedulePreview(data.schedule,{now,timeZone:tournament.timeZone});
    content=<><section className={styles.hero}><p className={styles.eyebrow}>{formatHomeDateLabel(day)}</p><h2>{tournament.edition}</h2><p>{tournament.location} · {tournament.dates}</p><Badge>{tournament.status}</Badge></section>{teamScore()}
      {next.kind==='event'?<section className={styles.card} data-testid="next-event"><span className={styles.eyebrow}>{next.eyebrow}</span><h2>{next.event.title}</h2><p>{next.dayLabel} · {formatHomeTime(next.event.startTime)} ET</p><p>{next.event.status}</p>{next.event.minutesUntil>0&&<p>{next.event.countdown}</p>}<Link href="/follow/matches">View matches →</Link></section>:<section className={styles.card}><h2>Tournament overview</h2><p>{tournament.status==='Final'?'The final scorecards and standings are available.':'Follow the rounds and latest match status.'}</p><Link href="/follow/matches">View matches →</Link></section>}
      <section><h2>Rounds</h2><div className={styles.grid}>{rounds.map(r=><Link className={styles.card} href={'/follow/matches?round='+r.number} key={r.number}><h3>{r.label} · {r.format}</h3><p>{r.course.name}</p><Badge>{r.paired?r.status:'Pairings to come'}</Badge></Link>)}</div></section>
      <section data-testid="bottom-schedule"><h2>Today’s Schedule</h2>{today.length?schedule(today):<p>No events scheduled today. <Link href="/follow/schedule">View the tournament schedule.</Link></p>}</section></>;
  }else if(route.page==='tournament')content=<>{teamScore()}<p>{tournament.dates} · {tournament.location}</p>{rounds.map(r=><section className={styles.card} key={r.number}><h2>{r.label} · {r.format}</h2><p>{r.course.name} · {r.course.tee}</p><p>{r.paired?r.status:'Pairings have not been published.'}</p><Link href={'/follow/matches?round='+r.number}>View round matches →</Link></section>)}</>;
  else if(route.page==='matches'&&!route.id){const scope=['1','2','3'].includes(query.get('round'))?query.get('round'):'';content=<><nav className={styles.tabs} aria-label="Match rounds">{[['','All'],['1','R1'],['2','R2'],['3','R3']].map(([v,label])=><Link key={v} aria-current={scope===v?'page':undefined} href={'/follow/matches'+(v?'?round='+v:'')}>{label}</Link>)}</nav><div className={styles.grid}>{matches.filter(m=>!scope||String(m.round)===scope).map(matchCard)}</div></>;}
  else if(route.page==='matches'){
    const m=matches.find(m=>m.id===route.id);content=m?<><button className={styles.back} onClick={()=>router.back()}>← Back</button><section className={styles.card}><div className={styles.row}><h2>Round {m.round} · Match {m.number}</h2><Badge>{m.scoreState}</Badge></div><p>{m.format} · {m.course.name} · {m.course.tee} · {formatHomeTime(m.teeTime)}</p>
      <div className={styles.grid}><div><h3>{teamName(1)}</h3>{m.team1.map(playerLink)}</div><div><h3>{teamName(2)}</h3>{m.team2.map(playerLink)}</div></div><p>{m.status==='Final'?m.finalResult:m.status==='Live'?m.liveResult:'Not started'}</p></section>
      <section className={styles.card}><div className={styles.row}><h2>Scorecard</h2><Badge>Read-only</Badge></div>{m.holes.length?<><p>{m.scoreState==='Locked'?'Scoring is paused. Recorded scores remain visible.':'Scores appear after the server confirms them.'}</p><div className={styles.tableWrap}><table><caption className={styles.visuallyHidden}>Match scorecard · gross and net scores</caption><thead><tr><th>Hole</th><th>Par</th><th>SI</th><th>{teamName(1)}<small>Gross / Net</small></th><th>{teamName(2)}<small>Gross / Net</small></th></tr></thead><tbody>{m.holes.map(h=><tr key={h.number}><th>{h.number}</th><td>{shown(h.par)}</td><td>{shown(h.strokeIndex)}</td><td>{h.team1Gross?.join(', ')||'—'} / {shown(h.team1Net)}</td><td>{h.team2Gross?.join(', ')||'—'} / {shown(h.team2Net)}</td></tr>)}</tbody></table></div></>:<p>The scorecard is not available yet. Pairings and course preparation are still to come.</p>}</section></>:<p>This match is unavailable.</p>;
  }else if(route.page==='leaders'){
    const tab=query.get('tab')==='players'?'players':'score',scope=['1','2','3'].includes(query.get('round'))?query.get('round'):'overall';
    const url=(t,r)=>`/follow/leaders?tab=${t}&round=${r}`;
    const rows=scope==='overall'?leaders.players:leaders.rounds.find(r=>String(r.round)===scope)?.rows||[];
    content=<><nav className={styles.tabs} aria-label="Leaderboards"><Link href={url('score',scope)} aria-current={tab==='score'?'page':undefined}>SCORE</Link><Link href={url('players',scope)} aria-current={tab==='players'?'page':undefined}>PLAYERS</Link></nav><nav className={styles.tabs} aria-label="Leaderboard rounds">{[['overall','Overall'],['1','R1'],['2','R2'],['3','R3']].map(([v,label])=><Link key={v} aria-current={scope===v?'page':undefined} href={url(tab,v)}>{label}</Link>)}</nav>
    {tab==='score'?<section className={styles.card}><h2>{scope==='overall'?'Tournament Score':'Round '+scope}</h2>{(leaders.teams.find(t=>t.scope===scope)?.rows||[]).map(t=><div className={styles.standing} key={t.side}><b>{t.name}</b><strong>{shown(t.points)}</strong><small>{t.record}</small></div>)}</section>:<section className={styles.card}><h2>{scope==='overall'?'Overall':'Round '+scope} Player Leaders</h2>{scope==='3'&&!rounds.find(r=>r.number===3)?.paired?<p>Round 3 pairings have not been published.</p>:rows.length?rows.map((r,i)=><article className={styles.standing} key={r.id}><b>{r.rank??i+1}</b><div>{(r.playerIds||[r.id]).map(playerLink)}{r.entityType==='PAIRING'&&<small>Scramble pair</small>}</div><strong>{shown(r.points)} <small>pts</small></strong></article>):<p>This round has not started. Standings will appear as scores and results become available.</p>}</section>}</>;
  }else if(route.page==='players'&&!route.id)content=<section className={styles.card}>{players.map(p=>playerLink(p.id))}</section>;
  else if(route.page==='players'){
    const p=player(route.id),stats=leaders.players.find(p=>p.id===route.id);content=p?<><button className={styles.back} onClick={()=>router.back()}>← Back</button><section className={`${styles.card} ${styles.profile}`}><Avatar player={p}/><span className={styles.eyebrow}>Player Passport</span><h2>{p.name}</h2><p>{teamName(p.teamSide)}</p><p>{shown(stats?.points)} points · {shown(stats?.wins)} wins · {shown(stats?.halves)} halves</p></section><h2>Tournament matches</h2>{matches.filter(m=>[...m.team1,...m.team2].includes(p.id)).map(matchCard)}</>:<p>This player is unavailable.</p>;
  }else if(route.page==='more')content=<section className={styles.card}>{more.map(([id,label])=><Link className={styles.menuLink} key={id} href={'/follow/'+id}>{label}<span>›</span></Link>)}<button className={styles.signIn} onClick={signIn}>Participant Sign In</button></section>;
  else if(route.page==='schedule')content=Array.from(new Set(data.schedule.map(e=>e.date))).sort().map(date=><section className={styles.card} key={date}><h2>{formatHomeDateLabel(date)}</h2>{schedule(todaysSchedule(data.schedule,{now:new Date(date+'T16:00:00Z'),timeZone:tournament.timeZone}))}</section>);
  else if(route.page==='guide')content=<><section className={styles.hero}><h2>{tournament.edition}</h2><p>{tournament.location} · {tournament.dates}</p></section>{more.filter(([id])=>['schedule','courses','rules'].includes(id)).map(([id,label])=><Link className={`${styles.card} ${styles.menuLink}`} key={id} href={'/follow/'+id}>{label} →</Link>)}</>;
  else if(route.page==='courses')content=data.guide.courses.map(c=><section className={styles.card} key={c.id}><h2>{c.name}</h2><p>{c.location} · {c.designer}</p><p>{c.description}</p></section>);
  else if(route.page==='rules')content=<>{data.guide.formats.map(f=><section className={styles.card} key={f.id}><h2>{f.name}</h2>{f.description&&<p>{f.description}</p>}</section>)}{data.guide.rules.map(r=><section className={styles.card} key={r.title}><h3>{r.title}</h3><p>{r.body}</p></section>)}</>;
  else if(route.page==='odds')content=!extra?<p>{error?'Published Odds are temporarily unavailable.':'Loading published Odds…'}</p>:extra.publication.state!=='PUBLISHED'?<p>Odds have not been published.</p>:<><p>Published revision {extra.publication.revision}</p>{extra.snapshots.map(s=><section className={styles.card} key={s.phase}><h2>{s.label}</h2><p>{s.isCurrent?'Current publication':'Earlier publication'}</p>{s.teams.map(t=><div className={styles.standing} key={t.teamId}><AssetImage src={teams.find(a=>a.id===t.teamId)?.logo} alt="" width={48} height={48} className={styles.teamLogo} inferFallback={false} fallback={initials(t.name)}/><b>{t.name}</b><strong>{t.probability}%<small>{t.americanOdds}</small></strong></div>)}<h3>Player projections</h3>{s.players.map(p=><div className={styles.standing} key={p.playerId}>{playerLink(p.playerId)}<strong>{p.probability}%<small>{p.americanOdds}</small></strong></div>)}</section>)}</>;
  else if(route.page==='history')content=extra?.tournaments?.map(t=><section className={styles.card} key={t.year}><span className={styles.eyebrow}>{t.year}</span><h2>{t.name}</h2><p>{t.status==='Final'?`${t.champion||'Tournament complete'} · ${t.finalScore||'Final score not recorded'}`:t.status}</p><details><summary>Player standings</summary>{t.players.map(p=><div className={styles.standing} key={p.id}><span>{p.name}</span><b>{shown(p.points)} pts</b><small>{shown(p.wins)}–{shown(p.losses)}–{shown(p.halves)}</small></div>)}</details></section>);
  else if(route.page==='records')content=extra?.categories?.map(c=><section className={styles.card} key={c.categoryId}><h2>{c.title||c.label}</h2>{c.records.map(r=><article className={styles.record} key={r.recordId}><h3>{r.title}</h3><strong>{r.valueDisplay||shown(r.value)}</strong>{r.holders?.map((h,i)=><p key={i}>{h.displayName||h.name}</p>)}</article>)}</section>);
  return <main className={styles.shell}><header className={styles.header}><Link href="/follow/today" className={styles.brand}>THE BAGGER</Link><span>FOLLOWING THE TOURNAMENT</span></header><div className={styles.content}><div className={styles.row}><h1>{heading}</h1><button className={styles.back} disabled={reading} onClick={()=>refresh()}>Refresh</button></div>
    {error&&<p className={styles.notice} role="status">Couldn’t refresh. These scores may be out of date. Check your connection and try again.</p>}{content}</div>
    <nav className={styles.bottom} aria-label="Tournament navigation">{nav.map(([id,label])=><Link href={'/follow/'+id} key={id} aria-current={route.page===id?'page':undefined}>{label}</Link>)}</nav></main>;
}
