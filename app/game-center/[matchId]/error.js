"use client";

import Link from "next/link";
import styles from "../game-center.module.css";

export default function GameCenterError({ reset }) {
  return <main className={styles.page}>
    <section className={styles.errorState}>
      <h1>Game Center is unavailable</h1>
      <p>The latest match data could not be loaded.</p>
      <button type="button" onClick={reset}>Try Again</button>
      <Link href="/live">Back to Tournament</Link>
    </section>
  </main>;
}
