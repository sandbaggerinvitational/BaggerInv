'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {createApprovedMobileEnrollmentClient} from '../../../lib/approved-mobile-enrollment-client.js';
import styles from '../../participant-auth/participant-auth.module.css';
export function ApprovedMobileEnrollmentView({state,token='',onToken=()=>{},onBegin=()=>{},onVerify=()=>{},onResend=()=>{},now=Date.now()}){
 const cooldown=Math.max(0,Math.ceil((state.resendAt-now)/1000));
 return <main className={styles.page}><section className={styles.card} aria-labelledby="mobile-enrollment-title" aria-busy={state.busy}>
  <header className={styles.header}><div className={styles.brand}>The Bagger</div><h1 id="mobile-enrollment-title">Verify approved mobile</h1><p>Email remains your default sign-in method.</p></header>
  {state.maskedPhone?<p className={styles.status}>Approved mobile <strong>{state.maskedPhone}</strong></p>:null}
  {state.phase==='loading'?<p role="status">Checking your approved mobile…</p>:null}
  {state.phase==='eligible'?<div className={styles.form}><p>A verification text will go to the mobile approved by your Tournament Director.</p><button type="button" className={styles.primary} disabled={state.busy} onClick={onBegin}>{state.busy?'Sending…':`Verify approved mobile ${state.maskedPhone}`}</button></div>:null}
  {state.phase==='code'?<form className={styles.form} onSubmit={event=>{event.preventDefault();onVerify();}}>
   <label htmlFor="approved-mobile-code">6-digit code</label><input id="approved-mobile-code" className={styles.otp} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={token} onChange={event=>onToken(event.target.value.replace(/\D/g,'').slice(0,6))} required disabled={state.busy}/>
   <button className={styles.primary} disabled={state.busy||token.length!==6||now>=state.expiresAt}>{state.busy?'Working…':'Verify code'}</button>
   <button type="button" className={styles.secondary} disabled={state.busy||cooldown>0||now>=state.expiresAt} onClick={onResend}>{cooldown>0?`Resend in ${cooldown}s`:'Resend code'}</button>
   <p>Keep this screen open until verification is complete.</p>
  </form>:null}
  {state.message?<p role={state.phase==='blocked'?'alert':'status'} className={state.phase==='blocked'?styles.error:styles.status}>{state.message}</p>:null}
  {state.phase==='email'?<p><Link href="/me">Player / sign out</Link> · <Link href="/participant-auth?next=%2Fme%2Fverify-mobile">Continue with Email</Link></p>:null}
  {state.phase==='verified'?<p><Link href="/me">Return to Player</Link></p>:null}
  <p><Link href="/home">Back to Home</Link></p>
 </section></main>;
}
export default function ApprovedMobileEnrollment(){
 const [state,setState]=useState({phase:'loading',busy:false,resendAt:0});const [token,setToken]=useState('');const [now,setNow]=useState(Date.now());const controller=useRef(null);
 useEffect(()=>{const client=createApprovedMobileEnrollmentClient({onChange:setState});controller.current=client;client.load();const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{controller.current=null;clearInterval(timer);};},[]);
 return <ApprovedMobileEnrollmentView state={state} token={token} onToken={setToken} now={now} onBegin={()=>controller.current?.begin()} onVerify={()=>{const code=token;setToken('');controller.current?.verify(code);}} onResend={()=>{setToken('');controller.current?.resend();}}/>;
}
