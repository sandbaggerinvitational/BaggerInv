import Link from "next/link";
import styles from "../game-center.module.css";

export default function GameCenterNotFound() {
  return <main className={styles.page}>
    <section className={styles.errorState}>
      <h1>Match not found</h1>
      <p>This Game Center link does not match an active tournament match.</p>
      <Link href="/live">Back to Tournament</Link>
    </section>
  </main>;
}
