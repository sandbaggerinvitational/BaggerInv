"use client";

import styles from "./score.module.css";

export default function ScoringSyncIndicator({ state = "idle", text = "", actionable = false, onAction }) {
  if (!text || state === "idle") return null;
  const content = <><span aria-hidden="true" />{text}</>;
  if (actionable) return <button type="button" className={styles.scoringSyncIndicator} data-state={state} onClick={onAction}>{content}</button>;
  return <div className={styles.scoringSyncIndicator} data-state={state} role="status" aria-live="polite">{content}</div>;
}
