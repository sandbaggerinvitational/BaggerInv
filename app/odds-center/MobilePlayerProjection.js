import PlayerAvatar from "../PlayerAvatar";
import { formatChampionshipOdds } from "../../lib/championship-odds-format";
import styles from "./odds.module.css";

export default function MobilePlayerProjection({ players, prior, portraits = {} }) {
  const previous = new Map((prior?.players || []).map(player => [player.id, player]));
  const rank = (player, index) => Number.isInteger(Number(player.rank)) ? Number(player.rank) : index + 1;
  const movement = player => {
    const old = previous.get(player.id);
    if (!old) return null;
    const change = player.probability - old.probability;
    return <p className={styles.movement}>{change > 0 ? "+" : ""}{change.toFixed(1)} percentage points · Previously {old.probability.toFixed(1)}% ({formatChampionshipOdds(old.americanOdds)})</p>;
  };
  const secondary = player => <details className={styles.playerDetails}><summary>Projection details</summary><p>Expected record: {player.expectedRecord}</p><p>Average finish: {player.averageFinish.toFixed(1)}</p></details>;
  const metrics = player => <dl className={styles.playerMetrics}>
    <div><dt>Probability</dt><dd>{player.probability.toFixed(1)}%</dd></div>
    <div><dt>Odds</dt><dd>{formatChampionshipOdds(player.americanOdds)}</dd></div>
    <div><dt>Exp. points</dt><dd>{player.expectedPoints.toFixed(2)}</dd></div>
  </dl>;
  const favorite = players[0];
  if (!favorite) return null;
  return <section className={styles.mobilePlayers} aria-label="Player championship projections">
    <article className={styles.favorite} data-projection-player={favorite.id}>
      <p className={styles.mobileEyebrow}>Tournament Favorite</p>
      <div className={styles.favoriteIdentity}>
        <PlayerAvatar filename={portraits[favorite.id]} name={favorite.name} alt={favorite.name} className={styles.favoritePortrait} fallbackClassName={styles.favoritePortrait} />
        <div><span>#{rank(favorite, 0)} projected</span><h2>{favorite.name}</h2></div>
      </div>
      {metrics(favorite)}{movement(favorite)}{secondary(favorite)}
    </article>
    {players.length > 1 ? <section aria-labelledby="top-contenders-title"><h2 id="top-contenders-title">Top Contenders</h2>
      <div className={styles.contenders}>{players.slice(1, 10).map((player, index) => <article key={player.id} data-projection-player={player.id}>
        <h3><span>#{rank(player, index + 1)}</span> {player.name}</h3>
        {metrics(player)}{movement(player)}{secondary(player)}
      </article>)}</div>
    </section> : null}
    {players.length > 10 ? <section aria-labelledby="remaining-field-title"><h2 id="remaining-field-title">Remaining Field</h2>
      <div className={styles.remainingHead} aria-hidden="true"><span>Rank</span><span>Player</span><span>Prob.</span><span>Odds</span></div>
      {players.slice(10).map((player, index) => <details className={styles.remainingPlayer} key={player.id} data-projection-player={player.id}>
        <summary><span>#{rank(player, index + 10)}</span><b>{player.name}</b><strong>{player.probability.toFixed(1)}%</strong><span>{formatChampionshipOdds(player.americanOdds)}</span></summary>
        <div><p>Expected points: {player.expectedPoints.toFixed(2)}</p><p>Expected record: {player.expectedRecord}</p><p>Average finish: {player.averageFinish.toFixed(1)}</p>{movement(player)}</div>
      </details>)}
    </section> : null}
  </section>;
}
