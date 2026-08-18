import Link from "next/link";
import styles from "./history-navigation.module.css";

function Destination({ destination, position }) {
  if (!destination?.href || !destination?.label) return null;

  const direction = destination.direction || position;
  const leftArrow = direction === "left";
  const rightArrow = direction === "right";

  return (
    <Link
      aria-label={destination.ariaLabel || destination.label}
      className={styles.destination}
      data-position={position}
      href={destination.href}
      prefetch={destination.prefetch}
    >
      {destination.detail ? (
        <>
          <span>
            {leftArrow ? <i aria-hidden="true">←</i> : null}
            {destination.label}
            {rightArrow ? <i aria-hidden="true">→</i> : null}
          </span>
          <strong>{destination.detail}</strong>
        </>
      ) : (
        <b>
          {leftArrow ? <i aria-hidden="true">←</i> : null}
          {destination.label}
          {rightArrow ? <i aria-hidden="true">→</i> : null}
        </b>
      )}
    </Link>
  );
}

export default function HistoryNavigation({
  ariaLabel = "History navigation",
  left = null,
  center = null,
  right = null,
  placement = "standalone",
  surface,
}) {
  const destinations = [left, center, right].filter(
    (destination) => destination?.href && destination?.label
  );

  if (!destinations.length) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={`${styles.navigation} ${styles[placement] || ""}`}
      data-count={destinations.length}
      data-history-navigation={surface || undefined}
    >
      <Destination destination={left} position="left" />
      <Destination destination={center} position="center" />
      <Destination destination={right} position="right" />
    </nav>
  );
}
