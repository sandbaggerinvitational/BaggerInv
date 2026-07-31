import { resolveMatchFilterEmptyState } from "../../lib/live-match-ux";

export default function MatchFilterEmptyState({ filter, round, className }) {
  const state = resolveMatchFilterEmptyState(filter, round);
  return <div className={className} data-empty-reason={state.reason} role="status">
    <strong>{state.title}</strong>
    <span>{state.detail}</span>
  </div>;
}
