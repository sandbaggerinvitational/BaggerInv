import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { followingRoute, hasParticipantCookies } from '../../../lib/spectator-navigation.js';
import FollowingApp from '../FollowingApp';
export const dynamic='force-dynamic';
export default async function FollowingPage({params}){
  if(process.env.SPECTATOR_PWA_ENABLED!=='true') notFound();
  const route=followingRoute((await params).path||[]);
  if(!route)notFound();
  if(hasParticipantCookies((await cookies()).getAll()))redirect('/enter');
  return <FollowingApp route={route}/>;
}
