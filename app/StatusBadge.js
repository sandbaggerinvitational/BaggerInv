import { formatStatusLabel } from "../lib/formatters";
import styles from "./status-badge.module.css";

const SUPPORTED = new Set([
  "LIVE",
  "UPCOMING",
  "FINAL",
  "CURRENT MATCH",
  "MATCH COMPLETE",
  "LOCKED",
]);

function resolvedLabel(status, label) {
  const explicit = String(label || "").trim();
  if (explicit) return explicit;
  const source = String(status || "").trim();
  if (/^current match$/i.test(source)) return "Current Match";
  if (/^match complete$/i.test(source)) return "Match Complete";
  return formatStatusLabel(source);
}

export default function StatusBadge({ status, label, className = "", ...props }) {
  const text = resolvedLabel(status, label);
  const key = text.toUpperCase();
  const supported = SUPPORTED.has(key) ? key : formatStatusLabel(status).toUpperCase();
  return (
    <span
      className={[styles.badge, className].filter(Boolean).join(" ")}
      data-status={supported.replaceAll(" ", "-")}
      {...props}
    >
      {supported === "LIVE" ? <i aria-hidden="true" /> : null}
      {supported}
    </span>
  );
}
