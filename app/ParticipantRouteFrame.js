"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import ParticipantAppHeader from "./ParticipantAppHeader";
import { participantAppShellRoute } from "../lib/participant-shell.js";

export default function ParticipantRouteFrame({ children, navigation }) {
  const pathname = usePathname();
  const appRoute = participantAppShellRoute(pathname);

  useEffect(() => {
    document.body.classList.toggle("participant-app-shell-active", appRoute);
    return () => document.body.classList.remove("participant-app-shell-active");
  }, [appRoute]);

  if (!appRoute) return <>
    <div className="pwa-app-scene" data-participant-route={pathname}>{children}</div>
    {navigation}
  </>;

  return <div className="participantAppShell" data-participant-app-shell data-route={pathname}>
    <ParticipantAppHeader />
    <div className="participantAppContent">
      <div className="pwa-app-scene participantRouteScene" data-participant-route={pathname} key={pathname}>{children}</div>
    </div>
    {navigation}
  </div>;
}
