import Link from "next/link";
import styles from "./historical.module.css";

export default function ContextBackLink({ href, label, accessibleLabel, prefetch }) {
  return (
    <div className={styles.contextBackLinkRow}>
      <Link
        aria-label={accessibleLabel || undefined}
        className={styles.contextBackLink}
        href={href}
        prefetch={prefetch}
      >
        <span aria-hidden="true">←</span>
        <span>{label}</span>
      </Link>
    </div>
  );
}
