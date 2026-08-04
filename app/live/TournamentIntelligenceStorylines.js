import styles from "./tournament-intelligence-storylines.module.css";

export default function TournamentIntelligenceStorylines({ stories = [] }) {
  if (!stories.length) return null;
  return <section className={styles.section} aria-labelledby="tournament-storylines-title">
    <header><span>Tournament Intelligence</span><h2 id="tournament-storylines-title">Storylines</h2><p>Why the latest published tournament data matters.</p></header>
    <div>{stories.map((story) => <article key={story.id}><i aria-hidden="true">{story.icon}</i><h3>{story.headline}</h3><p>{story.support}</p></article>)}</div>
  </section>;
}
