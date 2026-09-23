import { notFound } from 'next/navigation';
import BaggerEntry from '../follow/BaggerEntry';
export const dynamic='force-dynamic';
export default function EntryPage(){
  if(process.env.SPECTATOR_PWA_ENABLED!=='true') notFound();
  return <BaggerEntry/>;
}
