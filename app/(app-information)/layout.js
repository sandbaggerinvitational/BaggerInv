import Link from "next/link";
import { Header, Footer } from "../components";
import styles from "./information.module.css";

export default function AppInformationLayout({ children }) {
  return <>
    <a className={styles.skip} href="#app-information">Skip to content</a>
    <Header />
    <main id="app-information" className={styles.content}>
      <p className={styles.eyebrow}>The Sandbagger Invitational</p>
      {children}
      <nav className={styles.links} aria-label="App information">
        <Link href="/support">Support</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
    </main>
    <Footer variant="app" />
  </>;
}
