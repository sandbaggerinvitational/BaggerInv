import Link from "next/link";
import Menu from "./Menu";

export function Header() {
  return (
    <header className="siteHeader">
      <Link href="/" className="brand">
        <img
          src="/images/sandbagger-logo.png"
          alt="Sandbagger Invitational"
        />

        <div>
          <strong>Sandbagger Invitational</strong>
          <span>Established 2017</span>
        </div>
      </Link>

      <Menu />
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      <div>
        <strong>Sandbagger Invitational</strong>
        <span>24 Players • Two Teams • One Trophy</span>
      </div>

      <span>Official Tournament Website</span>
    </footer>
  );
}
