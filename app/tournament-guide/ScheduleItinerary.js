"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ExternalLinkConfirm from "../ExternalLinkConfirm";
import StatusBadge from "../StatusBadge";
import { itineraryGroups, itineraryViewModel } from "../../lib/tournament-guide-schedule";
import styles from "./tournament-guide.module.css";

function SupportingDetails({ event }) {
  const context = [event.roundNumber ? `Round ${event.roundNumber}` : "", event.format, event.tee ? `${event.tee} Tees` : ""].filter(Boolean);
  return <>
    {context.length ? <p className={styles.scheduleContext}>{context.join(" • ")}</p> : null}
    {event.details ? <div className={styles.eventNotes}>{event.details.split(/\n\s*\n/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div> : <p className={styles.eventNotesEmpty}>No additional details published.</p>}
  </>;
}

function LocationActions({ event }) {
  if (!event.courseHref && !event.mapHref) return null;
  return <div className={styles.locationActions}>
    {event.courseHref ? <Link href={event.courseHref}>View Course</Link> : null}
    {event.mapHref ? <ExternalLinkConfirm className={styles.externalLocation} href={event.mapHref}>View Map</ExternalLinkConfirm> : null}
  </div>;
}

function EventCard({ event }) {
  return <details className={`${styles.itineraryCard} ${event.emphasized ? styles.itineraryCardEmphasized : ""}`}>
    <summary>
      <div className={styles.eventIcon} aria-hidden="true">{event.icon}</div>
      <div className={styles.eventPrimary}>
        <span className={styles.eventTime}>{event.timeLabel}</span>
        <h3>{event.title}</h3>
        {event.subtitle ? <p>{event.subtitle}</p> : null}
        {event.location ? <strong>{event.location}</strong> : null}
      </div>
      <div className={styles.eventState}>
        {event.status === "Completed" ? <b className={styles.scheduleCompleted}>✓ Completed</b> : <StatusBadge status={event.status} />}
        <span aria-hidden="true">⌄</span>
      </div>
    </summary>
    <div className={styles.eventExpanded}>
      <SupportingDetails event={event} />
      <LocationActions event={event} />
    </div>
  </details>;
}

export default function ScheduleItinerary({ records, tournament, rounds, courses, initialNow = "" }) {
  const [initialTime] = useState(() => initialNow ? new Date(initialNow).getTime() : Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const model = useMemo(() => itineraryViewModel({ records, tournament, rounds, courses, now: new Date(initialTime + elapsed) }), [records, tournament, rounds, courses, initialTime, elapsed]);
  const groups = itineraryGroups(model.events);
  return <>
    <section className={`${styles.upNext} ${model.complete ? styles.upNextComplete : ""}`} aria-labelledby="up-next-title">
      <div>
        <span>{model.complete ? "Tournament itinerary" : "Up Next"}</span>
        <h2 id="up-next-title">{model.complete ? "Tournament Complete" : model.focus.title}</h2>
        {!model.complete ? <><strong>{model.focus.timeLabel}</strong>{model.focus.location ? <p>{model.focus.location}</p> : null}</> : <p>No future tournament events remain.</p>}
      </div>
      {!model.complete ? <div className={styles.upNextIcon} aria-hidden="true">{model.focus.icon}</div> : null}
    </section>
    <div className={styles.itineraryDays}>
      {[...groups.entries()].map(([day, events]) => <section className={styles.itineraryDay} key={day}>
        <header><span>{events[0]?.dateLabel || "Tournament itinerary"}</span><h2>{day}</h2></header>
        <div>{events.map((event) => <EventCard event={event} key={event.id} />)}</div>
      </section>)}
    </div>
  </>;
}
