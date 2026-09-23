// Public navigation uses the canonical round and presentation sort order, never
// an ID/name convention or the Game Center's tournament-wide previous/next.
export function publicMatchNavigationScope(rows) {
  if (!Array.isArray(rows) || rows.length > 48) throw Error('SPECTATOR_UNAVAILABLE');
  const scope = rows.map(({match, presentation, participants}) => {
    const id = match?.match_id, round = Number(match?.round_number);
    const order = Number(presentation?.match_sort_order);
    const expected = match?.format === 'SI' ? 2 : ['BB', 'SC'].includes(match?.format) ? 4 : 0;
    if (typeof id !== 'string' || !id || !Number.isInteger(round) || round < 1 ||
        !Number.isInteger(order) || order < 1 || !expected || !Array.isArray(participants)) {
      throw Error('SPECTATOR_UNAVAILABLE');
    }
    return {id, round, order, paired: participants.length === expected};
  });
  if (new Set(scope.map(row => row.id)).size !== scope.length) throw Error('SPECTATOR_UNAVAILABLE');
  return scope;
}

export function publicRoundMatchNavigation(raw, scope) {
  const round = Number(raw?.match?.round_number), id = raw?.match?.match_id;
  const matches = scope.filter(row => row.round === round)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const index = matches.findIndex(row => row.id === id);
  // An unpaired/partially paired round has no fabricated scorecard chain.
  // The detail presenter separately validates the selected golfers and scores.
  if (index < 0 || matches.some(row => !row.paired)) throw Error('SPECTATOR_UNAVAILABLE');
  return {
    round_match_index: index + 1,
    round_match_count: matches.length,
    previous_match_id: matches[index - 1]?.id ?? null,
    next_match_id: matches[index + 1]?.id ?? null,
  };
}
