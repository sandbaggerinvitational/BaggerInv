"use client";

import {
  COMMON_GOLF_SCORES,
  MAX_GOLF_SCORE,
  MIN_GOLF_SCORE,
  scoringKeypadActionLabel,
} from "../../lib/scoring-keypad.js";
import styles from "./score.module.css";

export default function ScoringKeypad({ value, onScore, onAdjust, disabled = false }) {
  const numeric = Number(value);
  return <section className={styles.keypad} aria-label="Golf score keypad">
    <div className={styles.keypadGrid}>
      {COMMON_GOLF_SCORES.slice(0, 9).map((score) => <button
        type="button"
        key={score}
        disabled={disabled}
        aria-label={scoringKeypadActionLabel(score, value)}
        data-current={numeric === score ? "true" : undefined}
        onClick={() => onScore(score)}
      >{score}</button>)}
      <button
        type="button"
        disabled={disabled || numeric === MIN_GOLF_SCORE}
        aria-label={scoringKeypadActionLabel("decrement", value)}
        onClick={() => onAdjust("decrement")}
      >−</button>
      <button
        type="button"
        disabled={disabled}
        aria-label={scoringKeypadActionLabel(10, value)}
        data-current={numeric === 10 ? "true" : undefined}
        onClick={() => onScore(10)}
      >10</button>
      <button
        type="button"
        disabled={disabled || numeric === MAX_GOLF_SCORE}
        aria-label={scoringKeypadActionLabel("increment", value)}
        onClick={() => onAdjust("increment")}
      >+</button>
    </div>
    <p className={styles.keypadHint}>Scores 1–10 are one tap. Use − / + for adjustments through 20.</p>
  </section>;
}
