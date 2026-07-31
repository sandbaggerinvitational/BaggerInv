import StatusBadge from "./StatusBadge";
import styles from "./match-status-block.module.css";

export default function MatchStatusBlock({
  status,
  result,
  detail,
  meta,
  align = "right",
  prominent = false,
  tone = "light",
  className = "",
}) {
  return (
    <span
      className={[styles.block, className].filter(Boolean).join(" ")}
      data-align={align}
      data-prominent={prominent ? "true" : undefined}
      data-tone={tone}
    >
      <StatusBadge status={status} className={styles.badge} />
      {detail ? <small>{detail}</small> : null}
      {result ? <strong aria-label={`Match result: ${result}`}>{result}</strong> : null}
      {meta ? <em>{meta}</em> : null}
    </span>
  );
}
