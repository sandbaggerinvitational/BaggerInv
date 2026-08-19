"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import StatusBadge from "../StatusBadge";
import { composeItineraryDetailSections, itineraryGroups, itineraryViewModel } from "../../lib/tournament-guide-schedule";
import styles from "./tournament-guide.module.css";

function SupportingDetails({ event }) {
  const context = [event.roundNumber ? `Round ${event.roundNumber}` : "", event.formatLabel || event.format, event.tee ? `${event.tee} Tees` : ""].filter(Boolean);
  const sections = composeItineraryDetailSections(event);
  return <>
    {context.length ? <p className={styles.scheduleContext}>{context.join(" • ")}</p> : null}
    {sections.length ? <div className={styles.eventNotes}>{sections.map((section) => <section key={section.label}><h4>{section.label}</h4><p>{section.text}</p></section>)}</div> : <p className={styles.eventNotesEmpty}>No additional details published.</p>}
  </>;
}

function LocationActions({ event }) {
  if (!event.courseHref) return null;
  return <div className={styles.locationActions}>
    <Link href={event.courseHref}>View Course</Link>
  </div>;
}

function EventStatus({ event }) {
  if (event.status === "Completed") return <b className={styles.scheduleCompleted}>✓ Completed</b>;
  if (event.status === "Upcoming") return <span className={styles.scheduleUpcoming}><i aria-hidden="true">⏳</i><StatusBadge status="Upcoming" /></span>;
  return <StatusBadge status={event.status} />;
}

function EventCard({ event }) {
  return <details className={`${styles.itineraryCard} ${event.emphasized ? styles.itineraryCardEmphasized : ""}`} onClick={(interaction) => {
    if (interaction.target.closest("a, button, summary")) return;
    interaction.currentTarget.open = !interaction.currentTarget.open;
  }}>
    <summary>
      <div className={styles.eventIcon} aria-hidden="true">{event.icon}</div>
      <div className={styles.eventPrimary}>
        <span className={styles.eventTime}>{event.timeLabel}</span>
        <h3>{event.title}</h3>
        {event.subtitle ? <p>{event.subtitle}</p> : null}
        {event.location ? <strong>{event.location}</strong> : null}
      </div>
      <div className={styles.eventState}>
        <EventStatus event={event} />
        <span aria-hidden="true">⌄</span>
      </div>
    </summary>
    <div className={styles.eventExpanded}>
      <SupportingDetails event={event} />
      <LocationActions event={event} />
    </div>
  </details>;
}

export default function ScheduleItinerary({ records, tournament, rounds, courses, tournamentRules, formatRules, initialNow = "" }) {
  const [initialTime] = useState(() => initialNow ? new Date(initialNow).getTime() : Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const model = useMemo(() => itineraryViewModel({ records, tournament, rounds, courses, tournamentRules, formatRules, now: new Date(initialTime + elapsed) }), [records, tournament, rounds, courses, tournamentRules, formatRules, initialTime, elapsed]);
  const groups = itineraryGroups(model.events);
  return <>
    <div className={styles.itineraryDays}>
      {[...groups.entries()].map(([day, events]) => <section className={styles.itineraryDay} key={day}>
        <header><div><h2>{events[0]?.dayHeading || day}</h2><span>{events[0]?.dateLabel || "Tournament itinerary"}</span></div>{events.some((event) => event.isToday) ? <b>Today</b> : null}</header>
        <div>{events.map((event) => <EventCard event={event} key={event.id} />)}</div>
      </section>)}
    </div>
  </>;
}
