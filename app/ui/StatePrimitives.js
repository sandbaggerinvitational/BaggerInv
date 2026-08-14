"use client";

import Link from "next/link";
import styles from "./state-primitives.module.css";

export function Skeleton({ className = "", ...props }) {
  return <span className={`${styles.skeleton} ${className}`.trim()} aria-hidden="true" {...props} />;
}

export function ModuleSkeleton({ label = "Loading section" }) {
  return <section className={styles.module} aria-label={label} aria-busy="true">
    <Skeleton /><Skeleton /><Skeleton />
  </section>;
}

export function ScreenSkeleton({ label = "Opening this screen", cards = 2 }) {
  return <section className={styles.screen} aria-live="polite" aria-busy="true" aria-label={label}>
    <div className={styles.screenHeader} aria-hidden="true"><Skeleton /><Skeleton /></div>
    <div className={styles.screenCards} aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => <Skeleton key={index} />)}
    </div>
  </section>;
}

export function ErrorState({
  title = "We couldn’t open this page.",
  message = "Check your connection and try again.",
  eyebrow = "The Bagger",
  onRetry,
  returnHref,
  returnLabel = "Return Home",
  kind = "page",
  headingLevel = 1,
}) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return <section className={styles.error} data-kind={kind} role={kind === "inline" ? "status" : "alert"}>
    {eyebrow ? <span>{eyebrow}</span> : null}
    <Heading>{title}</Heading>
    <p>{message}</p>
    {onRetry || returnHref ? <div className={styles.actions}>
      {onRetry ? <button type="button" onClick={onRetry}>Try again</button> : null}
      {returnHref ? <Link href={returnHref} data-secondary="true">{returnLabel}</Link> : null}
    </div> : null}
  </section>;
}

export function ConnectionBanner({ state = "offline", children }) {
  if (!children) return null;
  return <aside className={styles.banner} data-state={state} role="status" aria-live="polite">
    <i aria-hidden="true" />{children}
  </aside>;
}
