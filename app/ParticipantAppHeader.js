"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Menu from "./Menu";
import { participantRouteContext } from "../lib/participant-shell.js";
import { optimizedAssetUrl } from "../lib/asset-paths.js";
import styles from "./participant-app-header.module.css";

function RouteContext({ pathname }) {
  const searchParams = useSearchParams();
  return <strong>{participantRouteContext(pathname, searchParams.toString())}</strong>;
}

export default function ParticipantAppHeader() {
  const pathname = usePathname();
  const compact = pathname === "/score" || pathname.startsWith("/game-center/");

  return <header className={styles.header} data-compact={compact ? "true" : undefined}>
    <Link className={styles.identity} href="/home" aria-label="The Bagger Home">
      <img src={optimizedAssetUrl("/images/sandbagger-logo.png", 96, 82)} alt="" width="36" height="36" />
      <span><small>The Bagger</small><Suspense fallback={<strong>{participantRouteContext(pathname)}</strong>}><RouteContext pathname={pathname} /></Suspense></span>
    </Link>
    <Menu homeHref="/home" appShell />
  </header>;
}
