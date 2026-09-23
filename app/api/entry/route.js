import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hasParticipantCookies } from '../../../lib/spectator-navigation.js';
import { resolveSupabaseParticipantIdentity } from '../../../lib/participant-identity-resolver.js';
export const dynamic='force-dynamic';
export async function GET(request) {
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  if(process.env.SPECTATOR_PWA_ENABLED!=='true') return NextResponse.json({error:'Not found.'},{status:404,headers});
  const store=await cookies();
  if(!hasParticipantCookies(store.getAll())) return NextResponse.json({session:'none'},{headers});
  try {
    await resolveSupabaseParticipantIdentity({request,cookieStore:store,env:process.env});
    return NextResponse.json({session:'participant'},{headers});
  } catch {
    // Existing credentials are never cleared here; neither invalid nor temporary auth failure
    // silently falls through into Following. Participant Sign In owns recovery.
    return NextResponse.json({session:'recovery'},{headers});
  }
}
