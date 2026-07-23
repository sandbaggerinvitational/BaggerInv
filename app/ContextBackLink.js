import Link from "next/link";
import styles from "./historical.module.css";

export default function ContextBackLink({ href, label }) {
  return (
    <div className={styles.contextBackLinkRow}>
      <Link className={styles.contextBackLink} href={href}>
        <span aria-hidden="true">←</span>
        <span>{label}</span>
      </Link>
    </div>
  );
}
