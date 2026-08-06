"use client";

import { usePathname } from "next/navigation";

export default function ParticipantRouteFrame({ children }) {
  const pathname = usePathname();
  return <div className="pwa-app-scene" data-participant-route={pathname} key={pathname}>{children}</div>;
}
