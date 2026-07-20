export const dynamic="force-dynamic";
import { Header,Footer } from "../components"; import OddsCenter from "./OddsCenter"; import { readOddsSnapshots } from "../../lib/google-sheets-write";
export const metadata={title:"Odds Center | Sandbagger Invitational"};
export default async function Page(){let snapshots=[],error="";try{snapshots=(await readOddsSnapshots()).sort((a,b)=>a.phaseOrder-b.phaseOrder);}catch(e){error=e.message;}return <main><Header/><OddsCenter snapshots={snapshots} error={error}/><Footer/></main>}
