import Link from "next/link";
import Menu from "./Menu";
import { SITE_ESTABLISHED_YEAR } from "../lib/site-config";
import { optimizedAssetUrl } from "../lib/asset-paths";

export function Header({ activeNavigationHref = "", homeHref = "/" } = {}) {
  return (
    <header className="siteHeader">
      <Link href={homeHref} className="brand">
        <img
          src={optimizedAssetUrl("/images/sandbagger-logo.png", 128, 82)}
          alt="Sandbagger Invitational"
        />

        <div>
          <strong>Sandbagger Invitational</strong>
          <span>Established {SITE_ESTABLISHED_YEAR}</span>
        </div>
      </Link>

      <Menu activeNavigationHref={activeNavigationHref} homeHref={homeHref} />
    </header>
  );
}

export function Footer({ variant = "event" } = {}) {
  const appIdentity = variant === "app";
  return (
    <footer data-app-footer={appIdentity ? "true" : undefined}>
      <div>
        <strong>{appIdentity ? "The Bagger" : "Sandbagger Invitational"}</strong>
        <span>24 Players • Two Teams • One Trophy</span>
      </div>

      {appIdentity ? null : <span>Official Tournament Website</span>}
    </footer>
  );
}
