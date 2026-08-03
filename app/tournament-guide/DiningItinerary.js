"use client";

import { diningGroups, diningViewModel } from "../../lib/tournament-guide-dining";
import styles from "./tournament-guide.module.css";

function DiningCard({ meal }) {
  return <details className={`${styles.itineraryCard} ${styles.diningCard}`} onClick={(interaction) => {
    if (interaction.target.closest("a, button, summary")) return;
    interaction.currentTarget.open = !interaction.currentTarget.open;
  }}>
    <summary>
      <div className={styles.eventIcon} aria-hidden="true">{meal.icon}</div>
      <div className={styles.eventPrimary}>
        <h3>{meal.meal}</h3>
        {meal.time ? <span className={styles.eventTime}>{meal.time}</span> : null}
        {meal.location ? <strong>{meal.location}</strong> : null}
        {meal.dressCode ? <p className={styles.diningDress}><span aria-hidden="true">👕</span>{meal.dressCode}</p> : null}
      </div>
      <div className={styles.eventState}>
        {meal.reservationLabel ? <span className={meal.reservationLabel === "Reservation Required" ? styles.reservationRequired : styles.openSeating}>{meal.reservationLabel}</span> : null}
        <span aria-hidden="true">⌄</span>
      </div>
    </summary>
    {meal.notes ? <div className={`${styles.eventExpanded} ${styles.diningNotes}`}><p>{meal.notes}</p></div> : null}
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
