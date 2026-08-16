"use client";

import styles from "../historical.module.css";

export default function HistoryBackToTop() {
  const returnToTop = () => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return (
    <div className={styles.historyBackToTop}>
      <button type="button" onClick={returnToTop} aria-label="Back to top of page">
        <span aria-hidden="true">↑</span> Back to Top
      </button>
    </div>
  );
}
