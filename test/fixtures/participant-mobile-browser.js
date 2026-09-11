import React from "react";
import {createRoot} from "react-dom/client";
import {AppRouterContext} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {PathnameContext} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import OddsCenter from "../../app/odds-center/OddsCenter";
import PublicTournamentGuide from "../../app/tournament-guide/PublicTournamentGuide";
import "../../app/globals.css";
const fixture=window.__fixture;
const mode=new URL(location.href).searchParams.get("mode");
const snapshots=mode==="future"?[fixture.snapshots[0],{...fixture.snapshots[0],phase:"After Round 1",phaseOrder:2,players:fixture.snapshots[0].players.map(p=>({...p,probability:p.probability+0.2}))}]:fixture.snapshots;
createRoot(document.getElementById("root")).render(<AppRouterContext.Provider value={{refresh(){},push(){},replace(){},prefetch(){}}}><PathnameContext.Provider value={mode==="guide"?"/tournament-guide":"/odds-center"}>
  {mode==="guide"?<PublicTournamentGuide content={fixture.content}/>:<OddsCenter snapshots={snapshots} portraits={fixture.portraits}/>}
</PathnameContext.Provider></AppRouterContext.Provider>);
