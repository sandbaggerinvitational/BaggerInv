"use client";

import { diningGroups, diningViewModel } from "../../lib/tournament-guide-dining";
import styles from "./tournament-guide.module.css";

function DressCodeIcon() {
  return <svg className={styles.diningDressIcon} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4 4 6l-2 4 3 1.5V20h14v-8.5l3-1.5-2-4-4-2c-.7 1.4-1.7 2-4 2s-3.3-.6-4-2Z" /></svg>;
}

function DiningCardContent({ meal, disclosure }) {
  const openSeating = meal.reservationLabel === "Open Seating";
  const reservationRequired = meal.reservationLabel === "Reservation Required";
  const showState = reservationRequired || disclosure;
  return <>
    <div className={styles.eventIcon} aria-hidden="true">{meal.icon}</div>
    <div className={styles.eventPrimary}>
      {meal.time ? <span className={styles.eventTime}>{meal.time}</span> : null}
      <h3>{meal.meal}</h3>
      {meal.location ? <strong>{meal.location}</strong> : null}
      {meal.dressCode || openSeating ? <div className={styles.diningMeta}>
        {meal.dressCode ? <p className={styles.diningDress}><DressCodeIcon />{meal.dressCode}</p> : null}
        {openSeating ? <span className={styles.openSeating}>{meal.reservationLabel}</span> : null}
      </div> : null}
    </div>
    {showState ? <div className={styles.eventState}>
      {reservationRequired ? <span className={styles.reservationRequired}>{meal.reservationLabel}</span> : null}
      {disclosure ? <span aria-hidden="true">⌄</span> : null}
    </div> : null}
  </>;
}

function DiningCard({ meal }) {
  if (!meal.notes) return <article className={`${styles.itineraryCard} ${styles.diningCard} ${styles.diningCardStatic}`}>
    <div className={styles.diningSummary}><DiningCardContent meal={meal} disclosure={false} /></div>
  </article>;
  return <details className={`${styles.itineraryCard} ${styles.diningCard}`} onClick={(interaction) => {
    if (interaction.target.closest("a, button, summary")) return;
    interaction.currentTarget.open = !interaction.currentTarget.open;
  }}>
    <summary><DiningCardContent meal={meal} disclosure /></summary>
    <div className={`${styles.eventExpanded} ${styles.diningNotes}`}><p>{meal.notes}</p></div>
  </details>;
}

export default function DiningItinerary({ records = [] }) {
  const groups = diningGroups(diningViewModel(records));
  return <div className={`${styles.itineraryDays} ${styles.diningDays}`}>
    {[...groups.entries()].map(([day, meals]) => <section className={styles.itineraryDay} key={day}>
      <header><div><h2>{day}</h2></div></header>
      <div>{meals.map((meal) => <DiningCard meal={meal} key={meal.id} />)}</div>
    </section>)}
  </div>;
}
