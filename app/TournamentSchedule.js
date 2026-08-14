"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { homeSchedulePreview, todaysSchedule } from "../lib/home-dashboard";
import { isGolfTimelineEvent, timelineEventIcon, timelineOptionalText } from "../lib/tournament-timeline";
import StatusBadge from "./StatusBadge";
import styles from "./tournament-command-center.module.css";

function scheduleNow(initialNow, mountedAt) {
  if (!initialNow) return new Date();
  const initial = new Date(initialNow);
  if (Number.isNaN(initial.getTime())) return new Date();
  return new Date(initial.getTime() + Date.now() - mountedAt);
}

export default function TournamentSchedule({ events, timeZone, initialNow = "", compact = false }) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => scheduleNow(initialNow, mountedAt));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(scheduleNow(initialNow, mountedAt)), 30_000);
    return () => window.clearInterval(timer);
  }, [initialNow, mountedAt]);
  const items = useMemo(() => todaysSchedule(events, { now, timeZone }), [events, now, timeZone]);
  const preview = useMemo(() => homeSchedulePreview(events, { now, timeZone }), [events, now, timeZone]);
  const displayedItems = compact && preview.kind === "event" ? [preview.event] : items;
  const compactEyebrow = preview.kind === "event" ? preview.eyebrow : "Coming up";
  const compactTitle = preview.kind === "event" ? preview.dayLabel : "Today";

  return (
    <section className={styles.schedule} data-density={compact ? "next" : "full"} aria-labelledby={compact ? "next-schedule-title" : "today-schedule-title"}>
      <header className={styles.sectionHeader}>
        <div><p>{compact ? compactEyebrow : "Today"}</p><h2 id={compact ? "next-schedule-title" : "today-schedule-title"}>{compact ? compactTitle : "Today’s Schedule"}</h2></div>
        <Link href="/tournament-guide/schedule">{compact ? <>View Full Schedule <span aria-hidden="true">→</span></> : "View Tournament Guide"}</Link>
      </header>
      {(!compact || preview.kind === "event") && displayedItems.length ? <ol>{displayedItems.map((item) => {
        const subtitle = timelineOptionalText(item.subtitle);
        const location = timelineOptionalText(item.location);
        const golfEvent = isGolfTimelineEvent(item.type);
        const statePresentation = golfEvent && item.state === "live" ? <div className={styles.scheduleStatus}><StatusBadge status="Live" /></div>
          : golfEvent && item.state === "complete" ? <div className={styles.scheduleStatus}><StatusBadge status="Final" /></div>
          : golfEvent && item.state === "upcoming" && item.isNext && item.minutesUntil <= 60 ? <b className={styles.countdown}>{item.countdown}</b>
          : golfEvent && item.state === "upcoming" ? <div className={styles.scheduleStatus}><StatusBadge status="Upcoming" /></div>
          : item.state === "live" ? <b>Live</b>
          : item.state === "complete" ? <b className={styles.completed}>✓ Completed</b>
          : item.isNext ? <b className={styles.countdown}>{item.countdown}</b>
          : item.state === "delayed" || item.state === "cancelled" ? <b>{item.state}</b>
          : null;
        return (
        <li key={item.id} data-state={item.state} data-layout={compact ? "event-first" : undefined} aria-current={item.state === "live" ? "true" : undefined}>
          {!compact ? <time>{item.startTime}</time> : null}
          <span className={styles.scheduleIcon} aria-hidden="true">{timelineEventIcon(item.type)}</span>
          <div className={compact ? styles.scheduleEventBody : undefined}>
            <strong>{item.title}</strong>
            {compact ? <small className={styles.scheduleEventMeta}><time>{item.startTime}</time>{location ? <> · {location}</> : null}</small> : null}
            {subtitle ? <small>{subtitle}</small> : null}
            {!compact && location ? <small className={styles.scheduleLocation}>{location}</small> : null}
          </div>
          {statePresentation}
        </li>
      );})}</ol> : compact ? <div className={styles.emptyState} data-density="compact">
        <strong>{preview.title}</strong>
      </div> : <div className={styles.emptyState}>
        <strong>No additional events scheduled today.</strong>
        <span>View the Tournament Guide for the full itinerary.</span>
      </div>}
    </section>
  );
}
