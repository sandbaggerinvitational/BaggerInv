'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';

// Decide after navigation, not while Next prefetches /home before OTP verification.
// Participant content retains its existing server authorization and recovery path.
export default function ParticipantEntryGate({children}) {
  const router=useRouter();
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/entry',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(r=>{if(!r.ok)throw Error();return r.json();})
      .then(result=>{
        if(controller.signal.aborted)return;
        if(result.session==='none')router.replace('/enter');
        else setReady(true); // Existing participant Home owns invalid/transient-session recovery.
      }).catch(error=>{if(error.name!=='AbortError')setReady(true);});
    return()=>controller.abort();
  },[router]);
  return ready?children:<main className="mobileHomeMain"><p role="status">Opening The Bagger…</p></main>;
}
