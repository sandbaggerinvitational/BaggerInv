import OddsCenter from "./OddsCenter";
import { loadCanonicalPlayerPresentation } from "../../lib/canonical-player-presentation-service";
import { applicationPageEnvironment } from "../../lib/production-shadow-request-environment";
import { requirePublishedOddsReadSource } from "../../lib/published-odds-read-source";

// Presentation only: stable-ID photo lookup never modifies the retained snapshot.
// An unavailable portrait projection must not hide otherwise valid published Odds.
export default async function OddsCenterPresentation(props) {
  let portraits = {};
  if (props.snapshots?.length) {
    const env = await applicationPageEnvironment();
    if (requirePublishedOddsReadSource(env).resolved === "supabase") {
      const ids = new Set(props.snapshots.flatMap(snapshot => snapshot.players.map(player => player.id)));
      const presentation = await loadCanonicalPlayerPresentation({ env }).catch(() => null);
      portraits = Object.fromEntries((presentation?.players || [])
        .filter(player => ids.has(player.id)).map(player => [player.id, player.photo]));
    }
  }
  return <OddsCenter {...props} portraits={portraits} />;
}
