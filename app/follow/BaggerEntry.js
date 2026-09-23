'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {FOLLOWING_PREFERENCE,entryDestination} from '../../lib/spectator-navigation.js';
import styles from './following.module.css';
export default function BaggerEntry(){
  const router=useRouter(); const [state,setState]=useState('loading');
  useEffect(()=>{let alive=true;fetch('/api/entry',{cache:'no-store',credentials:'same-origin'})
    .then(r=>{if(!r.ok)throw Error();return r.json();}).then(r=>{
      if(!alive)return;let saved='';try{saved=localStorage.getItem(FOLLOWING_PREFERENCE);}catch{}
      const next=entryDestination(r.session,saved);if(next.startsWith('/'))router.replace(next);else setState(next);
    }).catch(()=>alive&&setState('recovery'));return()=>{alive=false;};},[router]);
  function playing(){try{localStorage.removeItem(FOLLOWING_PREFERENCE);}catch{}router.push('/participant-auth?next=/home');}
  function following(){try{localStorage.setItem(FOLLOWING_PREFERENCE,'yes');}catch{}router.push('/follow/today');}
  return <main className={`${styles.shell} ${styles.entry}`}><div className={styles.brand}>THE BAGGER</div><p>The Sandbagger Invitational</p>
    {state==='loading'?<p role="status">Opening The Bagger…</p>:state==='recovery'?<section className={styles.card}>
      <h1>Let’s check your sign-in</h1><p>Your saved sign-in could not be confirmed. Continue to sign in, or try again when you’re connected.</p>
      <button onClick={playing}>Continue to Sign In</button><button className={styles.secondary} onClick={()=>location.reload()}>Try Again</button>
    </section>:<><h1 className={styles.visuallyHidden}>Welcome to The Bagger</h1><button className={styles.choice} onClick={playing}>
      <strong>I’M PLAYING</strong><span>Sign in to your tournament account</span></button>
      <button className={`${styles.choice} ${styles.secondary}`} onClick={following}><strong>I’M FOLLOWING</strong>
        <span>Follow matches, scores &amp; leaderboards</span><small>No account required</small></button></>}
  </main>;
}
