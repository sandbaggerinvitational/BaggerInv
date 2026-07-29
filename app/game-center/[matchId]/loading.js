import styles from "../game-center.module.css";

export default function GameCenterLoading() {
  return <main className={styles.page}>
    <section className={styles.loading} role="status">
      <span aria-hidden="true" />
      <strong>Opening Game Center…</strong>
      <small>Loading the latest confirmed match data.</small>
    </section>
  </main>;
}
