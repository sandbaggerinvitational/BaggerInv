import styles from "./preview-mode.module.css";

export default function PreviewModeBadge({ visible = false }) {
  if (!visible) return null;
  return (
    <div className={styles.badge} role="status">
      Preview · Test Data
    </div>
  );
}
