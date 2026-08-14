"use client";

import {
  COMMON_GOLF_SCORES,
  MAX_GOLF_SCORE,
  MIN_GOLF_SCORE,
  scoringKeypadActionLabel,
} from "../../lib/scoring-keypad.js";
import styles from "./score.module.css";

export default function ScoringKeypad({ value, onScore, onAdjust, onClear, disabled = false }) {
  const numeric = Number(value);
  return <section className={styles.keypad} aria-label="Golf score keypad">
    <div className={styles.keypadGrid}>
      {COMMON_GOLF_SCORES.map((score) => <button
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
        className={styles.keypadClear}
        disabled={disabled || value === "" || value == null}
        aria-label={scoringKeypadActionLabel("clear", value)}
        onClick={onClear}
      >Clear</button>
      <button
        type="button"
        disabled={disabled || numeric === MAX_GOLF_SCORE}
        aria-label={scoringKeypadActionLabel("increment", value)}
        onClick={() => onAdjust("increment")}
      >+</button>
    </div>
    <p className={styles.keypadHint}>Tap 2–10, or use − / + for 1 and uncommon scores.</p>
  </section>;
}
