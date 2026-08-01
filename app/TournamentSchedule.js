"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { todaysSchedule } from "../lib/home-dashboard";
import { timelineEventIcon, timelineOptionalText } from "../lib/tournament-timeline";
import styles from "./tournament-command-center.module.css";

function scheduleNow(initialNow, mountedAt) {
  if (!initialNow) return new Date();
  const initial = new Date(initialNow);
  if (Number.isNaN(initial.getTime())) return new Date();
  return new Date(initial.getTime() + Date.now() - mountedAt);
}

export default function TournamentSchedule({ events, timeZone, initialNow = "" }) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => scheduleNow(initialNow, mountedAt));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(scheduleNow(initialNow, mountedAt)), 30_000);
    return () => window.clearInterval(timer);
  }, [initialNow, mountedAt]);
  const items = useMemo(() => todaysSchedule(events, { now, timeZone }), [events, now, timeZone]);

  return (
    <section className={styles.schedule} aria-labelledby="today-schedule-title">
      <header className={styles.sectionHeader}>
        <div><p>Today</p><h2 id="today-schedule-title">Today’s Schedule</h2></div>
        <Link href="/tournament-guide#itinerary">View Tournament Guide</Link>
      </header>
      {items.length ? <ol>{items.map((item) => {
        const subtitle = timelineOptionalText(item.subtitle);
        const location = timelineOptionalText(item.location);
        return (
        <li key={item.id} data-state={item.state} aria-current={item.state === "live" ? "true" : undefined}>
          <time>{item.startTime}</time>
          <span className={styles.scheduleIcon} aria-hidden="true">{timelineEventIcon(item.type)}</span>
          <div>
            <strong>{item.title}</strong>
            {subtitle ? <small>{subtitle}</small> : null}
            {location ? <small className={styles.scheduleLocation}>{location}</small> : null}
          </div>
          {item.state === "live" ? <b>Live</b>
            : item.state === "complete" ? <b className={styles.completed}>✓ Completed</b>
            : item.isNext ? <b className={styles.countdown}>{item.countdown}</b>
            : item.state === "delayed" || item.state === "cancelled" ? <b>{item.state}</b>
            : null}
        </li>
      );})}</ol> : <div className={styles.emptyState}>
        <strong>No additional events scheduled today.</strong>
        <span>View the Tournament Guide for the full itinerary.</span>
      </div>}
    </section>
  );
}
